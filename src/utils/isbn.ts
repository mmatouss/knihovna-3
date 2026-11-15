/**
  * Cleans and normalizes an ISBN string by removing spaces, hyphens, and converting to uppercase.
  */
export function normalizeIsbn(isbn: string): string {
  return isbn.replace(/[^0-9X]/gi, '').toUpperCase();
}

/**
 * Validates whether the given string is a valid ISBN-10 or ISBN-13.
 */
export function isValidIsbn(isbn: string): boolean {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 10) {
    return isValidIsbn10(clean);
  }
  if (clean.length === 13) {
    return isValidIsbn13(clean);
  }
  return false;
}

function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(isbn[i], 10);
  }
  const lastChar = isbn[9];
  sum += lastChar === 'X' ? 10 : parseInt(lastChar, 10);
  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(isbn[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const checksum = (10 - (sum % 10)) % 10;
  return checksum === parseInt(isbn[12], 10);
}

/**
 * Zobrazí ISBN čitelněji: odděluje předponu (978/979) a kontrolní číslici,
 * např. 978-802571234-4. Přesné dělení na skupinu, nakladatele a titul
 * záleží na tabulce rozsahů ISBN, proto ho nehádáme (dřívější pevné
 * dělení dávalo chybné výsledky, např. 978-31-61484-10-0).
 */
export function formatIsbn(isbn: string): string {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 13) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 12)}-${clean.slice(12)}`;
  }
  if (clean.length === 10) {
    return `${clean.slice(0, 9)}-${clean.slice(9)}`;
  }
  return isbn;
}

/**
 * Převede ISBN-10 na ISBN-13 (předpona 978 + nová kontrolní číslice).
 */
export function isbn10To13(isbn10: string): string | null {
  const clean = normalizeIsbn(isbn10);
  if (clean.length !== 10) return null;
  const base = '978' + clean.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
  return base + ((10 - (sum % 10)) % 10);
}

/**
 * Převede ISBN-13 na ISBN-10. Jde jen u předpony 978 (ISBN začínající 979
 * žádnou desetimístnou podobu nemají).
 */
export function isbn13To10(isbn13: string): string | null {
  const clean = normalizeIsbn(isbn13);
  if (clean.length !== 13 || !clean.startsWith('978')) return null;
  const base = clean.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * parseInt(base[i], 10);
  const check = (11 - (sum % 11)) % 11;
  return base + (check === 10 ? 'X' : String(check));
}

/**
 * Obě podoby ISBN – nejdřív 13místná, pak 10místná (pokud existuje).
 * Databáze mají knihu někdy uloženou jen pod jednou z nich.
 */
export function isbnVariants(isbn: string): string[] {
  const clean = normalizeIsbn(isbn);
  const isbn13 = clean.length === 13 ? clean : isbn10To13(clean);
  const isbn10 = clean.length === 10 ? clean : isbn13To10(clean);
  return [isbn13, isbn10].filter((v): v is string => Boolean(v));
}

/**
 * Je to čárový kód knihy? EAN-13 knih vždy začíná 978 nebo 979.
 * Jiné kódy (např. 859… na zboží nebo časopisech) nejsou ISBN.
 */
export function looksLikeBookCode(isbn: string): boolean {
  const clean = normalizeIsbn(isbn);
  if (clean.length === 10) return true;
  return clean.length === 13 && (clean.startsWith('978') || clean.startsWith('979'));
}
