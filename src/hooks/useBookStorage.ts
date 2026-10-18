import { useState, useEffect } from 'react';
import type { Book, ScanRecord } from '../types/book';
import { normalizeIsbn } from '../utils/isbn';

const BOOKS_STORAGE_KEY = 'librarian_app_books_v1';
const HISTORY_STORAGE_KEY = 'librarian_app_scan_history_v1';

export function useBookStorage() {
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem(BOOKS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse books from localStorage:', e);
    }
    return [];
  });

  const [scanHistory, setScanHistory] = useState<ScanRecord[]>(() => {
    try {
      const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (savedHistory) {
        return JSON.parse(savedHistory);
      }
    } catch (e) {
      console.error('Failed to parse scan history from localStorage:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(BOOKS_STORAGE_KEY, JSON.stringify(books));
    } catch (e) {
      console.error('Failed to save books to localStorage:', e);
    }
  }, [books]);

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
      id: `${isbn}-${Date.now()}`,
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
    const existingIndex = books.findIndex(b => normalizeIsbn(b.isbn) === cleanNewIsbn);

    if (existingIndex >= 0) {
      const existingBook = books[existingIndex];
      recordScan(cleanNewIsbn, 'duplicate', existingBook);
      return { success: false, isDuplicate: true, book: existingBook };
    }

    setBooks((prev) => [newBook, ...prev]);
    recordScan(cleanNewIsbn, 'added', newBook);
    return { success: true, isDuplicate: false, book: newBook };
  };

  const updateBook = (updatedBook: Book) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === updatedBook.id ? updatedBook : b))
    );
  };

  const deleteBook = (id: string) => {
    setBooks((prev) => prev.filter((b) => b.id !== id));
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
    const clean = normalizeIsbn(isbn);
    return books.some((b) => normalizeIsbn(b.isbn) === clean);
  };

  return {
    books,
    scanHistory,
    addBook,
    updateBook,
    deleteBook,
    clearAllBooks,
    recordScan,
    clearScanHistory,
    hasBookWithIsbn,
  };
}
