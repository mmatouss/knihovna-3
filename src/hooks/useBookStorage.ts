import { useState, useEffect } from 'react';
import type { Book } from '../types/book';
import { normalizeIsbn } from '../utils/isbn';

const STORAGE_KEY = 'librarian_app_books_v1';

export function useBookStorage() {
  const [books, setBooks] = useState<Book[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to parse books from localStorage:', e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
    } catch (e) {
      console.error('Failed to save books to localStorage:', e);
    }
  }, [books]);

  const addBook = (newBook: Book): { success: boolean; isDuplicate: boolean; book: Book } => {
    const cleanNewIsbn = normalizeIsbn(newBook.isbn);
    const existingIndex = books.findIndex(b => normalizeIsbn(b.isbn) === cleanNewIsbn);

    if (existingIndex >= 0) {
      return { success: false, isDuplicate: true, book: books[existingIndex] };
    }

    setBooks((prev) => [newBook, ...prev]);
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

  const hasBookWithIsbn = (isbn: string): boolean => {
    const clean = normalizeIsbn(isbn);
    return books.some((b) => normalizeIsbn(b.isbn) === clean);
  };

  return {
    books,
    addBook,
    updateBook,
    deleteBook,
    clearAllBooks,
    hasBookWithIsbn,
  };
}
