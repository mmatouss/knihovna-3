import React, { useState } from 'react';
import { BookPlus, ChevronDown, ChevronUp, AlertCircle, Save } from 'lucide-react';
import type { Book } from '../types/book';

interface ManualBookFormProps {
  /** Knihy v knihovně – kvůli upozornění na možný duplikát. */
  books: Book[];
  /** Uloží novou knihu (bez ISBN). */
  onAdd: (book: Book) => void;
  /** Otevře existující knihu (z upozornění na duplikát). */
  onSelectBook: (book: Book) => void;
}

/** Porovnání názvů bez ohledu na velikost písmen, diakritiku a mezery. */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Vytvoří záznam knihy bez ISBN (jedinečné id a datum přidání). */
function createBookWithoutIsbn(fields: Omit<Book, 'id' | 'isbn' | 'addedAt'>): Book {
  return {
    ...fields,
    id: `bez-isbn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    isbn: '', // kniha nemá ISBN
    addedAt: new Date().toISOString(),
  };
}

const CURRENT_YEAR = new Date().getFullYear();

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm';

/**
 * Ruční zápis knihy, která nemá ISBN (staré knihy, brožury, vlastní tisky…).
 */
export const ManualBookForm: React.FC<ManualBookFormProps> = ({ books, onAdd, onSelectBook }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [authorsStr, setAuthorsStr] = useState('');
  const [publisher, setPublisher] = useState('');
  const [year, setYear] = useState('');
  const [pageCount, setPageCount] = useState('');
  const [notes, setNotes] = useState('');
  const [triedSubmit, setTriedSubmit] = useState(false);

  const trimmedTitle = title.trim();
  const yearNum = Number(year);
  const yearError =
    year.trim() && (!/^\d{3,4}$/.test(year.trim()) || yearNum > CURRENT_YEAR)
      ? `Zadejte rok jako číslo, např. 1986 (nejvýš ${CURRENT_YEAR}).`
      : null;
  const pagesError =
    pageCount.trim() && !/^\d{1,5}$/.test(pageCount.trim()) ? 'Počet stran musí být celé číslo.' : null;
  const titleError = triedSubmit && !trimmedTitle ? 'Vyplňte název knihy.' : null;

  // Upozornění, pokud už v knihovně je kniha se stejným názvem (může jít o další výtisk).
  const sameTitleBook = trimmedTitle
    ? books.find((b) => normalizeText(b.title) === normalizeText(trimmedTitle))
    : undefined;

  const reset = () => {
    setTitle('');
    setAuthorsStr('');
    setPublisher('');
    setYear('');
    setPageCount('');
    setNotes('');
    setTriedSubmit(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTriedSubmit(true);
    if (!trimmedTitle || yearError || pagesError) return;

    const authors = authorsStr
      .split(',')
      .map((a) => a.trim())
      .filter(Boolean);

    onAdd(createBookWithoutIsbn({
      title: trimmedTitle,
      authors: authors.length > 0 ? authors : ['Neznámý autor'],
      publisher: publisher.trim(),
      publishedDate: year.trim(),
      pageCount: pageCount.trim() ? Number(pageCount) : undefined,
      notes: notes.trim(),
    }));
    reset();
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center space-x-2">
          <BookPlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Kniha bez ISBN</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kniha nemá ISBN? Zapište ji ručně.
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-slate-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <form onSubmit={handleSubmit} className="space-y-3 mt-4" noValidate>
          <div>
            <label htmlFor="book-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Název knihy <span className="text-rose-500">*</span>
            </label>
            <input
              id="book-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Např. Babička"
              className={`${inputClass} ${titleError ? 'border-rose-400 dark:border-rose-500' : ''}`}
              autoFocus
            />
            {titleError && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{titleError}</p>}
            {sameTitleBook && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 flex items-start space-x-1">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span>
                  Kniha se stejným názvem už v knihovně je ({sameTitleBook.authors.join(', ')}).{' '}
                  <button
                    type="button"
                    onClick={() => onSelectBook(sameTitleBook)}
                    className="underline font-medium"
                  >
                    Zobrazit
                  </button>
                  . Pokud jde o další výtisk, můžete ji přesto uložit.
                </span>
              </p>
            )}
          </div>

          <div>
            <label htmlFor="book-authors" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Autor (více autorů oddělte čárkou)
            </label>
            <input
              id="book-authors"
              type="text"
              value={authorsStr}
              onChange={(e) => setAuthorsStr(e.target.value)}
              placeholder="Např. Božena Němcová"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="book-publisher" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Nakladatelství
            </label>
            <input
              id="book-publisher"
              type="text"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Např. Odeon"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="book-year" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Rok vydání
              </label>
              <input
                id="book-year"
                type="text"
                inputMode="numeric"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="Např. 1986"
                className={`${inputClass} ${yearError ? 'border-amber-400' : ''}`}
              />
            </div>
            <div>
              <label htmlFor="book-pages" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Počet stran
              </label>
              <input
                id="book-pages"
                type="text"
                inputMode="numeric"
                value={pageCount}
                onChange={(e) => setPageCount(e.target.value)}
                placeholder="Např. 312"
                className={`${inputClass} ${pagesError ? 'border-amber-400' : ''}`}
              />
            </div>
          </div>
          {(yearError || pagesError) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{yearError || pagesError}</p>
          )}

          <div>
            <label htmlFor="book-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Poznámka
            </label>
            <textarea
              id="book-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Např. regál B-4, vlastní vazba, chybí obálka…"
              rows={2}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.99]"
          >
            <Save className="w-5 h-5" />
            <span>Uložit knihu bez ISBN</span>
          </button>
        </form>
      )}
    </div>
  );
};
