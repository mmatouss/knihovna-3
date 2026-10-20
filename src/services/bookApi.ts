import type { Book } from '../types/book';
import { normalizeIsbn } from '../utils/isbn';

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

/**
 * Fetches book metadata by ISBN using Obálky knih (via public CORS proxies with fallback) for Czech titles,
 * then Google Books API, and Open Library API as fallback.
 */
export async function fetchBookByIsbn(isbn: string): Promise<Book> {
  const cleanIsbn = normalizeIsbn(isbn);
  if (!cleanIsbn) {
    throw new Error('Neplatné číslo ISBN');
  }

  const obalkyCoverUrl = `https://www.obalkyknih.cz/api/cover?isbn=${cleanIsbn}`;
  const openLibCoverUrl = `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;
  const isCzech = isCzechIsbn(cleanIsbn);

  // Fetch concurrently from Obálky knih, Google Books, and Open Library
  const [obalkyRes, googleRes, openLibRes] = await Promise.allSettled([
    fetchFromObalkyKnih(cleanIsbn),
    fetchFromGoogleBooks(cleanIsbn, isCzech, obalkyCoverUrl, openLibCoverUrl),
    fetchFromOpenLibrary(cleanIsbn, isCzech, obalkyCoverUrl, openLibCoverUrl),
  ]);

  const obalkyBook = obalkyRes.status === 'fulfilled' ? obalkyRes.value : null;
  const googleBook = googleRes.status === 'fulfilled' ? googleRes.value : null;
  const openLibBook = openLibRes.status === 'fulfilled' ? openLibRes.value : null;

  // Order of preference
  if (isCzech) {
    if (obalkyBook) return obalkyBook;
    if (googleBook) return googleBook;
    if (openLibBook) return openLibBook;
  } else {
    if (googleBook) return googleBook;
    if (openLibBook) return openLibBook;
    if (obalkyBook) return obalkyBook;
  }

  // 4. Fallback: Create placeholder book for manual metadata entry by librarian
  return {
    id: cleanIsbn + '-' + Date.now(),
    isbn: cleanIsbn,
    title: `Kniha s ISBN ${cleanIsbn}`,
    authors: ['Neznámý autor'],
    publisher: '',
    publishedDate: '',
    description: 'Informace o této knize nebyly nalezeny v databázích. Můžete je upravit ručně.',
    coverUrl: isCzech ? obalkyCoverUrl : openLibCoverUrl,
    addedAt: new Date().toISOString(),
  };
}

async function fetchFromGoogleBooks(
  cleanIsbn: string,
  isCzech: boolean,
  obalkyCoverUrl: string,
  openLibCoverUrl: string
): Promise<Book | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.totalItems > 0 && data.items && data.items.length > 0) {
        const item = data.items[0].volumeInfo;
        const coverUrl = isCzech
          ? obalkyCoverUrl
          : (item.imageLinks?.thumbnail || item.imageLinks?.smallThumbnail || openLibCoverUrl);

        return {
          id: cleanIsbn + '-' + Date.now(),
          isbn: cleanIsbn,
          title: item.title || 'Bez názvu',
          authors: item.authors || ['Neznámý autor'],
          publisher: item.publisher || 'Neznámé nakladatelství',
          publishedDate: item.publishedDate || '',
          description: item.description || '',
          coverUrl: coverUrl.replace('http://', 'https://'),
          pageCount: item.pageCount || undefined,
          categories: item.categories || [],
          addedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('Google Books API warning:', err);
  }
  return null;
}

async function fetchFromOpenLibrary(
  cleanIsbn: string,
  isCzech: boolean,
  obalkyCoverUrl: string,
  openLibCoverUrl: string
): Promise<Book | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const key = `ISBN:${cleanIsbn}`;
      if (data[key]) {
        const item = data[key];
        const authors = item.authors ? item.authors.map((a: { name: string }) => a.name) : ['Neznámý autor'];
        const publisher = item.publishers ? item.publishers.map((p: { name: string }) => p.name).join(', ') : '';
        const coverUrl = isCzech ? obalkyCoverUrl : (item.cover?.medium || item.cover?.small || openLibCoverUrl);

        return {
          id: cleanIsbn + '-' + Date.now(),
          isbn: cleanIsbn,
          title: item.title || 'Bez názvu',
          authors: authors,
          publisher: publisher,
          publishedDate: item.publish_date || '',
          description: '',
          coverUrl: coverUrl,
          pageCount: item.number_of_pages || undefined,
          categories: item.subjects ? item.subjects.map((s: { name: string }) => s.name).slice(0, 3) : [],
          addedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('Open Library API warning:', err);
  }
  return null;
}

/**
 * Attempts to fetch book detail HTML from Obálky knih via CORS proxy endpoints and parse metadata.
 */
async function fetchFromObalkyKnih(isbn: string): Promise<Book | null> {
  const targetUrl = `https://www.obalkyknih.cz/view?isbn=${isbn}`;
  const proxyEndpoints = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`,
  ];

  for (const endpoint of proxyEndpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(endpoint, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const html = await res.text();
        const parsed = parseObalkyKnihHtml(html, isbn);
        if (parsed) {
          return parsed;
        }
      }
    } catch {
      // Try next proxy
      continue;
    }
  }

  return null;
}

/**
 * Parses title, author, release year, publisher and citation from Obálky knih detail page HTML.
 */
function parseObalkyKnihHtml(html: string, isbn: string): Book | null {
  // Check if page contains valid book content (not VPN block / error page)
  if (!html || html.includes('VPN service') || html.includes('Fix CORS')) {
    return null;
  }

  // Extract title header
  const titleMatch = html.match(/<h[12][^>]*>(.*?)<\/h[12]>/i);
  if (!titleMatch) {
    return null;
  }

  const rawTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  if (!rawTitle || rawTitle.includes('Chyba') || rawTitle.includes('404')) {
    return null;
  }

  // If header contains 'Title Author ; ...' format, keep title part
  const titleSplit = rawTitle.split(';');
  const mainTitle = titleSplit[0].trim();

  // Strip html tags and normalize spaces for text extraction
  const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

  // Extract author
  const authorMatch = plainText.match(/Autor:\s*([^R\n<]+?)(?=\s*Rok:|\s*ISBN:|\s*OKCZID:|\s*NKP-CNB:|$)/i);
  let authors: string[] = [];
  if (authorMatch) {
    const rawAuthors = authorMatch[1].trim();
    authors = rawAuthors
      .split(',')
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  }

  if (authors.length === 0) {
    // If title split had secondary text, try parsing author from there
    if (titleSplit.length > 1) {
      authors = [titleSplit[1].replace(/ilustroval|přeložil/gi, '').trim()];
    } else {
      authors = ['Neznámý autor'];
    }
  }

  // Extract publication year
  const yearMatch = plainText.match(/Rok:\s*(\d{4})/i);
  const publishedDate = yearMatch ? yearMatch[1] : '';

  // Extract publisher and citation from citation block if available
  let publisher = '';
  let description = '';
  const citMatch = plainText.match(/Citace\s*\(dle ČSN ISO 690\):\s*(.*?)(?=\s*Půjčte|\s*OKCZID|\s*Dostupné zdroje|\s*Anotace|$)/i);
  if (citMatch) {
    const citText = citMatch[1].trim();
    if (citText) {
      description = `Citace ČSN ISO 690: ${citText}`;
      const pubMatch = citText.match(/:\s*([^,.\d]+?),\s*\d{4}/);
      if (pubMatch) {
        publisher = pubMatch[1].trim();
      }
    }
  }

  // Extract annotation / summary if present
  const annotationMatch = plainText.match(/Anotace\s+(?:Upravit anotaci\s+)?(.*?)(?=\s*Zdroj anotace|\s*Dostupné zdroje|\s*Komentáře|\s*Přidat komentář|$)/i);
  if (annotationMatch) {
    const annotationText = annotationMatch[1].trim();
    if (annotationText && annotationText.length > 10) {
      description = annotationText + (description ? `\n\n${description}` : '');
    }
  }

  return {
    id: isbn + '-' + Date.now(),
    isbn: isbn,
    title: mainTitle,
    authors: authors,
    publisher: publisher,
    publishedDate: publishedDate,
    description: description,
    coverUrl: `https://www.obalkyknih.cz/api/cover?isbn=${isbn}`,
    addedAt: new Date().toISOString(),
  };
}
