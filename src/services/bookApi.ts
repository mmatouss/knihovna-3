import type { Book } from '../types/book';
import { isbnVariants, normalizeIsbn } from '../utils/isbn';

/*
 * Vyhledání údajů o knize podle ISBN.
 *
 * Ptáme se najednou tří databází a údaje z nich SLUČUJEME:
 *   - Obálky knih (české knihy, anotace z českých knihoven) – přes veřejné
 *     CORS proxy, protože web obalkyknih.cz prohlížeči přímý přístup nedovolí,
 *   - Google Books (popis, počet stran, obálka),
 *   - Open Library (počet stran, nakladatel; popis bere z „díla“ /works).
 *
 * Každá databáze často zná jen část údajů (hlavně u českých knih), proto
 * každý údaj bereme z prvního zdroje, který ho má.
 */

const UNKNOWN_AUTHOR = 'Neznámý autor';

/** Jak dlouho čekat na odpověď jedné databáze (ms). */
const API_TIMEOUT_MS = 10000;
/** CORS proxy bývají pomalejší. */
const PROXY_TIMEOUT_MS = 9000;

/** Volitelný klíč ke Google Books API (bez něj Google občas odmítá – chyba 429). */
const GOOGLE_API_KEY: string = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY ?? '';

/** Údaje o knize z jednoho zdroje (všechno nepovinné). */
export interface BookData {
  title?: string;
  authors?: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  pageCount?: number;
  categories?: string[];
  language?: string;
  coverUrl?: string;
}

/** Výsledek dotazu na jeden zdroj: data, „nenalezeno“ (null), nebo chyba (výjimka). */
type SourceName = 'Obálky knih' | 'Google Books' | 'Open Library';

export interface LookupResult {
  book: Book;
  /** Žádná databáze neodpověděla (není internet, výpadek, limit dotazů). */
  offline: boolean;
}

/**
 * Checks whether an ISBN belongs to Czech/Slovak ISBN registration group (978-80 or 979-80 or ISBN-10 starting with 80).
 */
export function isCzechIsbn(isbn: string): boolean {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 13) {
    return clean.startsWith('97880') || clean.startsWith('97980');
  }
  if (clean.length === 10) {
    return clean.startsWith('80');
  }
  return false;
}

/** Zjednodušené rozhraní: vrátí jen knihu. */
export async function fetchBookByIsbn(isbn: string): Promise<Book> {
  return (await lookupBookByIsbn(isbn)).book;
}

/**
 * Najde knihu podle ISBN ve všech databázích a sloučí nalezené údaje.
 * Když se kniha nenajde, vrátí „prázdnou“ knihu s `metadataMissing: true`,
 * kterou knihovník doplní ručně.
 */
export async function lookupBookByIsbn(isbn: string): Promise<LookupResult> {
  const cleanIsbn = normalizeIsbn(isbn);
  if (cleanIsbn.length !== 10 && cleanIsbn.length !== 13) {
    throw new Error('Neplatné číslo ISBN');
  }
  // Knihu ukládáme pod 13místným ISBN (to je i na čárovém kódu).
  const variants = isbnVariants(cleanIsbn);
  const mainIsbn = variants[0] ?? cleanIsbn;
  const isCzech = isCzechIsbn(mainIsbn);

  const settled = await Promise.allSettled([
    fetchFromObalkyKnih(variants),
    fetchFromGoogleBooks(variants),
    fetchFromOpenLibrary(variants),
  ]);
  const names: SourceName[] = ['Obálky knih', 'Google Books', 'Open Library'];
  const results = names.map((name, i) => {
    const r = settled[i];
    if (r.status === 'rejected') console.warn(`${name}: dotaz selhal`, r.reason);
    return { name, data: r.status === 'fulfilled' ? r.value : null, failed: r.status === 'rejected' };
  });

  // U českých knih věříme nejvíc Obálkám knih (české názvy, diakritika, anotace).
  const order: SourceName[] = isCzech
    ? ['Obálky knih', 'Google Books', 'Open Library']
    : ['Google Books', 'Open Library', 'Obálky knih'];
  const found = order
    .map((name) => results.find((r) => r.name === name)!)
    .filter((r): r is { name: SourceName; data: BookData; failed: boolean } => r.data !== null);

  if (found.length === 0) {
    const offline = results.every((r) => r.failed);
    return { book: placeholderBook(mainIsbn, isCzech, offline), offline };
  }

  const { data, sources } = mergeBookData(found);
  return {
    offline: false,
    book: {
      id: mainIsbn + '-' + Date.now(),
      isbn: mainIsbn,
      title: data.title || `Kniha s ISBN ${mainIsbn}`,
      authors: data.authors && data.authors.length > 0 ? data.authors : [UNKNOWN_AUTHOR],
      publisher: data.publisher || '',
      publishedDate: data.publishedDate || '',
      description: data.description || '',
      coverUrl: data.coverUrl || fallbackCoverUrl(mainIsbn, isCzech),
      pageCount: data.pageCount,
      categories: data.categories ?? [],
      language: data.language,
      source: sources.join(', '),
      addedAt: new Date().toISOString(),
      // Bez názvu je záznam k ničemu – necháme ho doplnit ručně.
      metadataMissing: data.title ? undefined : true,
    },
  };
}

/**
 * Sloučí údaje z více zdrojů: každý údaj se vezme z prvního zdroje
 * (v pořadí důvěryhodnosti), který ho má.
 */
export function mergeBookData(found: Array<{ name: string; data: BookData }>): { data: BookData; sources: string[] } {
  const data: BookData = {};
  const used = new Set<string>();
  const take = <K extends keyof BookData>(key: K, has: (v: BookData[K]) => boolean) => {
    for (const { name, data: d } of found) {
      if (has(d[key])) {
        data[key] = d[key];
        used.add(name);
        return;
      }
    }
  };
  const nonEmpty = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
  take('title', nonEmpty);
  take('authors', (v) => Array.isArray(v) && v.some((a) => a && a !== UNKNOWN_AUTHOR));
  take('publisher', nonEmpty);
  take('publishedDate', nonEmpty);
  take('description', nonEmpty);
  take('pageCount', (v) => typeof v === 'number' && v > 0);
  take('categories', (v) => Array.isArray(v) && v.length > 0);
  take('language', nonEmpty);
  take('coverUrl', nonEmpty);
  return { data, sources: found.map((f) => f.name).filter((n) => used.has(n)) };
}

function fallbackCoverUrl(isbn: string, isCzech: boolean): string {
  return isCzech
    ? `https://www.obalkyknih.cz/api/cover?isbn=${isbn}`
    : `https://covers.openlibrary.org/b/isbn/${isbn}-M.jpg?default=false`;
}

function placeholderBook(isbn: string, isCzech: boolean, offline: boolean): Book {
  return {
    id: isbn + '-' + Date.now(),
    isbn,
    title: `Kniha s ISBN ${isbn}`,
    authors: [UNKNOWN_AUTHOR],
    publisher: '',
    publishedDate: '',
    description: offline
      ? 'Databáze knih se nepodařilo kontaktovat (možná chybí internet). Údaje doplňte ručně nebo je zkuste doplnit později.'
      : 'Informace o této knize nebyly nalezeny v databázích. Můžete je upravit ručně.',
    coverUrl: fallbackCoverUrl(isbn, isCzech),
    addedAt: new Date().toISOString(),
    metadataMissing: true,
  };
}

/** Názvy údajů pro zprávu „Doplněno: …“. */
const FIELD_LABELS = {
  authors: 'autor',
  publisher: 'nakladatelství',
  publishedDate: 'rok vydání',
  description: 'popis',
  pageCount: 'počet stran',
  categories: 'žánr',
  language: 'jazyk',
} as const;

/**
 * Doplní do knihy jen ty údaje, které chybí (nic nepřepisuje).
 * Vrátí novou knihu a seznam doplněných údajů (česky).
 */
export function fillMissingFields(target: Book, from: Book): { book: Book; filled: string[] } {
  const book: Book = { ...target };
  const filled: string[] = [];
  const hasAuthors = (b: Book) => b.authors.some((a) => a && a !== UNKNOWN_AUTHOR);

  if (!hasAuthors(book) && hasAuthors(from)) {
    book.authors = from.authors;
    filled.push(FIELD_LABELS.authors);
  }
  if (!book.publisher && from.publisher) {
    book.publisher = from.publisher;
    filled.push(FIELD_LABELS.publisher);
  }
  if (!book.publishedDate && from.publishedDate) {
    book.publishedDate = from.publishedDate;
    filled.push(FIELD_LABELS.publishedDate);
  }
  if (!book.description && from.description) {
    book.description = from.description;
    filled.push(FIELD_LABELS.description);
  }
  if (!book.pageCount && from.pageCount) {
    book.pageCount = from.pageCount;
    filled.push(FIELD_LABELS.pageCount);
  }
  if ((!book.categories || book.categories.length === 0) && from.categories && from.categories.length > 0) {
    book.categories = from.categories;
    filled.push(FIELD_LABELS.categories);
  }
  if (!book.language && from.language) {
    book.language = from.language;
    filled.push(FIELD_LABELS.language);
  }
  return { book, filled };
}

/**
 * Znovu vyhledá knihu podle ISBN a doplní chybějící údaje (počet stran, jazyk…).
 * Údaje, které už kniha má (třeba ručně upravené), se nemění.
 */
export async function enrichBook(book: Book): Promise<{ book: Book; filled: string[] }> {
  if (!book.isbn) return { book, filled: [] };
  const fetched = await fetchBookByIsbn(book.isbn);
  if (fetched.metadataMissing) return { book, filled: [] };
  const result = fillMissingFields(book, fetched);
  if (result.filled.length > 0 && fetched.source) {
    const sources = new Set([...(book.source ?? '').split(', '), ...fetched.source.split(', ')].filter(Boolean));
    result.book.source = [...sources].join(', ');
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pomocné funkce
// ---------------------------------------------------------------------------

/** fetch s časovým limitem. Chybový stav HTTP (např. 429, 500) vyhodí výjimku. */
async function fetchJson(url: string, timeoutMs = API_TIMEOUT_MS): Promise<unknown> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res.json();
}

async function fetchWithTimeout(url: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onAbort);
  }
}

const HTML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Odstraní HTML značky a převede entity (&amp; → &) na znaky. */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? m;
    })
    .replace(/[ \t\r\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Z data jako „October 1, 1988“ nebo „[2021]“ necháme jen rok, jinak text beze změny. */
function cleanDate(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const trimmed = date.trim();
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(trimmed)) return trimmed;
  const year = trimmed.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
  return year ? year[1] : trimmed;
}

/** Jazykové kódy Open Library (MARC) → ISO 639-1. */
const MARC_LANGUAGES: Record<string, string> = {
  cze: 'cs', slo: 'sk', eng: 'en', ger: 'de', fre: 'fr', spa: 'es', ita: 'it', pol: 'pl', rus: 'ru', hun: 'hu',
  ukr: 'uk', lat: 'la', dut: 'nl', swe: 'sv', nor: 'no', dan: 'da', fin: 'fi', por: 'pt', jpn: 'ja', chi: 'zh',
};

// ---------------------------------------------------------------------------
// Google Books
// ---------------------------------------------------------------------------

interface GoogleVolume {
  selfLink?: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    printedPageCount?: number;
    categories?: string[];
    language?: string;
    imageLinks?: Record<string, string>;
    industryIdentifiers?: Array<{ type: string; identifier: string }>;
  };
}

function googleUrl(url: string): string {
  return GOOGLE_API_KEY ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(GOOGLE_API_KEY)}` : url;
}

export async function fetchFromGoogleBooks(variants: string[]): Promise<BookData | null> {
  let volume: GoogleVolume | undefined;
  for (const isbn of variants) {
    const data = (await fetchJson(
      googleUrl(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=5`)
    )) as { totalItems?: number; items?: GoogleVolume[] } | null;
    const items = data?.items ?? [];
    if (items.length === 0) continue;
    // Přednost má svazek, který má opravdu naše ISBN.
    volume =
      items.find((it) => it.volumeInfo?.industryIdentifiers?.some((id) => normalizeIsbn(id.identifier) === isbn)) ??
      items[0];
    break;
  }
  if (!volume?.volumeInfo) return null;

  let info = volume.volumeInfo;
  // Výsledek hledání někdy neobsahuje popis nebo počet stran – detail svazku je mívá.
  if ((!info.description || !info.pageCount) && volume.selfLink) {
    try {
      const detail = (await fetchJson(googleUrl(volume.selfLink))) as GoogleVolume | null;
      // Údaje z detailu doplní jen to, co ve výsledku hledání chybělo.
      if (detail?.volumeInfo) info = { ...detail.volumeInfo, ...stripEmpty(info) };
    } catch (err) {
      console.warn('Google Books: detail svazku se nenačetl', err);
    }
  }

  const cover = info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail;
  return {
    title: [info.title, info.subtitle].filter(Boolean).join(': ') || undefined,
    authors: info.authors,
    publisher: info.publisher,
    publishedDate: cleanDate(info.publishedDate),
    description: info.description ? htmlToText(info.description) : undefined,
    pageCount: info.pageCount || info.printedPageCount || undefined,
    categories: info.categories,
    language: info.language,
    coverUrl: cover ? cover.replace(/^http:/, 'https:').replace('&edge=curl', '') : undefined,
  };
}

function stripEmpty<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== '' && v !== 0)) as Partial<T>;
}

// ---------------------------------------------------------------------------
// Open Library
// ---------------------------------------------------------------------------

interface OpenLibraryData {
  title?: string;
  subtitle?: string;
  authors?: Array<{ name: string }>;
  publishers?: Array<{ name: string }>;
  publish_date?: string;
  number_of_pages?: number;
  subjects?: Array<{ name: string }>;
  cover?: { small?: string; medium?: string; large?: string };
}

interface OpenLibraryEdition {
  title?: string;
  publishers?: string[];
  publish_date?: string;
  number_of_pages?: number;
  description?: string | { value: string };
  languages?: Array<{ key: string }>;
  works?: Array<{ key: string }>;
  authors?: Array<{ key: string }>;
}

function olText(value: string | { value: string } | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.value;
}

export async function fetchFromOpenLibrary(variants: string[]): Promise<BookData | null> {
  const bibkeys = variants.map((v) => `ISBN:${v}`).join(',');
  const [dataRes, editionRes] = await Promise.allSettled([
    fetchJson(`https://openlibrary.org/api/books?bibkeys=${bibkeys}&format=json&jscmd=data`) as Promise<Record<
      string,
      OpenLibraryData
    > | null>,
    fetchOpenLibraryEdition(variants),
  ]);
  if (dataRes.status === 'rejected' && editionRes.status === 'rejected') throw dataRes.reason;

  const all = dataRes.status === 'fulfilled' ? dataRes.value ?? {} : {};
  const item = variants.map((v) => all[`ISBN:${v}`]).find(Boolean);
  const edition = editionRes.status === 'fulfilled' ? editionRes.value : null;
  if (!item && !edition) return null;

  // Popis bývá u „díla“ (work), ne u konkrétního vydání.
  let description = olText(edition?.description);
  let subjects: string[] | undefined = item?.subjects?.map((s) => s.name);
  const workKey = edition?.works?.[0]?.key;
  if (workKey && (!description || !subjects)) {
    try {
      const work = (await fetchJson(`https://openlibrary.org${workKey}.json`)) as {
        description?: string | { value: string };
        subjects?: string[];
      } | null;
      description = description || olText(work?.description);
      subjects = subjects || work?.subjects;
    } catch (err) {
      console.warn('Open Library: dílo se nenačetlo', err);
    }
  }

  let authors = item?.authors?.map((a) => a.name);
  if (!authors?.length && edition?.authors?.length) {
    authors = await fetchOpenLibraryAuthors(edition.authors.map((a) => a.key));
  }

  const langCode = edition?.languages?.[0]?.key.split('/').pop();
  const title = item?.title || edition?.title;
  return {
    title: title ? [title, item?.subtitle].filter(Boolean).join(': ') : undefined,
    authors,
    publisher: item?.publishers?.map((p) => p.name).join(', ') || edition?.publishers?.join(', '),
    publishedDate: cleanDate(item?.publish_date || edition?.publish_date),
    // Open Library přidává k popisu odkazy a poznámky za „----------“.
    description: description ? description.split(/\r?\n-{5,}/)[0].trim() : undefined,
    pageCount: item?.number_of_pages || edition?.number_of_pages,
    categories: subjects?.slice(0, 3),
    language: langCode ? MARC_LANGUAGES[langCode] : undefined,
    coverUrl: item?.cover?.medium || item?.cover?.small,
  };
}

/** Vydání podle ISBN (https://openlibrary.org/isbn/…json) – obsahuje odkaz na dílo s popisem. */
async function fetchOpenLibraryEdition(variants: string[]): Promise<OpenLibraryEdition | null> {
  for (const isbn of variants) {
    const edition = (await fetchJson(`https://openlibrary.org/isbn/${isbn}.json`)) as OpenLibraryEdition | null;
    if (edition) return edition;
  }
  return null;
}

async function fetchOpenLibraryAuthors(keys: string[]): Promise<string[] | undefined> {
  const names = await Promise.all(
    keys.slice(0, 3).map(async (key) => {
      try {
        const author = (await fetchJson(`https://openlibrary.org${key}.json`)) as { name?: string } | null;
        return author?.name;
      } catch {
        return undefined;
      }
    })
  );
  const valid = names.filter((n): n is string => Boolean(n));
  return valid.length ? valid : undefined;
}

// ---------------------------------------------------------------------------
// Obálky knih
// ---------------------------------------------------------------------------

/** Veřejné CORS proxy – zkoušíme je souběžně, vyhrává první úspěšná odpověď. */
const CORS_PROXIES = [
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchFromObalkyKnih(variants: string[]): Promise<BookData | null> {
  const isbn = variants[0];
  const targetUrl = `https://www.obalkyknih.cz/view?isbn=${isbn}`;
  const stopOthers = new AbortController();

  // Každá proxy vrátí stránku; `null` = stránka říká „knihu nemáme“.
  const attempts = CORS_PROXIES.map(async (proxy) => {
    const res = await fetchWithTimeout(proxy(targetUrl), PROXY_TIMEOUT_MS, stopOthers.signal);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    if (!html.includes('obalkyknih')) throw new Error('Proxy nevrátila stránku Obálek knih');
    return parseObalkyKnihHtml(html, isbn);
  });

  try {
    return await Promise.any(attempts);
  } catch (err) {
    // Všechny proxy selhaly → výjimka (= zdroj nedostupný, ne „nenalezeno“).
    throw new Error('Obálky knih: žádná CORS proxy neodpověděla', { cause: err });
  } finally {
    stopOthers.abort();
  }
}

/**
 * Autoři z Obálek knih: buď „Tomáš Svoboda, Ludmila Hénková“, nebo
 * (u jednoho autora) „Čech, Pavel“ → převedeme na „Pavel Čech“.
 */
export function parseObalkyAuthors(text: string): string[] {
  const parts = text
    .split(/\s*[,;]\s*/)
    .map((a) => a.trim())
    .filter(Boolean);
  const singleWords = parts.every((p) => !/\s/.test(p));
  if (parts.length >= 2 && parts.length % 2 === 0 && singleWords) {
    const names: string[] = [];
    for (let i = 0; i < parts.length; i += 2) names.push(`${parts[i + 1]} ${parts[i]}`);
    return names;
  }
  return parts;
}

/**
 * Přečte údaje ze stránky knihy na obalkyknih.cz.
 * Vrací null, když stránka knihu nezná („Tuto knihu ještě nemáme v databázi!“).
 */
export function parseObalkyKnihHtml(html: string, isbn: string): BookData | null {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleMatch ? htmlToText(titleMatch[1]) : '';
  // Stránka „Tuto knihu ještě nemáme v databázi!“ nadpis h1 nemá.
  if (!title) return null;

  // Údaj ve tvaru „<b>Autor: </b>Tomáš Svoboda, Ludmila Hénková<br/>“
  const field = (label: string) => {
    const m = html.match(new RegExp(`<b>\\s*${label}:\\s*</b>([\\s\\S]*?)<br`, 'i'));
    return m ? htmlToText(m[1]) : '';
  };

  const authors = parseObalkyAuthors(field('Autor'));

  // Citace: „SVOBODA, Tomáš. Název. Prague: Albatros, [2021]. 47 stran.“
  const citationMatch = html.match(/<b>\s*Citace\s*<\/b>[^<]*<br\s*\/?>([\s\S]*?)<br/i);
  const citation = citationMatch ? htmlToText(citationMatch[1]) : '';
  const imprint = citation.match(/([^.:]+):\s*([^,:]+?),\s*\[?(?:c|©|℗)?\s*(\d{4})/);
  const pages = citation.match(/(\d+)\s*(?:stran|stránek|stránky|s\.|pages|p\.)/i);

  let year = field('Rok').match(/\d{4}/)?.[0];
  if (!year && imprint) year = imprint[3];

  // Anotace: odstavec za nadpisem „Anotace“ (bez tlačítka „Upravit anotaci“).
  let description: string | undefined;
  const annotationBlock = html.match(/<h3[^>]*>\s*Anotace\s*<\/h3>([\s\S]*?)(?:Zdroj anotace|<h3|<!--)/i);
  if (annotationBlock) {
    const paragraphs = [...annotationBlock[1].matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => htmlToText(m[1]))
      .filter((t) => t && !/Upravit anotaci/i.test(t));
    const text = paragraphs.join('\n\n').trim();
    if (text.length > 10) description = text;
  }

  return {
    title,
    authors: authors.length ? authors : undefined,
    publisher: imprint ? imprint[2].trim() : undefined,
    publishedDate: year,
    description,
    pageCount: pages ? parseInt(pages[1], 10) : undefined,
    coverUrl: `https://www.obalkyknih.cz/api/cover?isbn=${isbn}`,
  };
}
