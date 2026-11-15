import React, { useEffect, useState } from 'react';
import { AlertCircle, Camera, Loader2, PenLine, Sparkles, X } from 'lucide-react';
import type { Book } from '../types/book';
import type { BookCandidate } from '../services/coverSearch';
import { AiCoverError, identifyCoverWithAi } from '../services/aiCover';
import { CandidateList } from './CandidateList';

interface AiCoverSheetProps {
  /** Fotka obálky ze skeneru (okno se zobrazuje, jen dokud nějaká je). */
  photo: Blob;
  books: Book[];
  onPick: (candidate: BookCandidate, photoUrl?: string) => void;
  onManual: (title: string, photoUrl?: string) => void;
  onSelectBook: (book: Book) => void;
  /** Zavřít a vrátit se ke kameře (třeba vyfotit znovu). */
  onClose: () => void;
}

type State =
  | { phase: 'working'; status: string }
  | { phase: 'done'; candidates: BookCandidate[]; note?: string; photoUrl: string }
  | { phase: 'error'; message: string };

/**
 * Okno, které vyjede zespodu po klepnutí na „Vyfotit obálku s AI“ ve skeneru:
 * AI pozná knihu a knihovník vybere tu správnou.
 */
export const AiCoverSheet: React.FC<AiCoverSheetProps> = ({ photo, books, onPick, onManual, onSelectBook, onClose }) => {
  // Komponenta se vytváří znovu pro každou fotku (viz App.tsx), proto stačí počáteční stav.
  const [state, setState] = useState<State>({ phase: 'working', status: 'AI si prohlíží obálku…' });
  const [preview] = useState(() => URL.createObjectURL(photo));

  useEffect(() => () => URL.revokeObjectURL(preview), [preview]);

  useEffect(() => {
    let cancelled = false;
    identifyCoverWithAi(photo, (status) => !cancelled && setState({ phase: 'working', status }))
      .then((result) => {
        if (!cancelled) setState({ phase: 'done', ...result });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setState({
            phase: 'error',
            message: err instanceof AiCoverError ? err.message : 'Fotku se nepodařilo zpracovat. Zkuste to znovu.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [photo]);

  // Zavření klávesou Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const photoUrl = state.phase === 'done' ? state.photoUrl : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Rozpoznání obálky">
      <button type="button" className="absolute inset-0 bg-slate-950/60 anim-fade" onClick={onClose} aria-label="Zavřít" />
      <div className="relative w-full sm:max-w-md max-h-[88dvh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4 anim-sheet">
        <div className="mx-auto -mt-2 mb-1 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600 sm:hidden" />
        <div className="flex items-start gap-3">
          {preview && (
            <img src={preview} alt="Vyfocená obálka" className="w-14 h-20 object-cover rounded-md shadow flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Sparkles className="w-5 h-5 text-indigo-500" />
              Obálka s AI
            </h2>
            {state.phase === 'working' && (
              <p className="mt-1 flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
                <Loader2 className="w-4 h-4 animate-spin" />
                {state.status}
              </p>
            )}
            {state.phase === 'done' && state.candidates.length > 0 && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Která z nich je vaše kniha?</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Zavřít">
            <X className="w-5 h-5" />
          </button>
        </div>

        {state.phase === 'done' && state.note && (
          <p className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl">
            <Sparkles className="w-4 h-4 flex-shrink-0 text-indigo-500" />
            <span>{state.note}</span>
          </p>
        )}

        {(state.phase === 'error' || (state.phase === 'done' && state.candidates.length === 0)) && (
          <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {state.phase === 'error'
                ? state.message
                : 'AI tuhle knihu nepoznala. Zkuste obálku vyfotit celou a zblízka, nebo knihu zapište ručně.'}
            </span>
          </p>
        )}

        {state.phase === 'done' && state.candidates.length > 0 && (
          <CandidateList
            candidates={state.candidates}
            books={books}
            onSelectBook={onSelectBook}
            onPick={(c) => onPick(c, photoUrl)}
          />
        )}

        {state.phase !== 'working' && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Camera className="w-4 h-4" />
              Vyfotit znovu
            </button>
            <button
              type="button"
              onClick={() => onManual('', photoUrl)}
              className="py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <PenLine className="w-4 h-4" />
              Zapsat ručně
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
