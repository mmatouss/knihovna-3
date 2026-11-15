import React, { useRef, useState } from 'react';
import { Camera, Search, Loader2, AlertCircle, PenLine, X, Check } from 'lucide-react';
import type { Book } from '../types/book';
import { BookCover } from './BookCover';
import { normalizeText } from '../utils/bookMatching';
import {
  preloadCoverOcr,
  queryVariants,
  readCoverPhoto,
  searchBooksByText,
  type BookCandidate,
  type CoverTextLine,
} from '../services/coverSearch';

interface CoverPhotoSearchProps {
  books: Book[];
  /** Knihovník vybral nalezenou knihu. `photoUrl` = jeho fotka obálky. */
  onPick: (candidate: BookCandidate, photoUrl?: string) => void;
  /** Nic nesedí → zapsat ručně (předvyplní se rozpoznaný název). */
  onManual: (title: string, photoUrl?: string) => void;
  /** Otevře knihu, která už v knihovně je. */
  onSelectBook: (book: Book) => void;
}

type Phase = 'idle' | 'reading' | 'searching' | 'results';

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm';

/**
 * Kniha bez ISBN: vyfoťte obálku, aplikace přečte název a autora (OCR)
 * a najde knihu v online databázích. Jde i jen napsat název.
 */
export const CoverPhotoSearch: React.FC<CoverPhotoSearchProps> = ({ books, onPick, onManual, onSelectBook }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<CoverTextLine[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [results, setResults] = useState<BookCandidate[]>([]);

  const busy = phase === 'reading' || phase === 'searching';

  /** Hledá postupně podle dotazů; skončí u prvního, se kterým se něco najde. */
  const runSearch = async (texts: string[]) => {
    const queries = texts.filter((t) => t.trim());
    if (queries.length === 0) return;
    setPhase('searching');
    setStatus('Hledám knihu v databázích…');
    setError(null);
    try {
      let found: BookCandidate[] = [];
      for (const text of queries) {
        found = await searchBooksByText(text);
        if (found.length > 0) {
          setQuery(text);
          break;
        }
      }
      setResults(found);
      if (found.length === 0) {
        setError('Žádná kniha neodpovídá. Opravte text (stačí název, případně příjmení autora) a zkuste to znovu.');
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Vyhledávání se nepovedlo.');
    } finally {
      setPhase('results');
    }
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhase('reading');
    setError(null);
    setResults([]);
    setLines([]);
    try {
      const read = await readCoverPhoto(file, setStatus);
      setPhotoUrl(read.photoUrl);
      setLines(read.lines);
      setQuery(read.query);
      if (!read.query) {
        setError('Na fotce se nepodařilo přečíst žádný text. Zkuste obálku vyfotit zblízka a rovně, nebo název napište.');
        setPhase('results');
        return;
      }
      await runSearch(queryVariants(read.lines));
    } catch (err) {
      console.error(err);
      setError('Fotku se nepodařilo zpracovat. Zkontrolujte internet (při prvním použití se stahují data pro čtení textu).');
      setPhase('results');
    }
  };

  const reset = () => {
    setPhase('idle');
    setError(null);
    setResults([]);
    setLines([]);
    setQuery('');
    setPhotoUrl(undefined);
  };

  const findInLibrary = (candidate: BookCandidate) =>
    books.find((b) => normalizeText(b.title) === normalizeText(candidate.title));

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Camera className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Podle obálky</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kniha nemá ISBN? Vyfoťte obálku a aplikace knihu zkusí najít.
            </p>
          </div>
        </div>
        {phase !== 'idle' && !busy && (
          <button type="button" onClick={reset} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Začít znovu">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="cover-photo-input"
        onChange={(e) => {
          handlePhoto(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <button
        type="button"
        disabled={busy}
        onPointerEnter={preloadCoverOcr}
        onClick={() => {
          preloadCoverOcr();
          fileRef.current?.click();
        }}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        <Camera className="w-4 h-4" />
        {photoUrl ? 'Vyfotit znovu' : 'Vyfotit obálku'}
      </button>

      {/* Text pro hledání – rozpoznaný z fotky, nebo napsaný */}
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          runSearch([query]);
        }}
      >
        <label htmlFor="cover-query" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          {lines.length > 0 ? 'Přečtený text (můžete opravit)' : 'Nebo napište název / autora'}
        </label>
        <div className="flex gap-2">
          <input
            id="cover-query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Např. Dědečkové Pavel Čech"
            className={inputClass}
            disabled={busy}
          />
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="px-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 disabled:opacity-50"
            aria-label="Hledat"
          >
            <Search className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Další přečtené řádky – klepnutím se přidají do hledání */}
      {lines.length > 1 && !busy && (
        <div className="flex flex-wrap gap-1.5">
          {lines.slice(0, 8).map((line) => (
            <button
              key={line.text}
              type="button"
              onClick={() => setQuery((q) => (q.includes(line.text) ? q : `${q} ${line.text}`.trim()))}
              className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
              title="Přidat do hledání"
            >
              + {line.text}
            </button>
          ))}
        </div>
      )}

      {busy && (
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {error && !busy && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {phase === 'results' && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Která z nich je vaše kniha?</p>
          <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
            {results.map((c) => {
              const inLibrary = findInLibrary(c);
              const meta = [c.year, c.publisher, c.pageCount && `${c.pageCount} stran`].filter(Boolean).join(' · ');
              return (
                <li
                  key={c.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700"
                >
                  <BookCover
                    title={c.title}
                    authors={c.authors}
                    coverUrl={c.coverUrl}
                    variant="compact"
                    className="w-10 h-[3.75rem] flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug line-clamp-2">{c.title}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                      {c.authors.join(', ') || 'autor neuveden'}
                    </p>
                    {meta && <p className="text-[11px] text-slate-500 truncate">{meta}</p>}
                    {inLibrary && (
                      <button
                        type="button"
                        onClick={() => onSelectBook(inLibrary)}
                        className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 underline"
                      >
                        Už v knihovně je – zobrazit
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(c, photoUrl);
                      reset();
                    }}
                    className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 flex-shrink-0"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Vybrat
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {phase === 'results' && (
        <button
          type="button"
          onClick={() => {
            onManual(lines[0]?.text ?? query, photoUrl);
            reset();
          }}
          className="w-full py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-sm font-medium flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          <PenLine className="w-4 h-4" />
          Nic nesedí – zapsat ručně
        </button>
      )}
    </div>
  );
};
