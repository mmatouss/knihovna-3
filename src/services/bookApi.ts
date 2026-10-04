import type { Book } from '../types/book';
import { normalizeIsbn } from '../utils/isbn';

/**
 * Fetches book metadata by ISBN using Google Books API with Open Library as fallback.
 */
export async function fetchBookByIsbn(isbn: string): Promise<Book> {
  const cleanIsbn = normalizeIsbn(isbn);
  if (!cleanIsbn) {
    throw new Error('Neplatné číslo ISBN');
  }

  // 1. Try Google Books API
  try {
    const googleRes = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}`
    );
    if (googleRes.ok) {
      const data = await googleRes.json();
      if (data.totalItems > 0 && data.items && data.items.length > 0) {
        const item = data.items[0].volumeInfo;
        const coverUrl =
          item.imageLinks?.thumbnail ||
          item.imageLinks?.smallThumbnail ||
          `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;

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
    console.warn('Google Books API error, trying fallback:', err);
  }

  // 2. Try Open Library API Fallback
  try {
    const openLibRes = await fetch(
      `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`
    );
    if (openLibRes.ok) {
      const data = await openLibRes.json();
      const key = `ISBN:${cleanIsbn}`;
      if (data[key]) {
        const item = data[key];
        const authors = item.authors ? item.authors.map((a: { name: string }) => a.name) : ['Neznámý autor'];
        const publisher = item.publishers ? item.publishers.map((p: { name: string }) => p.name).join(', ') : '';
        const coverUrl = item.cover?.medium || item.cover?.small || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`;

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
    console.warn('Open Library API error:', err);
  }

  // 3. Fallback: Create placeholder book for manual metadata entry by librarian
  return {
    id: cleanIsbn + '-' + Date.now(),
    isbn: cleanIsbn,
    title: `Kniha s ISBN ${cleanIsbn}`,
    authors: ['Neznámý autor'],
    publisher: '',
    publishedDate: '',
    description: 'Informace o této knize nebyly nalezeny v databázích. Můžete je upravit ručně.',
    coverUrl: `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-M.jpg`,
    addedAt: new Date().toISOString(),
  };
}
