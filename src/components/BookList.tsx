import React, { useMemo, useState } from 'react';
import type { Book } from '../types/book';
import {
  Search,
  Download,
  Trash2,
  BookOpen,
  Hash,
  ArrowUpDown,
  Grid,
  List as ListIcon,
  Plus,
  SlidersHorizontal,
  X,
  ChevronRight,
} from 'lucide-react';
import { BookCover } from './BookCover';
import { formatIsbn } from '../utils/isbn';
import { exportBooksToCsv } from '../utils/csvExport';
import {
  findOtherEditions,
  getCopies,
  getYear,
  normalizeAuthor,
  normalizeText,
} from '../utils/bookMatching';

type SortOrder = 'newest' | 'title' | 'author' | 'yearAsc' | 'yearDesc';

interface Filters {
  author: string; // normalizovaný autor (normalizeAuthor), '' = všichni
  publisher: string; // normalizované nakladatelství, '' = všechna
  yearFrom: string;
  yearTo: string;
  isbn: 'all' | 'with' | 'without';
  multipleCopies: boolean;
  multipleEditions: boolean;
  missingData: boolean;
}

const EMPTY_FILTERS: Filters = {
  author: '',
  publisher: '',
  yearFrom: '',
  yearTo: '',
  isbn: 'all',
  multipleCopies: false,
  multipleEditions: false,
  missingData: false,
};

/** Seznam unikátních hodnot pro výběr ve filtru (seřazený podle češtiny). */
function uniqueOptions(values: string[], normalize: (v: string) => string) {
  const map = new Map<string, string>();
  for (const value of values) {
    const key = normalize(value);
    if (key && !map.has(key)) map.set(key, value.trim());
  }
  return [...map.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'cs'));
}

const selectClass =
  'w-full px-2.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500';

interface BookListProps {
  books: Book[];
  onSelectBook: (book: Book) => void;
  onClearAll: () => void;
  onNavigateToScan: () => void;
}

export const BookList: React.FC<BookListProps> = ({
  books,
  onSelectBook,
  onClearAll,
  onNavigateToScan,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  // Počet vydání každé knihy (ona sama + jiná vydání v knihovně).
  const editionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const book of books) counts.set(book.id, findOtherEditions(book, books).length + 1);
    return counts;
  }, [books]);

  const authorOptions = useMemo(
    () => uniqueOptions(books.flatMap((b) => b.authors.filter((a) => a !== 'Neznámý autor')), normalizeAuthor),
    [books]
  );
  const publisherOptions = useMemo(
    () => uniqueOptions(books.map((b) => b.publisher || ''), normalizeText),
    [books]
  );

  const activeFilterCount =
    (filters.author ? 1 : 0) +
    (filters.publisher ? 1 : 0) +
    (filters.yearFrom || filters.yearTo ? 1 : 0) +
    (filters.isbn !== 'all' ? 1 : 0) +
    (filters.multipleCopies ? 1 : 0) +
    (filters.multipleEditions ? 1 : 0) +
    (filters.missingData ? 1 : 0);

  const yearFrom = /^\d{1,4}$/.test(filters.yearFrom.trim()) ? Number(filters.yearFrom) : null;
  const yearTo = /^\d{1,4}$/.test(filters.yearTo.trim()) ? Number(filters.yearTo) : null;

  const filteredBooks = books
    .filter((b) => {
      // Fulltextové hledání (bez ohledu na diakritiku a velikost písmen).
      const q = normalizeText(searchQuery);
      if (q) {
        const isbnQuery = searchQuery.replace(/[\s-]/g, '').toLowerCase();
        const haystack = normalizeText(
          [b.title, ...b.authors, b.publisher, b.edition, b.notes, b.publishedDate].filter(Boolean).join(' ')
        );
        const matches =
          haystack.includes(q) ||
          (b.isbn !== '' && isbnQuery !== '' && b.isbn.toLowerCase().includes(isbnQuery)) ||
          (!b.isbn && 'bez isbn'.includes(q));
        if (!matches) return false;
      }

      // Filtry
      if (filters.author && !b.authors.some((a) => normalizeAuthor(a) === filters.author)) return false;
      if (filters.publisher && normalizeText(b.publisher || '') !== filters.publisher) return false;
      if (yearFrom !== null || yearTo !== null) {
        const year = getYear(b);
        if (year === null) return false;
        if (yearFrom !== null && year < yearFrom) return false;
        if (yearTo !== null && year > yearTo) return false;
      }
      if (filters.isbn === 'with' && !b.isbn) return false;
      if (filters.isbn === 'without' && b.isbn) return false;
      if (filters.multipleCopies && getCopies(b) < 2) return false;
      if (filters.multipleEditions && (editionCounts.get(b.id) ?? 1) < 2) return false;
      if (filters.missingData && !b.metadataMissing) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortOrder === 'newest') {
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
      }
      if (sortOrder === 'title') {
        return a.title.localeCompare(b.title, 'cs');
      }
      if (sortOrder === 'author') {
        const authorA = a.authors[0] || '';
        const authorB = b.authors[0] || '';
        return authorA.localeCompare(authorB, 'cs');
      }
      if (sortOrder === 'yearAsc' || sortOrder === 'yearDesc') {
        // Knihy bez roku vždy na konec.
        const yearA = getYear(a);
        const yearB = getYear(b);
        if (yearA === null && yearB === null) return 0;
        if (yearA === null) return 1;
        if (yearB === null) return -1;
        return sortOrder === 'yearAsc' ? yearA - yearB : yearB - yearA;
      }
      return 0;
    });

  const isFiltering = activeFilterCount > 0 || searchQuery.trim() !== '';
  const totalCopies = books.reduce((sum, b) => sum + getCopies(b), 0);

  return (
    <div className="w-full mx-auto space-y-4">
      {/* Top Header & Toolbar */}
      <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_2px_rgba(60,40,20,0.05)] space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white leading-tight">Moje knihovna</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {books.length} {books.length === 1 ? 'titul' : books.length >= 2 && books.length <= 4 ? 'tituly' : 'titulů'}
              {' · '}
              {totalCopies} {totalCopies === 1 ? 'výtisk' : totalCopies >= 2 && totalCopies <= 4 ? 'výtisky' : 'výtisků'}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {books.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => exportBooksToCsv(filteredBooks)}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white dark:bg-indigo-600 dark:hover:bg-indigo-500 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-xs"
                  title="Exportovat zobrazené knihy do CSV (Excel)"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={onClearAll}
                  className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors"
                  title="Smazat všechny knihy"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              onClick={onNavigateToScan}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium flex items-center space-x-1 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Skenovat</span>
            </button>
          </div>
        </div>

        {/* Search & Filters */}
        {books.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-100 dark:border-slate-700/60">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Hledat podle názvu, autora nebo ISBN..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Sort & View Mode Toggles */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex flex-1 sm:flex-none items-center min-w-[9rem] max-w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  aria-label="Řazení"
                  className="bg-transparent text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer min-w-0 w-full sm:w-auto"
                >
                  <option value="newest" className="dark:bg-slate-800">Nejnovější</option>
                  <option value="title" className="dark:bg-slate-800">Název (A-Z)</option>
                  <option value="author" className="dark:bg-slate-800">Autor (A-Z)</option>
                  <option value="yearAsc" className="dark:bg-slate-800">Rok vydání (nejstarší)</option>
                  <option value="yearDesc" className="dark:bg-slate-800">Rok vydání (nejnovější)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                aria-expanded={showFilters}
                className={`relative px-2.5 py-1.5 rounded-xl border text-xs font-medium flex items-center space-x-1 transition-colors ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filtry</span>
                {activeFilterCount > 0 && (
                  <span className="ml-0.5 px-1.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <div className="flex items-center bg-slate-100 dark:bg-slate-900 rounded-xl p-1 border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1 rounded-lg transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-400'
                  }`}
                  title="Seznam"
                >
                  <ListIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1 rounded-lg transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                      : 'text-slate-400'
                  }`}
                  title="Mřížka"
                >
                  <Grid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Panel s filtry */}
        {books.length > 0 && showFilters && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-700/60 space-y-3" data-testid="filter-panel">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="filter-author" className="block text-[11px] font-medium text-slate-500 mb-1">Autor</label>
                <select
                  id="filter-author"
                  value={filters.author}
                  onChange={(e) => setFilter('author', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Všichni autoři</option>
                  {authorOptions.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="filter-publisher" className="block text-[11px] font-medium text-slate-500 mb-1">Nakladatelství</label>
                <select
                  id="filter-publisher"
                  value={filters.publisher}
                  onChange={(e) => setFilter('publisher', e.target.value)}
                  className={selectClass}
                >
                  <option value="">Všechna nakladatelství</option>
                  {publisherOptions.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-[11px] font-medium text-slate-500 mb-1">Rok vydání</span>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Rok vydání od"
                    placeholder="od"
                    value={filters.yearFrom}
                    onChange={(e) => setFilter('yearFrom', e.target.value)}
                    className={selectClass}
                  />
                  <span className="text-slate-400">–</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Rok vydání do"
                    placeholder="do"
                    value={filters.yearTo}
                    onChange={(e) => setFilter('yearTo', e.target.value)}
                    className={selectClass}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="filter-isbn" className="block text-[11px] font-medium text-slate-500 mb-1">ISBN</label>
                <select
                  id="filter-isbn"
                  value={filters.isbn}
                  onChange={(e) => setFilter('isbn', e.target.value as Filters['isbn'])}
                  className={selectClass}
                >
                  <option value="all">S ISBN i bez ISBN</option>
                  <option value="with">Jen s ISBN</option>
                  <option value="without">Jen bez ISBN</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {([
                ['multipleCopies', 'Více výtisků'],
                ['multipleEditions', 'Více vydání'],
                ['missingData', 'Chybí údaje'],
              ] as const).map(([key, label]) => (
                <label
                  key={key}
                  className={`px-3 py-1.5 rounded-full border text-xs cursor-pointer select-none transition-colors ${
                    filters[key]
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={filters[key]}
                    onChange={(e) => setFilter(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Počet výsledků a zrušení filtrů */}
        {books.length > 0 && isFiltering && (
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1">
            <span data-testid="result-count">
              Zobrazeno {filteredBooks.length} z {books.length} knih
            </span>
            <button
              type="button"
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSearchQuery('');
              }}
              className="flex items-center text-indigo-600 dark:text-indigo-400 font-medium"
            >
              <X className="w-3.5 h-3.5 mr-0.5" />
              Zrušit filtry
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {books.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 border border-slate-200 dark:border-slate-700 text-center space-y-4">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto">
            <BookOpen className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Žádné uložené knihy</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Naskenujte čárové kódy knih pomocí kamery nebo zadejte jejich ISBN ručně.
            </p>
          </div>
          <button
            onClick={onNavigateToScan}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl inline-flex items-center space-x-2 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>Začít skenovat knihy</span>
          </button>
        </div>
      )}

      {/* No search results */}
      {books.length > 0 && filteredBooks.length === 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 text-center text-slate-500 dark:text-slate-400 text-xs border border-slate-200 dark:border-slate-700">
          Zadaným filtrům ani hledání neodpovídá žádná kniha.
        </div>
      )}

      {/* Book Cards Display */}
      {filteredBooks.length > 0 && (
        <div
          className={
            viewMode === 'list'
              ? 'grid grid-cols-1 lg:grid-cols-2 gap-2.5'
              : 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-6'
          }
        >
          {filteredBooks.map((book) => {
            const copies = getCopies(book);
            const editions = editionCounts.get(book.id) ?? 1;
            const meta = [book.publishedDate, book.publisher].filter(Boolean).join(' · ');
            const badges = (
              <>
                {copies > 1 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/70 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                    {copies}× výtisk
                  </span>
                )}
                {editions > 1 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-200/70 dark:ring-indigo-800">
                    {editions} vydání
                  </span>
                )}
                {book.metadataMissing && (
                  <span className="px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-[10px] font-semibold text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-200 dark:ring-amber-800">
                    Chybí údaje
                  </span>
                )}
                {!book.isbn && (
                  <span className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/70 text-[10px] font-medium text-slate-500 dark:text-slate-300">
                    Bez ISBN
                  </span>
                )}
              </>
            );

            return viewMode === 'list' ? (
              <button
                type="button"
                key={book.id}
                onClick={() => onSelectBook(book)}
                className="group text-left bg-white/90 dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 shadow-[0_1px_2px_rgba(60,40,20,0.05)] hover:shadow-md hover:-translate-y-px transition-all p-3 flex items-center gap-3.5"
              >
                <BookCover
                  title={book.title}
                  authors={book.authors}
                  coverUrl={book.coverUrl}
                  variant="compact"
                  className="w-12 h-[4.5rem] flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white truncate leading-snug">
                    {book.title}
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{book.authors.join(', ')}</p>
                  {meta && <p className="text-[11px] text-slate-500 dark:text-slate-500 truncate mt-0.5">{meta}</p>}
                  <div className="flex flex-wrap items-center gap-1 mt-1.5">
                    {badges}
                    {book.isbn && (
                      <span className="inline-flex items-center text-[10px] font-mono text-slate-400 dark:text-slate-500">
                        <Hash className="w-3 h-3 mr-0.5" />
                        {formatIsbn(book.isbn)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 flex-shrink-0 transition-colors" />
              </button>
            ) : (
              <button
                type="button"
                key={book.id}
                onClick={() => onSelectBook(book)}
                className="group text-left flex flex-col"
              >
                <BookCover
                  title={book.title}
                  authors={book.authors}
                  coverUrl={book.coverUrl}
                  className="w-full aspect-[2/3] transition-transform group-hover:-translate-y-1 group-hover:rotate-[-0.6deg]"
                />
                <h4 className="mt-2.5 text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">
                  {book.title}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">{book.authors.join(', ')}</p>
                <div className="flex flex-wrap gap-1 mt-1">{badges}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
