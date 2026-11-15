import { htmlToText } from './bookApi';
import { normalizeText } from '../utils/bookMatching';

/*
 * Vyhledání knihy podle textu (název, autor) v Google Books a Open Library.
 * Používá se pro knihy bez ISBN – text zadá knihovník, nebo ho z fotky
 * obálky odhadne AI (viz aiCover.ts).
 */

const SEARCH_TIMEOUT_MS = 10000;

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
  source: 'Google Books' | 'Open Library' | 'AI odhad';
  /** Jak moc si je AI jistá (jen u výsledků z fotky obálky). */
  aiConfidence?: 'high' | 'medium' | 'low';
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
