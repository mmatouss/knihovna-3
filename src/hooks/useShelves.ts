import { useEffect, useState } from 'react';
import type { Shelf } from '../types/book';

const SHELVES_STORAGE_KEY = 'knihovnik_shelves_v1';

/** Barvy regálů – dobře čitelné ve světlém i tmavém režimu. */
export const SHELF_COLORS = [
  '#2f7d5b', // zelená
  '#2c6fb7', // modrá
  '#b4532a', // cihlová
  '#8a4fb5', // fialová
  '#c28a12', // okrová
  '#c2416b', // malinová
  '#2a8a94', // petrolejová
  '#6b6f7a', // šedá
];

/** Návrhy pro rychlý začátek, když knihovna ještě žádné regály nemá. */
export const SHELF_SUGGESTIONS = ['Beletrie', 'Naučná', 'Pohádky', 'Poezie', 'Učebnice', 'Komiksy'];

function loadShelves(): Shelf[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SHELVES_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as Shelf[]).filter((s) => s && s.id && s.name) : [];
  } catch {
    return [];
  }
}

/** Seřadí regály podle názvu (česky, „Regál 2“ před „Regál 10“). */
export function sortShelves(shelves: Shelf[]): Shelf[] {
  return [...shelves].sort((a, b) => a.name.localeCompare(b.name, 'cs', { numeric: true }));
}

/**
 * Regály uložené v tomto prohlížeči. Knihy na ně odkazují přes `book.shelfId`.
 */
export function useShelves() {
  const [shelves, setShelves] = useState<Shelf[]>(loadShelves);

  useEffect(() => {
    try {
      localStorage.setItem(SHELVES_STORAGE_KEY, JSON.stringify(shelves));
    } catch (e) {
      console.error('Regály se nepodařilo uložit:', e);
    }
  }, [shelves]);

  // Změny z jiné záložky (stejně jako u knih).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SHELVES_STORAGE_KEY) setShelves(loadShelves());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  /** Přidá regál; když už regál se stejným názvem je, vrátí ten. */
  const addShelf = (name: string, color?: string): Shelf | null => {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!clean) return null;
    const existing = shelves.find((s) => s.name.toLocaleLowerCase('cs') === clean.toLocaleLowerCase('cs'));
    if (existing) return existing;
    const shelf: Shelf = {
      id: `regal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      color: color ?? SHELF_COLORS[shelves.length % SHELF_COLORS.length],
      createdAt: new Date().toISOString(),
    };
    setShelves((prev) => [...prev, shelf]);
    return shelf;
  };

  const updateShelf = (id: string, patch: Partial<Pick<Shelf, 'name' | 'color'>>) => {
    setShelves((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, ...patch, name: patch.name !== undefined ? patch.name.trim().slice(0, 40) || s.name : s.name }
          : s
      )
    );
  };

  const deleteShelf = (id: string) => {
    setShelves((prev) => prev.filter((s) => s.id !== id));
  };

  return { shelves: sortShelves(shelves), addShelf, updateShelf, deleteShelf };
}
