import { useState, useEffect } from 'react';
import type { Book, ScanRecord } from '../types/book';
import { isbnKey, normalizeIsbn } from '../utils/isbn';

const BOOKS_STORAGE_KEY = 'librarian_app_books_v1';
const HISTORY_STORAGE_KEY = 'librarian_app_scan_history_v1';

/** Načte seznam z úložiště; poškozená nebo chybějící data = prázdný seznam. */
function loadList<T>(key: string): T[] {
  try {
    const saved = localStorage.getItem(key);
    const parsed: unknown = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (e) {
    console.error(`Nepodařilo se načíst ${key}:`, e);
    return [];
  }
}

export function useBookStorage() {
  const [books, setBooks] = useState<Book[]>(() => loadList<Book>(BOOKS_STORAGE_KEY));
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => loadList<ScanRecord>(HISTORY_STORAGE_KEY));
  /**
   * Knihovnu se nepodařilo uložit (typicky je plná paměť prohlížeče – asi 5 MB,
   * hlavně kvůli fotkám obálek). Bez upozornění by se změny po zavření ztratily.
   */
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    let ok = true;
    try {
      localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch (e) {
      console.error('Knihovnu se nepodařilo uložit:', e);
      ok = false;
    }
    // Výsledek zápisu do prohlížeče (vnější systém) musíme ukázat v aplikaci.
    // oxlint-disable-next-line react/set-state-in-effect
    setSaveFailed(!ok);
  }, [books]);

  // Aplikace otevřená ve dvou záložkách: změny z jiné záložky převezmeme,
  // jinak by jedna záložka při dalším uložení přepsala knihy přidané v druhé.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === BOOKS_STORAGE_KEY) setBooks(loadList<Book>(BOOKS_STORAGE_KEY));
      if (e.key === HISTORY_STORAGE_KEY) setScanHistory(loadList<ScanRecord>(HISTORY_STORAGE_KEY));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(scanHistory));
    } catch (e) {
      console.error('Failed to save scan history to localStorage:', e);
    }
  }, [scanHistory]);

  const recordScan = (
    isbn: string,
    status: 'added' | 'duplicate' | 'error',
    book?: Book
  ) => {
    const newRecord: ScanRecord = {
      id: `${isbn || 'bez-isbn'}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      isbn,
      scannedAt: new Date().toISOString(),
      status,
      bookTitle: book?.title,
      bookId: book?.id,
      bookCoverUrl: book?.coverUrl,
    };

    setScanHistory((prev) => [newRecord, ...prev].slice(0, 50)); // Keep last 50 scan records
  };

  const addBook = (newBook: Book): { success: boolean; isDuplicate: boolean; book: Book } => {
    const cleanNewIsbn = normalizeIsbn(newBook.isbn);
    // Kniha bez ISBN: duplikát podle ISBN poznat nejde (může jít i o další výtisk).
    // ISBN-10 a ISBN-13 téže knihy se berou jako stejné číslo.
    const existingIndex = cleanNewIsbn
      ? books.findIndex((b) => b.isbn !== '' && isbnKey(b.isbn) === isbnKey(cleanNewIsbn))
      : -1;

    if (existingIndex >= 0) {
      const existingBook = books[existingIndex];
      recordScan(cleanNewIsbn, 'duplicate', existingBook);
      return { success: false, isDuplicate: true, book: existingBook };
    }

    setBooks((prev) => [newBook, ...prev]);
    recordScan(cleanNewIsbn, 'added', newBook);
    return { success: true, isDuplicate: false, book: newBook };
  };

  /**
   * Vloží knihu bez kontroly duplikátu (volající ji už udělal). Používá
   * funkční aktualizaci, takže je bezpečná i při víc souběžných vyhledáváních.
   */
  const insertBook = (newBook: Book) => {
    setBooks((prev) => (prev.some((b) => b.id === newBook.id) ? prev : [newBook, ...prev]));
  };

  /** Změní počet výtisků o `delta` (nejméně 1). Bezpečné při souběžných změnách. */
  const adjustCopies = (id: string, delta: number) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, copies: Math.max(1, (b.copies && b.copies > 0 ? b.copies : 1) + delta) } : b))
    );
  };

  const updateBook = (updatedBook: Book) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === updatedBook.id ? updatedBook : b))
    );
  };

  const deleteBook = (id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
  };

  /** Vrátí smazanou knihu zpět (tlačítko „Vrátit“ po smazání). */
  const restoreBook = (book: Book) => {
    setBooks((prev) => (prev.some((b) => b.id === book.id) ? prev : [book, ...prev]));
  };

  const clearAllBooks = () => {
    if (window.confirm('Opravdu chcete smazat celý seznam knih? Tato akce je nevratná.')) {
      setBooks([]);
    }
  };

  const clearScanHistory = () => {
    setScanHistory([]);
  };

  const hasBookWithIsbn = (isbn: string): boolean => {
    const key = isbnKey(isbn);
    return key !== '' && books.some((b) => b.isbn !== '' && isbnKey(b.isbn) === key);
  };

  return {
    books,
    saveFailed,
    scanHistory,
    addBook,
    updateBook,
    deleteBook,
    restoreBook,
    insertBook,
    adjustCopies,
    clearAllBooks,
    recordScan,
    clearScanHistory,
    hasBookWithIsbn,
  };
}
