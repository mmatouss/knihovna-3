import type { Worker } from 'tesseract.js';
import { htmlToText } from './bookApi';
import { normalizeText } from '../utils/bookMatching';

/*
 * Rozpoznání knihy BEZ ISBN jen podle fotky obálky – zdarma, přímo v telefonu.
 *
 * 1. Tesseract.js (OCR = rozpoznávání textu neuronovou sítí) přečte z fotky text.
 * 2. Největší písmo na obálce bývá název a autor → z něj sestavíme dotaz.
 * 3. Dotaz pošleme do Google Books a Open Library a ukážeme nalezené knihy,
 *    ze kterých knihovník vybere tu správnou.
 */

const SEARCH_TIMEOUT_MS = 10000;

let workerPromise: Promise<Worker> | null = null;

/** OCR pro češtinu a angličtinu (data asi 5 MB se stáhnou při prvním použití). */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const worker = await createWorker(['ces', 'eng'], OEM.LSTM_ONLY);
      // Text je na obálce rozházený (název nahoře, autor dole…).
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })();
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Stáhne OCR dopředu, aby první čtení netrvalo tak dlouho. */
export function preloadCoverOcr(): void {
  getWorker().catch(() => {});
}

/** Jeden rozpoznaný řádek textu z obálky. */
export interface CoverTextLine {
  text: string;
  /** Výška písma v pixelech – větší písmo = důležitější (název, autor). */
  size: number;
}

export interface CoverReadResult {
  /** Navržený dotaz pro vyhledávání (největší text z obálky). */
  query: string;
  /** Všechny čitelné řádky, od největšího písma. */
  lines: CoverTextLine[];
  /** Zmenšená fotka obálky (JPEG jako data URL) – uloží se jako obálka knihy. */
  photoUrl: string;
}

/** Načte fotku do <img>. */
function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Obrázek se nepodařilo načíst.'));
    };
    img.src = url;
  });
}

/** Zmenší obrázek tak, aby delší strana měla nejvýš `maxSide` px. */
function drawScaled(img: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Šedotónová verze; `invert` = světlý text na tmavé obálce převede na tmavý. */
function grayscale(source: HTMLCanvasElement, invert: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(source, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (invert) v = 255 - v;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/** Je řádek „opravdový text“, nebo jen šum z obrázku? */
function cleanLine(text: string): string | null {
  const cleaned = text
    .replace(/[|_~^`"„“”«»<>{}[\]\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const letters = (cleaned.match(/\p{L}/gu) ?? []).length;
  if (letters < 3) return null;
  // Aspoň 70 % znaků (bez mezer) musí být písmena – jinak jde o šum.
  if (letters / cleaned.replace(/\s/g, '').length < 0.7) return null;
  // Odstraníme zbylé značky na začátku a konci řádku.
  return cleaned.replace(/^[^\p{L}\d]+|[^\p{L}\d.!?)]+$/gu, '').trim() || null;
}

async function recognizeLines(worker: Worker, canvas: HTMLCanvasElement): Promise<CoverTextLine[]> {
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const lines: CoverTextLine[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        // Bereme jen slova, kterými si OCR je dost jisté.
        const words = line.words.filter((w) => w.confidence >= 55 && w.text.trim());
        if (words.length === 0) continue;
        const text = cleanLine(words.map((w) => w.text).join(' '));
        if (!text) continue;
        const heights = words.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
        lines.push({ text, size: heights[Math.floor(heights.length / 2)] });
      }
    }
  }
  return lines;
}

/**
 * Přečte text z fotky obálky. Zkouší obraz normálně i v negativu
 * (na obálkách bývá světlé písmo na tmavém pozadí).
 */
export async function readCoverPhoto(file: Blob, onStatus?: (status: string) => void): Promise<CoverReadResult> {
  const img = await loadImage(file);
  const photoUrl = drawScaled(img, 300).toDataURL('image/jpeg', 0.7);

  onStatus?.('Připravuji rozpoznávání textu… (poprvé to chvíli trvá)');
  const worker = await getWorker();
  const base = drawScaled(img, 1600);

  onStatus?.('Čtu text z obálky…');
  const normal = await recognizeLines(worker, grayscale(base, false));
  onStatus?.('Čtu světlý text na tmavém pozadí…');
  const inverted = await recognizeLines(worker, grayscale(base, true));

  // Spojíme oba průchody a odstraníme stejné řádky.
  const seen = new Set<string>();
  const lines = [...normal, ...inverted]
    .sort((a, b) => b.size - a.size)
    .filter((line) => {
      const key = normalizeText(line.text);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { query: buildQuery(lines), lines, photoUrl };
}

/** Dotaz = několik řádků s největším písmem (obvykle název a autor). */
export function buildQuery(lines: CoverTextLine[]): string {
  if (lines.length === 0) return '';
  const biggest = lines[0].size;
  return lines
    .filter((l) => l.size >= biggest * 0.45)
    .slice(0, 3)
    .map((l) => l.text)
    .join(' ')
    .slice(0, 120);
}

/**
 * Dotazy od nejdelšího po nejkratší. OCR často přečte i podtitulek nebo
 * reklamní text, se kterým se nic nenajde – pak zkusíme méně řádků.
 */
export function queryVariants(lines: CoverTextLine[]): string[] {
  const variants = [buildQuery(lines), buildQuery(lines.slice(0, 2)), ...lines.slice(0, 4).map((l) => l.text)];
  return [...new Set(variants.filter((v) => v.trim().length >= 3))];
}

// ---------------------------------------------------------------------------
// Vyhledání knihy podle textu
// ---------------------------------------------------------------------------

/** Kniha nalezená podle textu z obálky. */
export interface BookCandidate {
  id: string;
  title: string;
  authors: string[];
  year?: string;
  publisher?: string;
  pageCount?: number;
  description?: string;
  language?: string;
  categories?: string[];
  coverUrl?: string;
  source: 'Google Books' | 'Open Library';
}

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const GOOGLE_API_KEY: string = import.meta.env?.VITE_GOOGLE_BOOKS_API_KEY ?? '';

async function searchGoogle(query: string): Promise<BookCandidate[]> {
  const key = GOOGLE_API_KEY ? `&key=${encodeURIComponent(GOOGLE_API_KEY)}` : '';
  const data = (await getJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=10&printType=books${key}`
  )) as {
    items?: Array<{
      id: string;
      volumeInfo?: {
        title?: string;
        subtitle?: string;
        authors?: string[];
        publisher?: string;
        publishedDate?: string;
        pageCount?: number;
        description?: string;
        language?: string;
        categories?: string[];
        imageLinks?: Record<string, string>;
      };
    }>;
  };
  return (data.items ?? [])
    .filter((item) => item.volumeInfo?.title)
    .map((item) => {
      const v = item.volumeInfo!;
      const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      return {
        id: `g-${item.id}`,
        title: [v.title, v.subtitle].filter(Boolean).join(': '),
        authors: v.authors ?? [],
        year: v.publishedDate?.slice(0, 4),
        publisher: v.publisher,
        pageCount: v.pageCount || undefined,
        description: v.description ? htmlToText(v.description) : undefined,
        language: v.language,
        categories: v.categories,
        coverUrl: cover?.replace(/^http:/, 'https:').replace('&edge=curl', ''),
        source: 'Google Books' as const,
      };
    });
}

/** Jazykové kódy Open Library → ISO 639-1 (jen ty nejběžnější). */
const OL_LANGUAGES: Record<string, string> = { cze: 'cs', slo: 'sk', eng: 'en', ger: 'de', fre: 'fr', pol: 'pl', rus: 'ru' };

async function searchOpenLibrary(query: string): Promise<BookCandidate[]> {
  const fields = 'key,title,subtitle,author_name,first_publish_year,publisher,number_of_pages_median,cover_i,language,subject';
  const data = (await getJson(
    `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=10&fields=${fields}`
  )) as {
    docs?: Array<{
      key: string;
      title?: string;
      subtitle?: string;
      author_name?: string[];
      first_publish_year?: number;
      publisher?: string[];
      number_of_pages_median?: number;
      cover_i?: number;
      language?: string[];
      subject?: string[];
    }>;
  };
  return (data.docs ?? [])
    .filter((doc) => doc.title)
    .map((doc) => {
      // Open Library vrací „dílo“ se všemi vydáními – nakladatel a jazyk můžou
      // patřit úplně jinému vydání, proto je bereme jen u jednoznačných případů.
      const lang = doc.language?.length === 1 ? doc.language[0] : undefined;
      return {
        id: `ol-${doc.key}`,
        title: [doc.title, doc.subtitle].filter(Boolean).join(': '),
        authors: doc.author_name ?? [],
        year: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        publisher: doc.publisher?.length === 1 ? doc.publisher[0] : undefined,
        pageCount: doc.number_of_pages_median,
        language: lang ? OL_LANGUAGES[lang] : undefined,
        categories: doc.subject?.slice(0, 3),
        coverUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : undefined,
        source: 'Open Library' as const,
      };
    });
}

/**
 * Najde knihy podle textu (název, autor…) v Google Books a Open Library.
 * Výsledky obou zdrojů se střídají a stejné knihy se sloučí.
 * Vyhodí výjimku jen tehdy, když nefunguje ani jeden zdroj.
 */
export async function searchBooksByText(query: string): Promise<BookCandidate[]> {
  const q = query.trim();
  if (!q) return [];
  const [google, openLib] = await Promise.allSettled([searchGoogle(q), searchOpenLibrary(q)]);
  if (google.status === 'rejected' && openLib.status === 'rejected') {
    throw new Error('Vyhledávání nefunguje – zkontrolujte připojení k internetu.', { cause: google.reason });
  }
  const g = google.status === 'fulfilled' ? google.value : [];
  const o = openLib.status === 'fulfilled' ? openLib.value : [];

  const merged: BookCandidate[] = [];
  const byKey = new Map<string, BookCandidate>();
  for (let i = 0; i < Math.max(g.length, o.length); i++) {
    for (const candidate of [g[i], o[i]]) {
      if (!candidate) continue;
      const key = `${normalizeText(candidate.title)}|${normalizeText(candidate.authors[0] ?? '')}`;
      const existing = byKey.get(key);
      if (existing) {
        // Stejná kniha z druhého zdroje → doplníme chybějící údaje.
        existing.year ??= candidate.year;
        existing.publisher ??= candidate.publisher;
        existing.pageCount ??= candidate.pageCount;
        existing.description ??= candidate.description;
        existing.coverUrl ??= candidate.coverUrl;
        existing.language ??= candidate.language;
        continue;
      }
      const copy = { ...candidate };
      byKey.set(key, copy);
      merged.push(copy);
    }
  }
  return merged.slice(0, 12);
}
