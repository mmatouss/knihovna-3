import React, { useState } from 'react';
import type { Book } from '../types/book';
import { Search, Download, Trash2, BookOpen, Hash, ArrowUpDown, Grid, List as ListIcon, Plus } from 'lucide-react';
import { formatIsbn } from '../utils/isbn';
import { exportBooksToCsv } from '../utils/csvExport';

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
  const [sortOrder, setSortOrder] = useState<'newest' | 'title' | 'author'>('newest');

  const filteredBooks = books
    .filter((b) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.authors.some((a) => a.toLowerCase().includes(q)) ||
        b.isbn.toLowerCase().includes(q) ||
        (b.publisher && b.publisher.toLowerCase().includes(q))
      );
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
      return 0;
    });

  return (
    <div className="w-full max-w-3xl mx-auto space-y-4">
      {/* Top Header & Toolbar */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Knihovna <span className="text-xs font-normal text-slate-500 font-mono ml-1">({books.length})</span>
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {books.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => exportBooksToCsv(books)}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-medium flex items-center space-x-1.5 transition-colors"
                  title="Exportovat do CSV (Excel)"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Export CSV</span>
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
            <div className="flex items-center space-x-2">
              <div className="relative flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 mr-1.5" />
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as 'newest' | 'title' | 'author')}
                  className="bg-transparent text-xs text-slate-700 dark:text-slate-200 focus:outline-none cursor-pointer"
                >
                  <option value="newest" className="dark:bg-slate-800">Nejnovější</option>
                  <option value="title" className="dark:bg-slate-800">Název (A-Z)</option>
                  <option value="author" className="dark:bg-slate-800">Autor (A-Z)</option>
                </select>
              </div>

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
          Pro vyhledávání &quot;{searchQuery}&quot; nebyly nalezeny žádné výsledky.
        </div>
      )}

      {/* Book Cards Display */}
      {filteredBooks.length > 0 && (
        <div
          className={
            viewMode === 'list'
              ? 'space-y-2'
              : 'grid grid-cols-2 sm:grid-cols-3 gap-3'
          }
        >
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              onClick={() => onSelectBook(book)}
              className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-xs hover:shadow-md transition-all cursor-pointer overflow-hidden ${
                viewMode === 'list' ? 'p-3 flex items-center space-x-3' : 'p-3 flex flex-col justify-between'
              }`}
            >
              {/* Cover thumbnail */}
              <div
                className={`flex-shrink-0 bg-slate-100 dark:bg-slate-700 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-600 flex items-center justify-center ${
                  viewMode === 'list' ? 'w-12 h-16' : 'w-full aspect-[2/3] mb-2'
                }`}
              >
                {book.coverUrl ? (
                  <img
                    src={book.coverUrl}
                    alt={book.title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <BookOpen className="w-6 h-6 text-slate-400" />
                )}
              </div>

              {/* Text Info */}
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate leading-snug">
                  {book.title}
                </h4>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {book.authors.join(', ')}
                </p>
                <div className="flex items-center space-x-1 mt-1 text-[10px] font-mono text-indigo-600 dark:text-indigo-400">
                  <Hash className="w-3 h-3 text-slate-400" />
                  <span>{formatIsbn(book.isbn)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
