export interface Book {
  id: string;
  isbn: string;
  title: string;
  authors: string[];
  publisher?: string;
  publishedDate?: string;
  description?: string;
  coverUrl?: string;
  pageCount?: number;
  categories?: string[];
  addedAt: string;
  notes?: string;
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
