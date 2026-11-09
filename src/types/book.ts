export interface Book {
  id: string;
  /** ISBN bez pomlček; prázdný řetězec = kniha nemá ISBN (zapsaná ručně). */
  isbn: string;
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  /** Jazyk knihy jako kód ISO 639-1, např. „cs“, „en“. */
  language?: string;
  /** Odkud jsou údaje, např. „Obálky knih, Google Books“. */
  source?: string;
  addedAt: string;
  notes?: string;
  /** Označení vydání, např. „2. vydání“ nebo „brožované“. */
  edition?: string;
  /** Počet výtisků v knihovně (chybí = 1). */
  copies?: number;
  /** Údaje o knize se nepodařilo najít v databázích – je potřeba je doplnit ručně. */
  metadataMissing?: boolean;
}

export interface ScanRecord {
  id: string;
  isbn: string;
  scannedAt: string;
  status: 'added' | 'duplicate' | 'error';
  bookTitle?: string;
  bookId?: string;
  bookCoverUrl?: string;
}

export type ScanMode = 'camera' | 'manual' | 'list';

/** Jedna naskenovaná kniha v režimu rychlého skenování. */
export interface BatchItem {
  id: string;
  isbn: string;
  /**
   * pending  = hledá se v databázích
   * added    = nová kniha uložena
   * copy     = kniha už v knihovně byla → přidán další výtisk
   * skipped  = kniha už v knihovně byla → přeskočeno
   * notFound = uloženo, ale údaje se nenašly (doplnit ručně)
   * error    = chyba
   */
  status: 'pending' | 'added' | 'copy' | 'skipped' | 'notFound' | 'error';
  bookId?: string;
  title?: string;
  authors?: string[];
  coverUrl?: string;
  scannedAt: number;
  /** Akce byla vrácena zpět. */
  undone?: boolean;
}
