import React from 'react';
import { Check, Plus } from 'lucide-react';
import type { Book } from '../types/book';
import type { BookCandidate } from '../services/coverSearch';
import { BookCover } from './BookCover';
import { normalizeText } from '../utils/bookMatching';

interface CandidateListProps {
  candidates: BookCandidate[];
  books: Book[];
  onPick: (candidate: BookCandidate) => void;
  onSelectBook: (book: Book) => void;
  /** Kniha už v knihovně je → přidat další výtisk místo nového záznamu. */
  onAddCopy?: (book: Book) => void;
}

const CONFIDENCE_LABEL = {
  high: ['AI: jistě', 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800'],
  medium: ['AI: asi', 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:ring-sky-800'],
  low: ['AI: tip', 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:ring-slate-600'],
} as const;

/** Seznam knih nalezených podle obálky nebo názvu – knihovník vybere tu svou. */
export const CandidateList: React.FC<CandidateListProps> = ({ candidates, books, onPick, onSelectBook, onAddCopy }) => (
  <ul className="space-y-2">
    {candidates.map((c) => {
      const inLibrary = books.find((b) => normalizeText(b.title) === normalizeText(c.title));
      const meta = [c.year, c.publisher, c.pageCount && `${c.pageCount} stran`].filter(Boolean).join(' · ');
      const confidence = c.aiConfidence ? CONFIDENCE_LABEL[c.aiConfidence] : null;
      return (
        <li key={c.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
          <BookCover
            title={c.title}
            authors={c.authors}
            coverUrl={c.coverUrl}
            variant="compact"
            className="w-10 h-[3.75rem] flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">{c.title}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{c.authors.join(', ') || 'autor neuveden'}</p>
            {meta && <p className="text-[11px] text-slate-500 truncate">{meta}</p>}
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              {confidence && (
                <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold ring-1 ring-inset ${confidence[1]}`}>
                  {confidence[0]}
                </span>
              )}
              {inLibrary && (
                <button
                  type="button"
                  onClick={() => onSelectBook(inLibrary)}
                  className="py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 underline text-left"
                >
                  Už v knihovně je – zobrazit
                </button>
              )}
            </div>
          </div>
          {inLibrary && onAddCopy ? (
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => onAddCopy(inLibrary)}
                className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Výtisk
              </button>
              <button
                type="button"
                onClick={() => onPick(c)}
                className="py-2 text-[11px] text-slate-500 dark:text-slate-400 underline"
              >
                Je to jiná kniha
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onPick(c)}
              className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 flex-shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              Vybrat
            </button>
          )}
        </li>
      );
    })}
  </ul>
);
