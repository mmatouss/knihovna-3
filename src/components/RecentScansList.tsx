import React from 'react';
import type { Book, ScanRecord } from '../types/book';
import { History, CheckCircle2, AlertCircle, BookOpen, Clock, ChevronRight, Trash2 } from 'lucide-react';
import { formatIsbn } from '../utils/isbn';

interface RecentScansListProps {
  scanHistory: ScanRecord[];
  books: Book[];
  onSelectBook: (book: Book) => void;
  onClearHistory: () => void;
  onViewAll: () => void;
}

export const RecentScansList: React.FC<RecentScansListProps> = ({
  scanHistory,
  books,
  onSelectBook,
  onClearHistory,
  onViewAll,
}) => {
  if (scanHistory.length === 0 && books.length === 0) {
    return null;
  }

  // Find recent books saved
  const recentBooks = books.slice(0, 5);

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Naposledy uloženo a naskenováno
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          {scanHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="text-[11px] text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors p-1"
              title="Vymazat historii skenování"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onViewAll}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center"
          >
            <span>Zobrazit vše ({books.length})</span>
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {scanHistory.length > 0 ? (
          scanHistory.slice(0, 5).map((record) => {
            const matchedBook = books.find((b) => b.id === record.bookId) || books.find((b) => b.isbn === record.isbn);
            const timeStr = new Date(record.scannedAt).toLocaleTimeString('cs-CZ', {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={record.id}
                onClick={() => matchedBook && onSelectBook(matchedBook)}
                className={`py-2.5 flex items-center justify-between text-xs transition-colors rounded-xl px-2 ${
                  matchedBook
                    ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer'
                    : 'opacity-80'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0 pr-2">
                  <div className="w-8 h-10 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-600">
                    {matchedBook?.coverUrl || record.bookCoverUrl ? (
                      <img
                        src={matchedBook?.coverUrl || record.bookCoverUrl}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <BookOpen className="w-4 h-4 text-slate-400" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900 dark:text-white truncate">
                      {matchedBook?.title || record.bookTitle || `ISBN ${formatIsbn(record.isbn)}`}
                    </div>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="font-mono">{formatIsbn(record.isbn)}</span>
                      <span>•</span>
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-0.5 inline" />
                        {timeStr}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-shrink-0">
                  {record.status === 'added' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                      Uloženo
                    </span>
                  ) : record.status === 'duplicate' ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                      <AlertCircle className="w-3 h-3 mr-1 text-amber-500" />
                      V knihovně
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300">
                      Chyba
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          recentBooks.map((book) => (
            <div
              key={book.id}
              onClick={() => onSelectBook(book)}
              className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer rounded-xl px-2 transition-colors"
            >
              <div className="flex items-center space-x-3 min-w-0 pr-2">
                <div className="w-8 h-10 bg-slate-100 dark:bg-slate-700 rounded overflow-hidden flex-shrink-0 flex items-center justify-center border border-slate-200 dark:border-slate-600">
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
                    <BookOpen className="w-4 h-4 text-slate-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900 dark:text-white truncate">
                    {book.title}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {book.authors.join(', ')}
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 flex-shrink-0">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-500" />
                Uloženo
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
