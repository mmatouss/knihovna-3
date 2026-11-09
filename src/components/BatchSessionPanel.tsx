import React from 'react';
import { Undo2, RotateCcw, Volume2, VolumeX, Loader2, PencilLine } from 'lucide-react';
import type { BatchItem } from '../types/book';
import { BookCover } from './BookCover';
import { formatIsbn } from '../utils/isbn';

interface BatchSessionPanelProps {
  items: BatchItem[];
  duplicateMode: 'copy' | 'skip';
  onDuplicateModeChange: (mode: 'copy' | 'skip') => void;
  soundOn: boolean;
  onSoundChange: (on: boolean) => void;
  onUndo: (itemId: string) => void;
  onNewSession: () => void;
  /** Otevře knihu (např. k doplnění údajů). */
  onOpenBook: (bookId: string, edit: boolean) => void;
}

const STATUS: Record<BatchItem['status'], { label: string; className: string }> = {
  pending: { label: 'Hledám…', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  added: { label: 'Nová kniha', className: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200' },
  copy: { label: '+1 výtisk', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200' },
  skipped: { label: 'Už v knihovně', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  notFound: { label: 'Bez údajů', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
  error: { label: 'Chyba', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200' },
};

/** Lze akci vrátit zpět? */
function canUndo(item: BatchItem): boolean {
  return !item.undone && (item.status === 'added' || item.status === 'copy' || item.status === 'notFound');
}

export const BatchSessionPanel: React.FC<BatchSessionPanelProps> = ({
  items,
  duplicateMode,
  onDuplicateModeChange,
  soundOn,
  onSoundChange,
  onUndo,
  onNewSession,
  onOpenBook,
}) => {
  const active = items.filter((i) => !i.undone);
  const count = (status: BatchItem['status']) => active.filter((i) => i.status === status).length;
  const added = count('added') + count('notFound');
  const copies = count('copy');
  const notFound = count('notFound');
  const pending = count('pending');
  const lastUndoable = items.find(canUndo);

  return (
    <div className="w-full max-w-md mx-auto bg-white/90 dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_2px_rgba(60,40,20,0.05)] overflow-hidden">
      {/* Souhrn */}
      <div className="p-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 dark:text-slate-400">
            Tato relace
          </p>
          <p className="font-display text-4xl font-semibold text-slate-900 dark:text-white leading-none mt-1" data-testid="batch-count">
            {active.length}
            <span className="text-sm font-sans font-medium text-slate-500 dark:text-slate-400 ml-1.5">
              naskenováno
            </span>
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5" data-testid="batch-summary">
            {added} {added === 1 ? 'nová kniha' : added >= 2 && added <= 4 ? 'nové knihy' : 'nových knih'}
            {' · '}
            {copies} {copies === 1 ? 'výtisk navíc' : 'výtisků navíc'}
            {notFound > 0 && <span className="text-amber-700 dark:text-amber-300"> · {notFound} bez údajů</span>}
            {pending > 0 && <span className="text-slate-500"> · {pending} se hledá</span>}
          </p>
        </div>
        <div className="flex flex-col gap-1.5 items-end">
          <button
            type="button"
            onClick={() => lastUndoable && onUndo(lastUndoable.id)}
            disabled={!lastUndoable}
            className="px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-xs font-semibold flex items-center whitespace-nowrap disabled:opacity-30"
          >
            <Undo2 className="w-3.5 h-3.5 mr-1" />
            Vrátit poslední
          </button>
          <button
            type="button"
            onClick={onNewSession}
            disabled={items.length === 0}
            className="px-3 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-medium flex items-center whitespace-nowrap disabled:opacity-30"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Nová relace
          </button>
        </div>
      </div>

      {/* Nastavení */}
      <div className="px-4 pb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500 dark:text-slate-400">Kniha už v knihovně:</span>
        <div className="flex bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5" role="radiogroup" aria-label="Kniha už v knihovně">
          {(
            [
              ['copy', 'Přidat výtisk'],
              ['skip', 'Přeskočit'],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={duplicateMode === mode}
              onClick={() => onDuplicateModeChange(mode)}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                duplicateMode === mode
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSoundChange(!soundOn)}
          aria-pressed={soundOn}
          className="ml-auto p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center"
          title={soundOn ? 'Vypnout zvuk' : 'Zapnout zvuk'}
        >
          {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          <span className="ml-1">{soundOn ? 'Zvuk' : 'Bez zvuku'}</span>
        </button>
      </div>

      {/* Seznam naskenovaných knih */}
      {items.length === 0 ? (
        <p className="px-4 pb-5 pt-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60">
          Skenujte knihu za knihou. Každá se hned uloží; pípnutí potvrdí, že je hotovo. Jedno pípnutí = nová kniha,
          dvě pípnutí = další výtisk, nižší tóny = je potřeba něco zkontrolovat.
        </p>
      ) : (
        <ul className="border-t border-slate-100 dark:border-slate-700/60 divide-y divide-slate-100 dark:divide-slate-700/60 max-h-96 overflow-y-auto" data-testid="batch-list">
          {items.map((item) => {
            const status = STATUS[item.status];
            const time = new Date(item.scannedAt).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            return (
              <li key={item.id} className={`px-4 py-2.5 flex items-center gap-3 ${item.undone ? 'opacity-40' : ''}`}>
                <BookCover
                  title={item.title || item.isbn}
                  authors={item.authors}
                  coverUrl={item.coverUrl}
                  variant="compact"
                  className="w-8 h-11 flex-shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium text-slate-900 dark:text-white truncate ${item.undone ? 'line-through' : ''}`}>
                    {item.title || formatIsbn(item.isbn)}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center ${status.className}`}>
                      {item.status === 'pending' && <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />}
                      {item.undone ? 'Vráceno' : status.label}
                    </span>
                    <span className="text-[10px] text-slate-400">{time}</span>
                  </div>
                </div>
                {item.status === 'notFound' && !item.undone && item.bookId && (
                  <button
                    type="button"
                    onClick={() => onOpenBook(item.bookId!, true)}
                    className="px-2 py-1 rounded-md text-[11px] font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/40 flex items-center"
                  >
                    <PencilLine className="w-3 h-3 mr-1" />
                    Doplnit
                  </button>
                )}
                {canUndo(item) && (
                  <button
                    type="button"
                    onClick={() => onUndo(item.id)}
                    aria-label={`Vrátit: ${item.title || item.isbn}`}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  >
                    <Undo2 className="w-4 h-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

interface BatchLiveBarProps {
  items: BatchItem[];
  onUndo: (itemId: string) => void;
}

/**
 * Úzký pruh nad kamerou: počet naskenovaných knih a poslední kniha.
 * Knihovník tak vidí výsledek, aniž by musel posouvat stránku.
 */
export const BatchLiveBar: React.FC<BatchLiveBarProps> = ({ items, onUndo }) => {
  const count = items.filter((i) => !i.undone).length;
  const last = items[0];
  const status = last ? STATUS[last.status] : null;

  return (
    <div
      className="w-full max-w-md mx-auto flex items-center gap-3 bg-slate-900 dark:bg-slate-950 text-white rounded-2xl px-3.5 py-2.5 shadow-sm"
      data-testid="batch-live"
      aria-live="polite"
    >
      <div className="flex flex-col items-center leading-none min-w-[2.5rem]">
        <span className="font-display text-2xl font-semibold">{count}</span>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 mt-0.5">knih</span>
      </div>
      <div className="h-8 w-px bg-white/15" />
      {last ? (
        <>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-medium truncate ${last.undone ? 'line-through opacity-60' : ''}`}>
              {last.title || formatIsbn(last.isbn)}
            </p>
            {status && (
              <span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold inline-flex items-center ${status.className}`}>
                {last.status === 'pending' && <Loader2 className="w-3 h-3 mr-0.5 animate-spin" />}
                {last.undone ? 'Vráceno' : status.label}
              </span>
            )}
          </div>
          {canUndo(last) && (
            <button
              type="button"
              onClick={() => onUndo(last.id)}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center whitespace-nowrap"
            >
              <Undo2 className="w-3.5 h-3.5 mr-1" />
              Vrátit
            </button>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-300 flex-1">Připraveno – naskenujte první knihu.</p>
      )}
    </div>
  );
};
