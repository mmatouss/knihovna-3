import type { Book } from '../types/book';
import { formatIsbn } from './isbn';

/**
 * Converts a list of books into a downloadable CSV file.
 * Includes UTF-8 BOM (\uFEFF) for proper Czech character encoding in Excel.
 */
export function exportBooksToCsv(books: Book[]): void {
  if (books.length === 0) return;

  const headers = ['ISBN', 'Formátované ISBN', 'Název', 'Autor(i)', 'Nakladatelství', 'Rok vydání', 'Poznámka', 'Datum přidání'];

  const rows = books.map((book) => [
    `"${(book.isbn || '').replace(/"/g, '""')}"`,
    `"${formatIsbn(book.isbn).replace(/"/g, '""')}"`,
    `"${(book.title || '').replace(/"/g, '""')}"`,
    `"${(book.authors?.join(', ') || '').replace(/"/g, '""')}"`,
    `"${(book.publisher || '').replace(/"/g, '""')}"`,
    `"${(book.publishedDate || '').replace(/"/g, '""')}"`,
    `"${(book.notes || '').replace(/"/g, '""')}"`,
    `"${new Date(book.addedAt).toLocaleDateString('cs-CZ')}"`,
  ]);

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `knihovna_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
