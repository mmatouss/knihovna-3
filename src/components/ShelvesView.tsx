import React from 'react';
import { ChevronRight, LibraryBig, Pencil, Plus } from 'lucide-react';
import type { Book, Shelf } from '../types/book';
import { BookCover } from './BookCover';
import { SHELF_SUGGESTIONS } from '../hooks/useShelves';
import { getCopies } from '../utils/bookMatching';

interface ShelvesViewProps {
  shelves: Shelf[];
  books: Book[];
  /** Otevře knihovnu s knihami z regálu ('none' = bez regálu). */
  onOpenShelf: (key: string) => void;
  /** Otevře správu regálů (přidat, přejmenovat, barva, smazat). */
  onManage: () => void;
  onAdd: (name: string) => Shelf | null;
  /** Otevře výběr knih, které se mají přidat do regálu. */
  onAddBooks: (shelf: Shelf) => void;
}

function booksLabel(n: number) {
  return `${n} ${n === 1 ? 'kniha' : n >= 2 && n <= 4 ? 'knihy' : 'knih'}`;
}

/** Jedna „police“ – karta regálu s náhledy obálek knih, které v něm stojí. */
const ShelfCard: React.FC<{
  name: string;
  color: string;
  books: Book[];
  onClick: () => void;
  /** Tlačítko „+ Přidat knihy“ (u „Bez regálu“ chybí). */
  onAddBooks?: () => void;
  muted?: boolean;
}> = ({ name, color, books, onClick, onAddBooks, muted }) => {
  const copies = books.reduce((sum, b) => sum + getCopies(b), 0);
  return (
    <div className="bg-white/90 dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-[0_1px_2px_rgba(60,40,20,0.05)] hover:shadow-md transition-all overflow-hidden flex flex-col">
    <button type="button" onClick={onClick} className="group text-left flex-1" aria-label={`Otevřít regál ${name}`}>
      {/* Police s knihami */}
      <div className="relative h-24 px-3 pt-3 flex items-end gap-1 overflow-hidden" style={{ backgroundColor: `${color}1f` }}>
        {books.length === 0 ? (
          <span className={`mb-3 text-[11px] ${muted ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>Zatím prázdný</span>
        ) : (
          books.slice(0, 5).map((b) => (
            <BookCover
              key={b.id}
              title={b.title}
              authors={b.authors}
              coverUrl={b.coverUrl}
              isbn={b.isbn}
              variant="compact"
              className="w-11 h-[4.1rem] flex-shrink-0 mb-1.5"
            />
          ))
        )}
        {/* Prkno police v barvě regálu */}
        <div className="absolute left-0 right-0 bottom-0 h-1.5" style={{ backgroundColor: color }} />
      </div>
      <div className="p-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{name}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            {booksLabel(books.length)}
            {copies > books.length && ` · ${copies} výtisků`}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 flex-shrink-0" />
      </div>
    </button>
    {onAddBooks && (
      <button
        type="button"
        onClick={onAddBooks}
        className="mx-3 mb-3 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 flex items-center justify-center gap-1"
      >
        <Plus className="w-3.5 h-3.5" />
        Přidat knihy
      </button>
    )}
    </div>
  );
};

/**
 * Záložka „Regály“: přehled regálů jako police s knihami. Klepnutím se
 * otevře knihovna jen s knihami z daného regálu.
 */
export const ShelvesView: React.FC<ShelvesViewProps> = ({ shelves, books, onOpenShelf, onManage, onAdd, onAddBooks }) => {
  const byShelf = new Map<string, Book[]>();
  const known = new Set(shelves.map((s) => s.id));
  for (const b of books) {
    const key = b.shelfId && known.has(b.shelfId) ? b.shelfId : 'none';
    byShelf.set(key, [...(byShelf.get(key) ?? []), b]);
  }
  const unshelved = byShelf.get('none') ?? [];

  return (
    <div className="w-full mx-auto space-y-4">
      <div className="bg-white/90 dark:bg-slate-800/90 rounded-2xl p-4 sm:p-5 border border-slate-200/80 dark:border-slate-700 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white leading-tight">Regály</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {shelves.length > 0
                ? `${shelves.length} ${shelves.length === 1 ? 'regál' : shelves.length <= 4 ? 'regály' : 'regálů'} · ${booksLabel(books.length - unshelved.length)} zařazeno`
                : 'Rozdělte knihy podle toho, kde stojí, nebo o čem jsou.'}
            </p>
          </div>
          {shelves.length > 0 && (
            <button
              type="button"
              onClick={onManage}
              className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap"
            >
              <Pencil className="w-3.5 h-3.5" />
              Upravit
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onManage}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          {shelves.length > 0 ? 'Nový regál' : 'Vytvořit první regál'}
        </button>
      </div>

      {shelves.length === 0 ? (
        <div className="bg-white/90 dark:bg-slate-800/90 rounded-2xl p-5 border border-slate-200/80 dark:border-slate-700 space-y-4 text-sm text-slate-600 dark:text-slate-300">
          <div className="flex gap-3">
            <LibraryBig className="w-8 h-8 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div className="space-y-1.5">
              <p className="font-semibold text-slate-900 dark:text-white">K čemu jsou regály?</p>
              <ul className="list-disc pl-4 space-y-1 text-xs">
                <li>Knihy rozdělíte do kategorií (Pohádky, Naučná…) nebo podle polic (Regál A, B…).</li>
                <li>V knihovně pak jedním klepnutím uvidíte jen knihy z jednoho regálu.</li>
                <li>Při skenování police po polici se nové knihy zařadí samy – stačí vybrat regál ve skeneru.</li>
              </ul>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Začněte jedním klepnutím:</p>
            <div className="flex flex-wrap gap-1.5">
              {SHELF_SUGGESTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onAdd(name)}
                  className="px-3 py-2 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-700 dark:text-slate-200 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                >
                  + {name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {shelves.map((s) => (
            <ShelfCard
              key={s.id}
              name={s.name}
              color={s.color}
              books={byShelf.get(s.id) ?? []}
              onClick={() => onOpenShelf(s.id)}
              onAddBooks={books.length > 0 ? () => onAddBooks(s) : undefined}
            />
          ))}
          {unshelved.length > 0 && (
            <ShelfCard name="Bez regálu" color="#9ca3af" books={unshelved} onClick={() => onOpenShelf('none')} muted />
          )}
        </div>
      )}
    </div>
  );
};
