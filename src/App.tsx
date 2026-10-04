import { useState, useCallback } from 'react';
import type { Book, ScanMode } from './types/book';
import { useBookStorage } from './hooks/useBookStorage';
import { fetchBookByIsbn } from './services/bookApi';
import { BarcodeScanner } from './components/BarcodeScanner';
import { ManualIsbnInput } from './components/ManualIsbnInput';
import { BookList } from './components/BookList';
import { BookDetailModal } from './components/BookDetailModal';
import { Camera, Keyboard, Library, CheckCircle2, AlertCircle, BookOpen, Sparkles } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<ScanMode>('camera');
  const { books, addBook, updateBook, deleteBook, clearAllBooks } = useBookStorage();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'warning' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, 3500);
  };

  const handleIsbnDetected = useCallback(
    async (isbn: string) => {
      if (isLoading) return;
      setIsLoading(true);

      try {
        const fetchedBook = await fetchBookByIsbn(isbn);
        const result = addBook(fetchedBook);

        if (result.isDuplicate) {
          showToast('warning', `Kniha s ISBN ${isbn} ("${result.book.title}") už v knihovně je.`);
          setSelectedBook(result.book);
        } else {
          showToast('success', `Přidáno: "${fetchedBook.title}"`);
        }
      } catch (err) {
        console.error(err);
        showToast('error', 'Nepodařilo se načíst informace o knize.');
      } finally {
        setIsLoading(false);
      }
    },
    [addBook, isLoading]
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans pb-20 sm:pb-6">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700/80 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm shadow-indigo-200 dark:shadow-none">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-slate-900 dark:text-white leading-none">
                Knihovník <span className="text-indigo-600 dark:text-indigo-400">ISBN</span>
              </h1>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                Mobilní skener čárových kódů & katalog
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('list')}
              className="relative px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/70 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center space-x-1.5"
            >
              <Library className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>{books.length} knih</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 space-y-4">
        {/* Toast Notification */}
        {notification && (
          <div
            className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-md p-3.5 rounded-2xl shadow-lg border flex items-center space-x-3 transition-all animate-in slide-in-from-top duration-300 ${
              notification.type === 'success'
                ? 'bg-emerald-900/90 border-emerald-700 text-emerald-100 backdrop-blur-md'
                : notification.type === 'warning'
                ? 'bg-amber-900/90 border-amber-700 text-amber-100 backdrop-blur-md'
                : 'bg-rose-900/90 border-rose-700 text-rose-100 backdrop-blur-md'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            )}
            <p className="text-xs font-medium leading-tight flex-1">{notification.message}</p>
          </div>
        )}

        {/* Desktop Tab Selector */}
        <div className="hidden sm:flex bg-slate-200/60 dark:bg-slate-800 p-1 rounded-2xl max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'camera'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Skener kamery</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Ruční zadání</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'list'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Library className="w-4 h-4" />
            <span>Knihovna ({books.length})</span>
          </button>
        </div>

        {/* Active Tab View Body */}
        <div className="mt-2">
          {activeTab === 'camera' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center justify-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Naskenujte čárový kód na knize</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Přiblížte kód v bílém rámečku knížky k fotoaparátu.
                </p>
              </div>

              <BarcodeScanner
                onScanSuccess={handleIsbnDetected}
                isScanningActive={activeTab === 'camera'}
              />

              {isLoading && (
                <div className="flex items-center justify-center space-x-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-2xl max-w-md mx-auto border border-indigo-100 dark:border-indigo-900">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Vyhledávám informace o knize v databázi...</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="py-2">
              <ManualIsbnInput
                onSearch={handleIsbnDetected}
                isLoading={isLoading}
              />
            </div>
          )}

          {activeTab === 'list' && (
            <BookList
              books={books}
              onSelectBook={(book) => setSelectedBook(book)}
              onClearAll={clearAllBooks}
              onNavigateToScan={() => setActiveTab('camera')}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-800/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-700/80 sm:hidden px-4 py-2">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              activeTab === 'camera'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-normal'
            }`}
          >
            <Camera className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Skener</span>
          </button>

          <button
            onClick={() => setActiveTab('manual')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all ${
              activeTab === 'manual'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-normal'
            }`}
          >
            <Keyboard className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Ručně</span>
          </button>

          <button
            onClick={() => setActiveTab('list')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-all relative ${
              activeTab === 'list'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-normal'
            }`}
          >
            <Library className="w-5 h-5 mb-0.5" />
            <span className="text-[10px]">Knihovna ({books.length})</span>
          </button>
        </div>
      </nav>

      {/* Detail Modal */}
      <BookDetailModal
        book={selectedBook}
        onClose={() => setSelectedBook(null)}
        onUpdate={(updated) => {
          updateBook(updated);
          setSelectedBook(updated);
          showToast('success', 'Změny byly uloženy.');
        }}
        onDelete={(id) => {
          deleteBook(id);
          setSelectedBook(null);
          showToast('success', 'Kniha byla smazána.');
        }}
      />
    </div>
  );
}

export default App;
