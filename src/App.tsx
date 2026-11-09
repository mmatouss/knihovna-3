import { useState, useCallback, useEffect, useRef } from 'react';
import type { BatchItem, Book, ScanMode } from './types/book';
import { useBookStorage } from './hooks/useBookStorage';
import { enrichBook, fetchBookByIsbn } from './services/bookApi';
import { BarcodeScanner } from './components/BarcodeScanner';
import { ManualIsbnInput } from './components/ManualIsbnInput';
import { BookList } from './components/BookList';
import { BookDetailModal } from './components/BookDetailModal';
import { RecentScansList } from './components/RecentScansList';
import { ManualBookForm } from './components/ManualBookForm';
import { BatchLiveBar, BatchSessionPanel } from './components/BatchSessionPanel';
import { playFeedback, unlockAudio } from './utils/feedback';
import { normalizeIsbn } from './utils/isbn';
import { copiesLabel, findBookByIsbn, findOtherEditions, getCopies } from './utils/bookMatching';
import { Camera, Keyboard, Library, CheckCircle2, AlertCircle } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<ScanMode>('camera');
  const {
    books,
    scanHistory,
    addBook,
    updateBook,
    deleteBook,
    restoreBook,
    recordScan,
    clearAllBooks,
    clearScanHistory,
    insertBook,
    adjustCopies,
  } = useBookStorage();
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  // Jak otevřít detail: rovnou v úpravách (údaje se nenašly) / s nabídkou dalšího výtisku.
  const [modalMode, setModalMode] = useState<{ edit: boolean; duplicate: boolean }>({ edit: false, duplicate: false });
  // Předvyplnění ručního zadání (např. částečně přečtené číslo ze skeneru).
  const [manualPrefill, setManualPrefill] = useState<{ value?: string; note?: string; n: number }>({ n: 0 });

  const openBook = (book: Book, mode: { edit?: boolean; duplicate?: boolean } = {}) => {
    setModalMode({ edit: Boolean(mode.edit), duplicate: Boolean(mode.duplicate) });
    setSelectedBook(book);
  };

  // Ruční zápis knihy bez ISBN.
  const handleManualBookAdd = (book: Book) => {
    addBook(book);
    showToast('success', `Kniha bez ISBN uložena: "${book.title}"`);
  };

  // ---------------------------------------------------------------------
  // Rychlé skenování: kniha za knihou, bez vyskakovacích oken, jen pípnutí.
  // ---------------------------------------------------------------------
  const readPref = (key: string, fallback: string) => {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const [batchMode, setBatchMode] = useState(() => readPref('knihovnik_batch_mode', '0') === '1');
  const [duplicateMode, setDuplicateMode] = useState<'copy' | 'skip'>(() =>
    readPref('knihovnik_batch_duplicates', 'copy') === 'skip' ? 'skip' : 'copy'
  );
  const [soundOn, setSoundOn] = useState(() => readPref('knihovnik_batch_sound', '1') === '1');
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);

  // Nastavení si pamatujeme v tomto zařízení.
  useEffect(() => {
    try {
      localStorage.setItem('knihovnik_batch_mode', batchMode ? '1' : '0');
      localStorage.setItem('knihovnik_batch_duplicates', duplicateMode);
      localStorage.setItem('knihovnik_batch_sound', soundOn ? '1' : '0');
    } catch {
      /* úložiště nedostupné – nevadí */
    }
  }, [batchMode, duplicateMode, soundOn]);

  // Prohlížeč povolí zvuk až po první akci uživatele (dotyk, klávesa).
  useEffect(() => {
    if (!batchMode) return;
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [batchMode]);

  // Aktuální seznam knih pro souběžná vyhledávání (stav Reactu se mění až po vykreslení).
  const booksRef = useRef(books);
  useEffect(() => {
    booksRef.current = books;
  }, [books]);
  // Rozběhnutá vyhledávání podle ISBN – stejná kniha naskenovaná dvakrát rychle za sebou
  // se nevyhledává dvakrát, druhý sken počká na první a přidá výtisk.
  const pendingLookupsRef = useRef(new Map<string, Promise<Book | null>>());

  const updateBatchItem = (id: string, patch: Partial<BatchItem>) =>
    setBatchItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const handleBatchScan = async (isbn: string) => {
    const clean = normalizeIsbn(isbn);
    const itemId = `${clean}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setBatchItems((prev) => [{ id: itemId, isbn: clean, status: 'pending', scannedAt: Date.now() }, ...prev]);

    const bookInfo = (book: Book) => ({
      bookId: book.id,
      title: book.metadataMissing ? undefined : book.title,
      authors: book.authors,
      coverUrl: book.coverUrl,
    });

    // Kniha už v knihovně je → další výtisk, nebo přeskočit (podle nastavení).
    const handleExisting = (book: Book) => {
      if (duplicateMode === 'copy') {
        adjustCopies(book.id, 1);
        recordScan(book.isbn, 'duplicate', book);
        updateBatchItem(itemId, { status: 'copy', ...bookInfo(book) });
        playFeedback('copy', soundOn);
      } else {
        updateBatchItem(itemId, { status: 'skipped', ...bookInfo(book) });
        playFeedback('warning', soundOn);
      }
    };

    const existing = findBookByIsbn(clean, booksRef.current);
    if (existing) {
      handleExisting(existing);
      return;
    }

    const inFlight = pendingLookupsRef.current.get(clean);
    if (inFlight) {
      const book = await inFlight;
      if (book) handleExisting(book);
      else updateBatchItem(itemId, { status: 'error' });
      return;
    }

    const lookup = (async (): Promise<Book | null> => {
      try {
        const fetched = await fetchBookByIsbn(clean);
        insertBook(fetched);
        booksRef.current = [fetched, ...booksRef.current];
        recordScan(clean, 'added', fetched);
        updateBatchItem(itemId, { status: fetched.metadataMissing ? 'notFound' : 'added', ...bookInfo(fetched) });
        playFeedback(fetched.metadataMissing ? 'warning' : 'added', soundOn);
        return fetched;
      } catch (err) {
        console.error(err);
        updateBatchItem(itemId, { status: 'error' });
        playFeedback('error', soundOn);
        return null;
      } finally {
        pendingLookupsRef.current.delete(clean);
      }
    })();
    pendingLookupsRef.current.set(clean, lookup);
    await lookup;
  };

  // Vrácení jedné akce z relace (smaže novou knihu / ubere výtisk).
  const handleBatchUndo = (itemId: string) => {
    const item = batchItems.find((i) => i.id === itemId);
    if (!item || item.undone || !item.bookId) return;
    if (item.status === 'copy') {
      adjustCopies(item.bookId, -1);
      updateBatchItem(itemId, { undone: true });
    } else if (item.status === 'added' || item.status === 'notFound') {
      const bookId = item.bookId;
      deleteBook(bookId);
      booksRef.current = booksRef.current.filter((b) => b.id !== bookId);
      // Smazaná kniha → i její další výtisky z této relace jsou pryč.
      setBatchItems((prev) => prev.map((i) => (i.bookId === bookId ? { ...i, undone: true } : i)));
    }
  };

  const goToManualEntry = (value?: string, note?: string) => {
    setManualPrefill((prev) => ({ value, note, n: prev.n + 1 }));
    setActiveTab('manual');
  };
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    action?: { label: string; onClick: () => void };
  } | null>(null);

  const showToast = (
    type: 'success' | 'warning' | 'error',
    message: string,
    action?: { label: string; onClick: () => void }
  ) => {
    setNotification({ type, message, action });
    setTimeout(() => {
      setNotification((prev) => (prev?.message === message ? null : prev));
    }, action ? 7000 : 3500);
  };

  // Doplnění chybějících údajů (počet stran, jazyk…) z online databází.
  const handleEnrichBook = async (book: Book) => {
    try {
      const { book: enriched, filled } = await enrichBook(book);
      if (filled.length > 0) {
        updateBook(enriched);
        setSelectedBook(enriched);
        showToast('success', `Doplněno: ${filled.join(', ')}.`);
      } else {
        showToast('warning', 'V online databázích se žádné další údaje nenašly.');
      }
    } catch (err) {
      console.error(err);
      showToast('error', 'Údaje se nepodařilo načíst. Zkontrolujte připojení k internetu.');
    }
  };

  // Smazání knihy s možností vrátit to zpět.
  const handleDeleteBook = (id: string) => {
    const deleted = books.find((b) => b.id === id);
    deleteBook(id);
    setSelectedBook(null);
    if (deleted) {
      showToast('success', `Kniha „${deleted.title}“ byla smazána.`, {
        label: 'Vrátit zpět',
        onClick: () => {
          restoreBook(deleted);
          setNotification(null);
        },
      });
    }
  };

  const handleIsbnDetected = useCallback(
    async (isbn: string) => {
      if (isLoading) return;
      setIsLoading(true);

      try {
        // Duplikát: knihu se stejným ISBN už máme – nabídneme přidání dalšího výtisku
        // (a zbytečně ji nehledáme v online databázích).
        const existing = findBookByIsbn(isbn, books);
        if (existing) {
          recordScan(existing.isbn, 'duplicate', existing);
          showToast('warning', `„${existing.title}“ už v knihovně je (${copiesLabel(getCopies(existing))}).`);
          openBook(existing, { duplicate: true });
          return;
        }

        const fetchedBook = await fetchBookByIsbn(isbn);
        const result = addBook(fetchedBook);
        const otherEditions = result.isDuplicate ? [] : findOtherEditions(fetchedBook, books);

        if (result.isDuplicate) {
          showToast('warning', `Kniha s ISBN ${isbn} ("${result.book.title}") už v knihovně je.`);
          openBook(result.book, { duplicate: true });
        } else if (fetchedBook.metadataMissing) {
          // Kniha není v žádné databázi – necháme knihovníka doplnit údaje ručně.
          showToast('warning', `Kniha s ISBN ${isbn} nebyla v databázích nalezena. Doplňte název a autora.`);
          openBook(fetchedBook, { edit: true });
        } else if (otherEditions.length > 0) {
          // Stejná kniha, ale jiné vydání (jiné ISBN) – uložíme jako samostatný záznam.
          const years = otherEditions.map((b) => b.publishedDate || '?').join(', ');
          showToast(
            'success',
            `Přidáno: "${fetchedBook.title}" – v knihovně je i jiné vydání (${years}).`,
            { label: 'Zobrazit', onClick: () => { openBook(fetchedBook); setNotification(null); } }
          );
        } else {
          showToast('success', `Přidáno a uloženo: "${fetchedBook.title}"`);
        }
      } catch (err) {
        console.error(err);
        showToast('error', 'Nepodařilo se načíst informace o knize.');
      } finally {
        setIsLoading(false);
      }
    },
    [addBook, books, recordScan, isLoading]
  );

  return (
    <div className="min-h-screen paper-bg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col font-sans pb-24 sm:pb-8">
      {/* Top Application Header */}
      <header className="sticky top-0 z-30 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/70 dark:border-slate-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 64 64" className="w-10 h-10 flex-shrink-0 drop-shadow-sm" aria-hidden="true">
              <rect width="64" height="64" rx="14" className="fill-indigo-700 dark:fill-indigo-600" />
              <path d="M16 18c6-2 11-1.5 16 2v28c-5-3.5-10-4-16-2z" fill="#f4ead5" />
              <path d="M48 18c-6-2-11-1.5-16 2v28c5-3.5 10-4 16-2z" fill="#e6d7b5" />
              <path d="M38 14h6v14l-3-2.4-3 2.4z" fill="#b8862b" />
            </svg>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white leading-none">Knihovník</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Katalog školní knihovny</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('list')}
              className="relative pl-2.5 pr-3 py-1.5 bg-white/80 hover:bg-white dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 shadow-[0_1px_2px_rgba(60,40,20,0.06)]"
            >
              <Library className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                {books.length} {books.length === 1 ? 'kniha' : books.length >= 2 && books.length <= 4 ? 'knihy' : 'knih'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:pt-6 space-y-4">
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
            {notification.action && (
              <button
                type="button"
                onClick={notification.action.onClick}
                className="px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold whitespace-nowrap"
              >
                {notification.action.label}
              </button>
            )}
          </div>
        )}

        {/* Desktop Tab Selector */}
        <div className="hidden sm:flex bg-slate-200/50 dark:bg-slate-800/80 p-1 rounded-full max-w-md mx-auto border border-slate-200/70 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('camera')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'camera'
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>Skener kamery</span>
          </button>
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'manual'
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>Ruční zadání</span>
          </button>
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 py-2 rounded-full text-xs font-semibold flex items-center justify-center space-x-2 transition-all ${
              activeTab === 'list'
                ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Library className="w-4 h-4" />
            <span>Knihovna ({books.length})</span>
          </button>
        </div>

        {/* Active Tab View Body */}
        <div className="mt-2 space-y-4">
          {activeTab === 'camera' && (
            <div className="space-y-4">
              <div className="text-center space-y-1 pt-1">
                <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Naskenujte knihu</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Namiřte kameru na čárový kód nebo číslo ISBN. Kniha se sama uloží do katalogu.
                </p>
              </div>

              {/* Přepínač rychlého skenování */}
              <label className="w-full max-w-md mx-auto flex items-center justify-between gap-3 bg-white/90 dark:bg-slate-800/90 rounded-2xl p-3.5 border border-slate-200/80 dark:border-slate-700 cursor-pointer select-none">
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-white">Rychlé skenování</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">
                    Kniha za knihou bez vyskakovacích oken – jen pípnutí.
                  </span>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="sr-only peer"
                  checked={batchMode}
                  onChange={(e) => {
                    if (e.target.checked) unlockAudio();
                    setBatchMode(e.target.checked);
                  }}
                  aria-label="Rychlé skenování"
                />
                <span className="relative flex-shrink-0 w-11 h-6 rounded-full bg-slate-300 dark:bg-slate-600 peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 transition-colors after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
              </label>

              {batchMode && <BatchLiveBar items={batchItems} onUndo={handleBatchUndo} />}

              <BarcodeScanner
                onScanSuccess={batchMode ? handleBatchScan : handleIsbnDetected}
                isScanningActive={activeTab === 'camera'}
                isPaused={selectedBook !== null || (!batchMode && isLoading)}
                repeatDelayMs={batchMode ? 2000 : 5000}
                onManualEntry={goToManualEntry}
              />

              {batchMode && (
                <BatchSessionPanel
                  items={batchItems}
                  duplicateMode={duplicateMode}
                  onDuplicateModeChange={setDuplicateMode}
                  soundOn={soundOn}
                  onSoundChange={(on) => {
                    if (on) unlockAudio();
                    setSoundOn(on);
                  }}
                  onUndo={handleBatchUndo}
                  onNewSession={() => setBatchItems([])}
                  onOpenBook={(bookId, edit) => {
                    const book = books.find((b) => b.id === bookId);
                    if (book) openBook(book, { edit });
                  }}
                />
              )}

              {!batchMode && isLoading && (
                <div className="flex items-center justify-center space-x-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-2xl max-w-md mx-auto border border-indigo-100 dark:border-indigo-900">
                  <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <span>Vyhledávám informace o knize v databázi...</span>
                </div>
              )}

              {!batchMode && (
                <RecentScansList
                  scanHistory={scanHistory}
                  books={books}
                  onSelectBook={(book) => openBook(book)}
                  onClearHistory={clearScanHistory}
                  onViewAll={() => setActiveTab('list')}
                />
              )}
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="py-2 space-y-4">
              <ManualIsbnInput
                key={manualPrefill.n}
                onSearch={handleIsbnDetected}
                isLoading={isLoading}
                initialValue={manualPrefill.value}
                initialNote={manualPrefill.note}
              />

              <ManualBookForm
                books={books}
                onAdd={handleManualBookAdd}
                onSelectBook={(book) => openBook(book)}
              />

              <RecentScansList
                scanHistory={scanHistory}
                books={books}
                onSelectBook={(book) => openBook(book)}
                onClearHistory={clearScanHistory}
                onViewAll={() => setActiveTab('list')}
              />
            </div>
          )}

          {activeTab === 'list' && (
            <BookList
              books={books}
              onSelectBook={(book) => openBook(book)}
              onClearAll={clearAllBooks}
              onNavigateToScan={() => setActiveTab('camera')}
            />
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-50/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 sm:hidden px-4 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto flex items-center justify-around">
          {([
            ['camera', Camera, 'Skener'],
            ['manual', Keyboard, 'Ručně'],
            ['list', Library, `Knihovna (${books.length})`],
          ] as const).map(([tab, Icon, label]) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 px-3 transition-colors ${
                  active ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <span
                  className={`px-4 py-1 rounded-full transition-colors ${
                    active ? 'bg-indigo-100 dark:bg-indigo-900/60' : ''
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className={`text-[11px] ${active ? 'font-semibold' : 'font-medium'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Detail Modal */}
      <BookDetailModal
        key={selectedBook?.id ?? 'none'}
        book={selectedBook}
        books={books}
        onSelectBook={(book) => openBook(book)}
        startEditing={modalMode.edit}
        isDuplicateScan={modalMode.duplicate}
        onEnrich={handleEnrichBook}
        onClose={() => setSelectedBook(null)}
        onUpdate={(updated) => {
          updateBook(updated);
          setSelectedBook(updated);
          showToast('success', 'Změny byly uloženy.');
        }}
        onDelete={handleDeleteBook}
      />
    </div>
  );
}

export default App;
