import React, { useRef, useState } from 'react';
import { Camera, Search, Loader2, AlertCircle, PenLine, X, Settings, Sparkles, KeyRound } from 'lucide-react';
import type { Book } from '../types/book';
import { CandidateList } from './CandidateList';
import { searchBooksByText, type BookCandidate } from '../services/coverSearch';
import { AiCoverError, HAS_BUILT_IN_KEY, getGeminiKey, identifyCoverWithAi, setGeminiKey } from '../services/aiCover';

interface CoverPhotoSearchProps {
  books: Book[];
  /** Knihovník vybral nalezenou knihu. `photoUrl` = jeho fotka obálky. */
  onPick: (candidate: BookCandidate, photoUrl?: string) => void;
  /** Nic nesedí → zapsat ručně (předvyplní se název, pokud nějaký je). */
  onManual: (title: string, photoUrl?: string) => void;
  /** Otevře knihu, která už v knihovně je. */
  onSelectBook: (book: Book) => void;
  /** Nalezená kniha už v knihovně je → přidat výtisk. */
  onAddCopy: (book: Book) => void;
}

type Phase = 'idle' | 'working' | 'results';

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-sm';


/**
 * Kniha bez ISBN: vyfoťte obálku a AI (Google Gemini) podle vzhledu
 * pozná, o jakou knihu jde. Jde i jen napsat název.
 */
export const CoverPhotoSearch: React.FC<CoverPhotoSearchProps> = ({ books, onPick, onManual, onSelectBook, onAddCopy }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [apiKey, setApiKey] = useState(getGeminiKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [results, setResults] = useState<BookCandidate[]>([]);

  const busy = phase === 'working';
  const keyMissing = !apiKey;

  const saveKey = () => {
    setGeminiKey(keyDraft);
    setApiKey(keyDraft.trim());
    setKeyDraft('');
    setShowSettings(false);
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setPhase('working');
    setError(null);
    setNote(undefined);
    setResults([]);
    try {
      const result = await identifyCoverWithAi(file, setStatus);
      setPhotoUrl(result.photoUrl);
      setResults(result.candidates);
      setNote(result.note);
      if (result.candidates.length === 0) {
        setError('AI tuhle knihu nepoznala. Napište název do pole výše, nebo knihu zapište ručně.');
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof AiCoverError ? err.message : 'Fotku se nepodařilo zpracovat. Zkuste to znovu.');
    } finally {
      setPhase('results');
    }
  };

  const runTextSearch = async () => {
    if (!query.trim()) return;
    setPhase('working');
    setStatus('Hledám knihu v databázích…');
    setError(null);
    setNote(undefined);
    try {
      const found = await searchBooksByText(query);
      setResults(found);
      if (found.length === 0) setError('Žádná kniha neodpovídá. Zkuste jen název, případně příjmení autora.');
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Vyhledávání se nepovedlo.');
    } finally {
      setPhase('results');
    }
  };

  const reset = () => {
    setPhase('idle');
    setError(null);
    setNote(undefined);
    setResults([]);
    setQuery('');
    setPhotoUrl(undefined);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Podle obálky (AI)</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kniha nemá ISBN? Vyfoťte obálku a AI pozná, o jakou knihu jde – i podle obrázku.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {phase !== 'idle' && !busy && (
            <button type="button" onClick={reset} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Začít znovu">
              <X className="w-5 h-5" />
            </button>
          )}
          {!keyMissing && !HAS_BUILT_IN_KEY && (
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="p-1 text-slate-400 hover:text-slate-600"
              aria-label="Nastavení AI klíče"
              aria-expanded={showSettings}
            >
              <Settings className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Nastavení klíče – zobrazí se, když klíč chybí, nebo po klepnutí na kolečko */}
      {!HAS_BUILT_IN_KEY && (keyMissing || showSettings) && (
        <form
          className="space-y-2 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900 text-xs text-slate-700 dark:text-slate-300"
          onSubmit={(e) => {
            e.preventDefault();
            saveKey();
          }}
        >
          <p className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
            <KeyRound className="w-4 h-4" />
            {keyMissing ? 'Pro rozpoznávání je potřeba klíč k Google Gemini (zdarma)' : 'Klíč k Google Gemini'}
          </p>
          {keyMissing && (
            <ol className="list-decimal pl-5 space-y-0.5">
              <li>
                Otevřete{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-indigo-700 dark:text-indigo-300 underline"
                >
                  aistudio.google.com/apikey
                </a>{' '}
                a přihlaste se Google účtem.
              </li>
              <li>Klepněte na „Create API key“ a klíč zkopírujte.</li>
              <li>Vložte ho sem. Uloží se jen v tomto zařízení.</li>
            </ol>
          )}
          <div className="flex gap-2">
            <input
              type="password"
              autoComplete="off"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={keyMissing ? 'Vložte klíč (začíná „AIza…“)' : 'Nový klíč'}
              className={inputClass}
              aria-label="Klíč k Gemini API"
            />
            <button
              type="submit"
              disabled={!keyDraft.trim()}
              className="px-3 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50"
            >
              Uložit
            </button>
          </div>
          {!keyMissing && (
            <button
              type="button"
              onClick={() => {
                setGeminiKey('');
                setApiKey('');
                setShowSettings(false);
              }}
              className="text-rose-700 dark:text-rose-400 underline"
            >
              Odebrat uložený klíč
            </button>
          )}
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Fotka obálky se pošle ke zpracování Googlu. V bezplatné verzi ji Google může použít ke zlepšování svých modelů.
          </p>
        </form>
      )}

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
        disabled={busy || keyMissing}
        onClick={() => fileRef.current?.click()}
        className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        <Camera className="w-4 h-4" />
        {photoUrl ? 'Vyfotit znovu' : 'Vyfotit obálku'}
      </button>
      {HAS_BUILT_IN_KEY && (
        <p className="-mt-2 text-[11px] text-center text-slate-500 dark:text-slate-400">
          Fotka se pošle k rozpoznání AI Google Gemini (může ji použít ke zlepšování svých modelů).
        </p>
      )}

      {/* Hledání podle napsaného názvu – funguje i bez AI klíče */}
      <form
        className="space-y-1"
        onSubmit={(e) => {
          e.preventDefault();
          runTextSearch();
        }}
      >
        <label htmlFor="cover-query" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
          Nebo napište název / autora
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

      {busy && (
        <div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 p-3 rounded-xl">
          <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
          <span>{status}</span>
        </div>
      )}

      {note && !busy && (
        <p className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl">
          <Sparkles className="w-4 h-4 flex-shrink-0 text-indigo-500" />
          <span>{note}</span>
        </p>
      )}

      {error && !busy && (
        <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </p>
      )}

      {phase === 'results' && results.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {photoUrl && (
              <img src={photoUrl} alt="Vaše fotka obálky" className="w-10 h-[3.75rem] object-cover rounded-sm shadow flex-shrink-0" />
            )}
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Která z nich je vaše kniha?</p>
          </div>
          <CandidateList
            candidates={results}
            books={books}
            onSelectBook={onSelectBook}
            onAddCopy={(book) => {
              onAddCopy(book);
              reset();
            }}
            onPick={(c) => {
              onPick(c, photoUrl);
              reset();
            }}
          />
        </div>
      )}

      {phase === 'results' && (
        <button
          type="button"
          onClick={() => {
            onManual(query, photoUrl);
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
