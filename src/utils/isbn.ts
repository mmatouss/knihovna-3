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
