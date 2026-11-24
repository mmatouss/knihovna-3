import React from 'react';
import type { Shelf } from '../types/book';

/** Malý štítek regálu: barevná tečka + název. */
export const ShelfBadge: React.FC<{ shelf: Shelf; className?: string }> = ({ shelf, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 max-w-full px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-700/70 text-slate-700 dark:text-slate-200 ${className}`}
    title={`Regál: ${shelf.name}`}
  >
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: shelf.color }} aria-hidden="true" />
    <span className="truncate">{shelf.name}</span>
  </span>
);
