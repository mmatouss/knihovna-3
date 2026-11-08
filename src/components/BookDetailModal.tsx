import React, { useState } from 'react';
import type { Book } from '../types/book';
import {
  X,
  Edit2,
  Trash2,
  Save,
  Calendar,
  Building,
  Hash,
  FileText,
  Copy,
  Layers,
  Plus,
  Minus,
  AlertCircle,
  User,
  Languages,
  Tag,
  Clock,
  Database,
  RefreshCw,
} from 'lucide-react';
import { BookCover } from './BookCover';
import { formatIsbn, isValidIsbn, normalizeIsbn } from '../utils/isbn';
import { copiesLabel, findBookByIsbn, findOtherEditions, getCopies, languageName } from '../utils/bookMatching';

interface BookDetailModalProps {
  book: Book | null;
  /** Všechny knihy – kvůli jiným vydáním a kontrole duplicitního ISBN. */
  books: Book[];
  onClose: () => void;
  onUpdate: (updated: Book) => void;
  onDelete: (id: string) => void;
  /** Otevře jinou knihu (např. jiné vydání). */
  onSelectBook: (book: Book) => void;
  /** Otevřít rovnou v režimu úprav (např. když se údaje o knize nenašly). */
  startEditing?: boolean;
  /** Kniha byla právě znovu naskenována – nabídnout přidání dalšího výtisku. */
  isDuplicateScan?: boolean;
  /** Doplní chybějící údaje z online databází (podle ISBN). */
  onEnrich?: (book: Book) => Promise<void>;
}

const inputClass =
  'w-full p-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white';

export const BookDetailModal: React.FC<BookDetailModalProps> = ({
  book,
  books,
  onClose,
  onUpdate,
  onDelete,
  onSelectBook,
  startEditing = false,
  isDuplicateScan = false,
  onEnrich,
}) => {
  // Pozn.: komponenta se pro každou knihu vytváří znovu (viz `key` v App.tsx),
  // takže se pole vždy předvyplní údaji právě otevřené knihy.
  const missing = Boolean(book?.metadataMissing);
  const initial = {
    title: missing ? '' : (book?.title ?? ''),
    authorsStr: missing ? '' : (book?.authors.join(', ') ?? ''),
    isbn: book?.isbn ?? '',
    publisher: book?.publisher || '',
    publishedDate: book?.publishedDate || '',
    edition: book?.edition || '',
    pageCount: book?.pageCount ? String(book.pageCount) : '',
    copies: book ? String(getCopies(book)) : '1',
    language: languageName(book?.language),
    categories: book?.categories?.join(', ') ?? '',
    notes: book?.notes || '',
  };
  const [isEditing, setIsEditing] = useState(startEditing);
  const [form, setForm] = useState(initial);
  const [showDuplicateNotice, setShowDuplicateNotice] = useState(isDuplicateScan);
  const [isEnriching, setIsEnriching] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);

  if (!book) return null;

  const set = (field: keyof typeof initial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const otherEditions = findOtherEditions(book, books);
  const copies = getCopies(book);

  const knownAuthors = book.authors.filter((a) => a && a !== 'Neznámý autor');
  const addedAt = new Date(book.addedAt);
  const infoRows: Array<[React.ElementType, string, string]> = [
    [User, 'Autor', knownAuthors.join(', ')],
    [Building, 'Nakladatelství', book.publisher || ''],
    [Calendar, 'Rok vydání', book.publishedDate || ''],
    [Layers, 'Vydání', book.edition || ''],
    [FileText, 'Počet stran', book.pageCount ? `${book.pageCount} stran` : ''],
    [Languages, 'Jazyk', languageName(book.language)],
    [Tag, 'Žánr / téma', book.categories && book.categories.length > 0 ? book.categories.join(', ') : ''],
    [Hash, 'ISBN', book.isbn ? formatIsbn(book.isbn) : 'kniha nemá ISBN'],
    [Clock, 'Přidáno', isNaN(addedAt.getTime()) ? '' : addedAt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' })],
    [Database, 'Zdroj údajů', book.source || (book.isbn ? '' : 'zapsáno ručně')],
  ];
  // Údaje, které lze zkusit doplnit z internetu.
  const missingFields = [
    !knownAuthors.length && 'autor',
    !book.publisher && 'nakladatelství',
    !book.publishedDate && 'rok vydání',
    !book.pageCount && 'počet stran',
    !book.language && 'jazyk',
    !(book.categories && book.categories.length) && 'žánr',
    !book.description && 'popis',
  ].filter(Boolean) as string[];

  // --- Kontrola formuláře ---
  const cleanIsbn = normalizeIsbn(form.isbn);
  const isbnConflict = cleanIsbn ? findBookByIsbn(cleanIsbn, books, book.id) : undefined;
  const isbnError = !cleanIsbn
    ? null
    : cleanIsbn.length !== 10 && cleanIsbn.length !== 13
    ? 'ISBN musí mít 10 nebo 13 číslic (nebo nechte pole prázdné).'
    : isbnConflict
    ? `Toto ISBN už má kniha „${isbnConflict.title}“.`
    : null;
  const isbnWarning =
    cleanIsbn && !isbnError && !isValidIsbn(cleanIsbn) ? 'Kontrolní číslice ISBN nesedí – zkontrolujte číslo.' : null;
  const pagesError =
    form.pageCount.trim() && !/^\d{1,5}$/.test(form.pageCount.trim()) ? 'Počet stran musí být celé číslo.' : null;
  const copiesError =
    !/^\d{1,4}$/.test(form.copies.trim()) || Number(form.copies) < 1 ? 'Počet výtisků musí být alespoň 1.' : null;
  const titleError = !form.title.trim() ? 'Vyplňte název knihy.' : null;
  const formError = titleError || isbnError || pagesError || copiesError;

  const handleSave = () => {
    if (formError) return;
    const authors = form.authorsStr.split(',').map((a) => a.trim()).filter(Boolean);
    const updated: Book = {
      ...book,
      title: form.title.trim(),
      authors: authors.length > 0 ? authors : ['Neznámý autor'],
      isbn: cleanIsbn,
      publisher: form.publisher.trim(),
      publishedDate: form.publishedDate.trim(),
      edition: form.edition.trim(),
      pageCount: form.pageCount.trim() ? Number(form.pageCount) : undefined,
      copies: Number(form.copies),
      language: form.language.trim() || undefined,
      categories: form.categories.split(',').map((c) => c.trim()).filter(Boolean),
      notes: form.notes.trim(),
      // Odstraníme automatický text „Informace nebyly nalezeny…“.
      description: book.metadataMissing ? '' : book.description,
      metadataMissing: false,
    };
    onUpdate(updated);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setForm(initial);
    setIsEditing(false);
  };

  const changeCopies = (delta: number) => {
    const next = Math.max(1, copies + delta);
    if (next !== copies) onUpdate({ ...book, copies: next });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-700"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Detail knihy"
      >
        {/* Header */}
        <div className="p-4 px-6 border-b border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <span className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            {isEditing ? 'Úprava knihy' : 'Detail knihy'}
          </span>
          <button
            onClick={onClose}
            aria-label="Zavřít"
            className="p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Znovu naskenovaná kniha – nabídka dalšího výtisku */}
          {showDuplicateNotice && !isEditing && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-900 dark:text-amber-100 space-y-2">
              <p className="font-semibold flex items-center">
                <Copy className="w-4 h-4 mr-1.5" />
                Tato kniha už v knihovně je ({copiesLabel(copies)}).
              </p>
              <p>Máte v ruce další výtisk? Přidejte ho, ať sedí počet kusů.</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    changeCopies(1);
                    setShowDuplicateNotice(false);
                  }}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg flex items-center"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Přidat další výtisk
                </button>
                <button
                  type="button"
                  onClick={() => setShowDuplicateNotice(false)}
                  className="px-3 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg"
                >
                  Ne, jen prohlížím
                </button>
              </div>
            </div>
          )}

          {/* Cover & Basic Info Header */}
          <div className="flex gap-4 items-start">
            <BookCover
              title={book.title}
              authors={book.authors}
              coverUrl={book.coverUrl}
              className="w-24 h-36 flex-shrink-0"
            />

            <div className="flex-1 min-w-0">
              {!isEditing ? (
                <>
                  <h3 className="text-xl font-semibold text-slate-900 dark:text-white leading-tight mb-1">
                    {book.title}
                  </h3>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2">
                    {book.authors.join(', ')}
                  </p>
                  <div className="inline-flex items-center space-x-1 bg-slate-100 dark:bg-slate-700 px-2.5 py-1 rounded-lg text-xs font-mono text-slate-700 dark:text-slate-300">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    <span>{book.isbn ? formatIsbn(book.isbn) : 'Bez ISBN'}</span>
                  </div>

                  {/* Počet výtisků */}
                  <div className="mt-3 flex items-center space-x-2 text-xs text-slate-600 dark:text-slate-300">
                    <span>Výtisků:</span>
                    <button
                      type="button"
                      onClick={() => changeCopies(-1)}
                      disabled={copies <= 1}
                      aria-label="Ubrat výtisk"
                      className="p-1 rounded-lg bg-slate-100 dark:bg-slate-700 disabled:opacity-40"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <strong className="text-sm text-slate-900 dark:text-white min-w-[1.5rem] text-center" data-testid="copies">
                      {copies}
                    </strong>
                    <button
                      type="button"
                      onClick={() => changeCopies(1)}
                      aria-label="Přidat výtisk"
                      className="p-1 rounded-lg bg-slate-100 dark:bg-slate-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  {book.metadataMissing && (
                    <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg p-2">
                      Údaje o knize se nepodařilo najít. Doplňte prosím název a autora.
                    </p>
                  )}
                  <div>
                    <label htmlFor="edit-title" className="block text-xs text-slate-500 mb-1">
                      Název knihy <span className="text-rose-500">*</span>
                    </label>
                    <input
                      id="edit-title"
                      type="text"
                      autoFocus={book.metadataMissing}
                      placeholder="Např. Babička"
                      value={form.title}
                      onChange={set('title')}
                      className={`${inputClass} text-sm font-semibold`}
                    />
                  </div>
                  <div>
                    <label htmlFor="edit-authors" className="block text-xs text-slate-500 mb-1">
                      Autoři (oddělení čárkou)
                    </label>
                    <input
                      id="edit-authors"
                      type="text"
                      placeholder="Např. Božena Němcová"
                      value={form.authorsStr}
                      onChange={set('authorsStr')}
                      className={`${inputClass} text-xs font-medium`}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Details / Edit Form */}
          {!isEditing ? (
            <div className="space-y-3 text-xs border-t border-slate-100 dark:border-slate-700/60 pt-4">
              {/* Přehled všech údajů o knize */}
              <div>
                <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Informace o knize</h4>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2" data-testid="book-info">
                  {infoRows.map(([Icon, label, value]) => (
                    <React.Fragment key={label}>
                      <dt className="flex items-center text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        <Icon className="w-3.5 h-3.5 mr-1.5 text-slate-400 flex-shrink-0" />
                        {label}
                      </dt>
                      <dd
                        className={
                          value
                            ? 'text-slate-800 dark:text-slate-100 font-medium min-w-0 break-words'
                            : 'text-slate-400 dark:text-slate-500 italic'
                        }
                      >
                        {value || 'neuvedeno'}
                      </dd>
                    </React.Fragment>
                  ))}
                </dl>

                {book.isbn && missingFields.length > 0 && onEnrich && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsEnriching(true);
                        try {
                          await onEnrich(book);
                        } finally {
                          setIsEnriching(false);
                        }
                      }}
                      disabled={isEnriching}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-medium flex items-center disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isEnriching ? 'animate-spin' : ''}`} />
                      {isEnriching ? 'Hledám údaje…' : 'Doplnit chybějící údaje z internetu'}
                    </button>
                    <p className="mt-1 text-[10px] text-slate-400">Chybí: {missingFields.join(', ')}</p>
                  </div>
                )}
              </div>

              {/* Popis / anotace */}
              {book.description && (
                <div>
                  <h4 className="text-base font-semibold text-slate-900 dark:text-white mb-1.5">Popis</h4>
                  <p
                    className={`text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line ${
                      showFullDescription ? '' : 'line-clamp-5'
                    }`}
                  >
                    {book.description}
                  </p>
                  {book.description.length > 300 && (
                    <button
                      type="button"
                      onClick={() => setShowFullDescription(!showFullDescription)}
                      className="mt-1 text-indigo-700 dark:text-indigo-300 font-medium"
                    >
                      {showFullDescription ? 'Zobrazit méně' : 'Zobrazit celý popis'}
                    </button>
                  )}
                </div>
              )}
              {book.notes && (
                <div className="bg-amber-50 dark:bg-amber-950/30 p-3 rounded-xl border border-amber-200/60 dark:border-amber-800/40 text-amber-900 dark:text-amber-200">
                  <span className="font-semibold block mb-1">Poznámka knihovníka:</span>
                  <p>{book.notes}</p>
                </div>
              )}

              {/* Jiná vydání stejné knihy */}
              {otherEditions.length > 0 && (
                <div className="bg-indigo-50 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/60">
                  <span className="font-semibold flex items-center mb-2 text-indigo-900 dark:text-indigo-200">
                    <Layers className="w-4 h-4 mr-1.5" />
                    Jiná vydání v knihovně ({otherEditions.length})
                  </span>
                  <ul className="space-y-1">
                    {otherEditions.map((other) => (
                      <li key={other.id}>
                        <button
                          type="button"
                          onClick={() => onSelectBook(other)}
                          className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-slate-700 dark:text-slate-200"
                        >
                          <span className="font-medium">{other.publishedDate || 'rok neznámý'}</span>
                          {other.edition ? ` · ${other.edition}` : ''}
                          {other.publisher ? ` · ${other.publisher}` : ''}
                          <span className="block text-[10px] font-mono text-slate-500">
                            {other.isbn ? formatIsbn(other.isbn) : 'Bez ISBN'} · {copiesLabel(getCopies(other))}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3 border-t border-slate-100 dark:border-slate-700/60 pt-4 text-xs">
              <div>
                <label htmlFor="edit-isbn" className="block text-slate-500 mb-1">
                  ISBN (nechte prázdné, pokud kniha ISBN nemá)
                </label>
                <input
                  id="edit-isbn"
                  type="text"
                  value={form.isbn}
                  onChange={set('isbn')}
                  className={`${inputClass} font-mono`}
                  placeholder="Např. 978-80-257-1234-4"
                />
                {(isbnError || isbnWarning) && (
                  <p className={`mt-1 ${isbnError ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                    {isbnError || isbnWarning}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="edit-publisher" className="block text-slate-500 mb-1">Nakladatelství</label>
                <input id="edit-publisher" type="text" value={form.publisher} onChange={set('publisher')} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-year" className="block text-slate-500 mb-1">Rok / datum vydání</label>
                  <input id="edit-year" type="text" value={form.publishedDate} onChange={set('publishedDate')} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="edit-edition" className="block text-slate-500 mb-1">Vydání</label>
                  <input
                    id="edit-edition"
                    type="text"
                    value={form.edition}
                    onChange={set('edition')}
                    placeholder="Např. 2. vydání"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-pages" className="block text-slate-500 mb-1">Počet stran</label>
                  <input
                    id="edit-pages"
                    type="text"
                    inputMode="numeric"
                    value={form.pageCount}
                    onChange={set('pageCount')}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-copies" className="block text-slate-500 mb-1">Počet výtisků</label>
                  <input
                    id="edit-copies"
                    type="text"
                    inputMode="numeric"
                    value={form.copies}
                    onChange={set('copies')}
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-language" className="block text-slate-500 mb-1">Jazyk</label>
                  <input
                    id="edit-language"
                    type="text"
                    value={form.language}
                    onChange={set('language')}
                    placeholder="Např. čeština"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-categories" className="block text-slate-500 mb-1">Žánr / téma (čárkou)</label>
                  <input
                    id="edit-categories"
                    type="text"
                    value={form.categories}
                    onChange={set('categories')}
                    placeholder="Např. pohádky, poezie"
                    className={inputClass}
                  />
                </div>
              </div>
              {(pagesError || copiesError) && (
                <p className="text-rose-600 dark:text-rose-400">{pagesError || copiesError}</p>
              )}
              <div>
                <label htmlFor="edit-notes" className="block text-slate-500 mb-1 flex items-center">
                  <FileText className="w-3.5 h-3.5 mr-1 text-slate-400" />
                  Poznámka knihovníka
                </label>
                <textarea
                  id="edit-notes"
                  rows={3}
                  value={form.notes}
                  onChange={set('notes')}
                  placeholder="Např. Státní knihovna, regál B-4, poškozený hřbet..."
                  className={inputClass}
                />
              </div>
              {titleError && (
                <p className="text-rose-600 dark:text-rose-400 flex items-center">
                  <AlertCircle className="w-3.5 h-3.5 mr-1" />
                  {titleError}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 px-6 border-t border-slate-100 dark:border-slate-700/60 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
          <button
            onClick={() => onDelete(book.id)}
            className="px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl font-medium text-xs flex items-center space-x-1.5 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Smazat</span>
          </button>

          {!isEditing ? (
            <button
              onClick={() => {
                // Vždy začít z aktuálních údajů (kniha se mohla mezitím změnit,
                // např. přidáním výtisku nebo doplněním údajů z internetu).
                setForm(initial);
                setIsEditing(true);
              }}
              className="px-4 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded-xl font-medium text-xs flex items-center space-x-1.5 hover:opacity-90 transition-opacity"
            >
              <Edit2 className="w-4 h-4" />
              <span>Upravit</span>
            </button>
          ) : (
            <div className="flex space-x-2">
              <button
                onClick={handleCancel}
                className="px-3 py-2 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-medium hover:bg-slate-200/60 transition-colors"
              >
                Zrušit
              </button>
              <button
                onClick={handleSave}
                disabled={Boolean(formError)}
                className="px-4 py-2 bg-indigo-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white rounded-xl font-medium text-xs flex items-center space-x-1.5 hover:bg-indigo-700 transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Uložit</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
