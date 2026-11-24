import type { Book, Shelf } from '../types/book';
import { formatIsbn } from './isbn';
import { getCopies, languageName } from './bookMatching';

/** Hodnota buňky v uvozovkách (uvozovky uvnitř se zdvojí). */
function cell(value: string | number | undefined): string {
  let text = String(value ?? '');
  // Text začínající = + - @ by Excel spustil jako vzorec – přidáme apostrof.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * ISBN jako text. Excel by z čísla 9780140328721 udělal „9,78014E+12“
 * (a u ISBN-10 by smazal úvodní nulu), proto zápis ="…".
 */
function isbnCell(isbn: string): string {
  return isbn ? `"=""${isbn}"""` : '""';
}

/**
 * Converts a list of books into a downloadable CSV file.
 * Na začátek dává znak BOM (\uFEFF), aby Excel správně zobrazil češtinu.
 */
export function exportBooksToCsv(books: Book[], shelves: Shelf[] = []): void {
  if (books.length === 0) return;
  const shelfName = new Map(shelves.map((s) => [s.id, s.name]));

  const headers = ['ISBN', 'Formátované ISBN', 'Název', 'Autor(i)', 'Nakladatelství', 'Rok vydání', 'Vydání', 'Počet stran', 'Počet výtisků', 'Regál', 'Jazyk', 'Žánr', 'Popis', 'Poznámka', 'Datum přidání'];

  const rows = books.map((book) => {
    const added = new Date(book.addedAt);
    return [
      isbnCell(book.isbn || ''),
      cell(book.isbn ? formatIsbn(book.isbn) : 'Bez ISBN'),
      cell(book.title),
      cell(book.authors?.join(', ')),
      cell(book.publisher),
      cell(book.publishedDate),
      cell(book.edition),
      cell(book.pageCount),
      cell(getCopies(book)),
      cell(book.shelfId ? shelfName.get(book.shelfId) : ''),
      cell(languageName(book.language)),
      cell((book.categories ?? []).join(', ')),
      cell(book.description),
      cell(book.notes),
      cell(isNaN(added.getTime()) ? '' : added.toLocaleDateString('cs-CZ')),
    ];
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `knihovna_export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Uvolnit paměť až po spuštění stahování.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
