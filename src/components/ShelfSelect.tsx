import React from 'react';
import type { Shelf } from '../types/book';

const NEW_SHELF = '__novy__';

interface ShelfSelectProps {
  shelves: Shelf[];
  /** Vybraný regál; '' = bez regálu. */
  value: string;
  /** `shelf` je vyplněný, když se regál právě vytvořil (ještě není v `shelves`). */
  onChange: (shelfId: string, shelf?: Shelf) => void;
  /** Vytvoří nový regál a vrátí ho (pro volbu „+ Nový regál…“). */
  onCreate: (name: string) => Shelf | null;
  /** Text volby „bez regálu“ (např. „Nezařazovat“ ve skeneru). */
  emptyLabel?: string;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Výběr regálu. Poslední volba „+ Nový regál…“ se zeptá na název
 * (na telefonu se otevře systémové okno s klávesnicí) a regál rovnou vybere.
 */
export const ShelfSelect: React.FC<ShelfSelectProps> = ({
  shelves,
  value,
  onChange,
  onCreate,
  emptyLabel = 'Bez regálu',
  id,
  className = '',
  ...rest
}) => {
  const exists = value === '' || shelves.some((s) => s.id === value);
  return (
    <select
      id={id}
      aria-label={rest['aria-label']}
      value={exists ? value : ''}
      onChange={(e) => {
        if (e.target.value !== NEW_SHELF) {
          onChange(e.target.value);
          return;
        }
        const name = window.prompt('Název nového regálu (např. Pohádky, Regál A):');
        const shelf = name ? onCreate(name) : null;
        if (shelf) onChange(shelf.id, shelf);
      }}
      className={className}
    >
      <option value="">{emptyLabel}</option>
      {shelves.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value={NEW_SHELF}>+ Nový regál…</option>
    </select>
  );
};
