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
}

export type ScanMode = 'camera' | 'manual' | 'list';
