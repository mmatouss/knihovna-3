import React, { useEffect, useState } from 'react';
import { Plus, Trash2, X, Library } from 'lucide-react';
import type { Book, Shelf } from '../types/book';
import { SHELF_COLORS, SHELF_SUGGESTIONS } from '../hooks/useShelves';

interface ShelfManagerProps {
  shelves: Shelf[];
  books: Book[];
  onAdd: (name: string) => Shelf | null;
  onUpdate: (id: string, patch: Partial<Pick<Shelf, 'name' | 'color'>>) => void;
  onDelete: (shelf: Shelf) => void;
  onClose: () => void;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm';

/** Okno pro správu regálů: přidat, přejmenovat, změnit barvu, smazat. */
export const ShelfManager: React.FC<ShelfManagerProps> = ({ shelves, books, onAdd, onUpdate, onDelete, onClose }) => {
  const [newName, setNewName] = useState('');
  // Rozpracované přejmenování (id regálu → text), uloží se při opuštění pole.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [colorFor, setColorFor] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const counts = new Map<string, number>();
  for (const b of books) if (b.shelfId) counts.set(b.shelfId, (counts.get(b.shelfId) ?? 0) + 1);
  const unusedSuggestions = SHELF_SUGGESTIONS.filter(
    (name) => !shelves.some((s) => s.name.toLocaleLowerCase('cs') === name.toLocaleLowerCase('cs'))
  );

  const add = (name: string) => {
    if (onAdd(name)) setNewName('');
  };

  const commitRename = (shelf: Shelf) => {
    const draft = drafts[shelf.id];
    if (draft !== undefined && draft.trim() && draft.trim() !== shelf.name) onUpdate(shelf.id, { name: draft });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[shelf.id];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Regály">
      <button type="button" className="absolute inset-0 bg-slate-950/60 anim-fade" onClick={onClose} aria-label="Zavřít" />
      <div className="relative w-full sm:max-w-md max-h-[90dvh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 anim-sheet">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Library className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              Regály
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rozdělte knihy do regálů nebo kategorií – třeba podle toho, kde stojí, nebo o čem jsou.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2.5 -m-1.5 rounded-lg text-slate-400 hover:text-slate-600" aria-label="Zavřít">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nový regál */}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(newName);
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nový regál, např. Regál A"
            maxLength={40}
            className={inputClass}
            aria-label="Název nového regálu"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Přidat
          </button>
        </form>

        {unusedSuggestions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Rychlé přidání:</p>
            <div className="flex flex-wrap gap-1.5">
              {unusedSuggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => add(name)}
                  className="px-3 py-2 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300"
                >
                  + {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Seznam regálů */}
        {shelves.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-4">Zatím žádné regály.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700/60 border-t border-slate-100 dark:border-slate-700/60">
            {shelves.map((shelf) => {
              const count = counts.get(shelf.id) ?? 0;
              return (
                <li key={shelf.id} className="py-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setColorFor(colorFor === shelf.id ? null : shelf.id)}
                      className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700"
                      aria-label={`Změnit barvu regálu ${shelf.name}`}
                      aria-expanded={colorFor === shelf.id}
                    >
                      <span className="w-5 h-5 rounded-full ring-2 ring-white dark:ring-slate-800 shadow" style={{ backgroundColor: shelf.color }} />
                    </button>
                    <input
                      value={drafts[shelf.id] ?? shelf.name}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [shelf.id]: e.target.value }))}
                      onBlur={() => commitRename(shelf)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
                      maxLength={40}
                      className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-transparent border border-transparent hover:border-slate-200 focus:border-slate-300 dark:hover:border-slate-600 text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      aria-label={`Název regálu ${shelf.name}`}
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {count} {count === 1 ? 'kniha' : count >= 2 && count <= 4 ? 'knihy' : 'knih'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const msg = count
                          ? `Smazat regál „${shelf.name}“? ${count} ${count === 1 ? 'kniha zůstane' : 'knih zůstane'} v knihovně, jen bez regálu.`
                          : `Smazat regál „${shelf.name}“?`;
                        if (window.confirm(msg)) onDelete(shelf);
                      }}
                      className="p-2.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      aria-label={`Smazat regál ${shelf.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {colorFor === shelf.id && (
                    <div className="flex flex-wrap gap-2 pl-12">
                      {SHELF_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => {
                            onUpdate(shelf.id, { color });
                            setColorFor(null);
                          }}
                          className={`w-9 h-9 rounded-full border-2 ${shelf.color === color ? 'border-slate-900 dark:border-white' : 'border-transparent'}`}
                          style={{ backgroundColor: color }}
                          aria-label={`Barva ${color}`}
                          aria-pressed={shelf.color === color}
                        />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
