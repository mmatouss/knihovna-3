import type { Book } from '../types/book';
import { normalizeIsbn } from './isbn';

/**
 * Pomocné funkce pro správu knih: porovnávání názvů a autorů,
 * hledání jiných vydání téže knihy a duplikátů.
 */

/** Text bez diakritiky, velkých písmen a interpunkce (např. „Babička!“ → „babicka“). */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Hlavní název bez podtitulu: „Babička : obrazy venkovského života“ → „babicka“.
 * Různá vydání mívají různé podtituly.
 */
export function normalizeMainTitle(title: string): string {
  const main = title.split(/\s[:;/–-]\s|:\s|\s\/\s/)[0];
  return normalizeText(main);
}

/** Autor bez ohledu na pořadí jména: „Němcová, Božena“ = „Božena Němcová“. */
export function normalizeAuthor(author: string): string {
  return normalizeText(author).split(' ').filter(Boolean).sort().join(' ');
}

const UNKNOWN_AUTHORS = new Set(['', normalizeAuthor('Neznámý autor')]);

function knownAuthors(book: Book): string[] {
  return (book.authors ?? []).map(normalizeAuthor).filter((a) => !UNKNOWN_AUTHORS.has(a));
}

/**
 * Jde o stejné dílo (stejná kniha, i když jiné vydání)?
 * Shoduje se hlavní název a aspoň jeden autor (když autory známe u obou knih).
 */
export function isSameWork(a: Book, b: Book): boolean {
  const titleA = normalizeMainTitle(a.title);
  if (!titleA || titleA !== normalizeMainTitle(b.title)) return false;
  // Knihy s nenalezenými údaji mají jen zástupný název „Kniha s ISBN …“.
  if (a.metadataMissing || b.metadataMissing) return false;
  const authorsA = knownAuthors(a);
  const authorsB = knownAuthors(b);
  if (authorsA.length === 0 || authorsB.length === 0) return true;
  return authorsA.some((author) => authorsB.includes(author));
}

/**
 * Jiná vydání téže knihy v knihovně (stejné dílo, ale jiné ISBN, nebo jiný
 * rok či označení vydání). Výsledek je seřazený podle roku vydání.
 */
export function findOtherEditions(book: Book, books: Book[]): Book[] {
  return books
    .filter((other) => other.id !== book.id && isSameWork(book, other))
    .sort((x, y) => (getYear(x) ?? 9999) - (getYear(y) ?? 9999));
}

/** Kniha se stejným ISBN (jiná než `exceptId`), pokud v knihovně je. */
export function findBookByIsbn(isbn: string, books: Book[], exceptId?: string): Book | undefined {
  const clean = normalizeIsbn(isbn);
  if (!clean) return undefined;
  return books.find((b) => b.id !== exceptId && normalizeIsbn(b.isbn) === clean);
}

/** Rok vydání jako číslo (z „1986“, „2004-05-01“, „c1999“…), nebo null. */
export function getYear(book: Book): number | null {
  const match = (book.publishedDate ?? '').match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

/** Počet výtisků (starší záznamy pole nemají → 1). */
export function getCopies(book: Book): number {
  return book.copies && book.copies > 0 ? book.copies : 1;
}

/** „1 výtisk“, „2 výtisky“, „5 výtisků“. */
export function copiesLabel(count: number): string {
  if (count === 1) return '1 výtisk';
  if (count >= 2 && count <= 4) return `${count} výtisky`;
  return `${count} výtisků`;
}
