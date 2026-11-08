import React, { useRef, useState } from 'react';
import { Search, AlertCircle, CheckCircle2, HelpCircle, BookOpen, ImagePlus } from 'lucide-react';
import { isValidIsbn, normalizeIsbn, formatIsbn } from '../utils/isbn';
import { preloadIsbnOcr, readIsbnFromFile } from '../services/isbnOcr';

interface ManualIsbnInputProps {
  onSearch: (isbn: string) => void;
  isLoading: boolean;
  /** Předvyplněné číslo (např. částečně přečtené skenerem) k ruční opravě. */
  initialValue?: string;
  /** Vysvětlení, proč je potřeba ruční zadání (zobrazí se nad polem). */
  initialNote?: string;
}

export const ManualIsbnInput: React.FC<ManualIsbnInputProps> = ({
  onSearch,
  isLoading,
  initialValue = '',
  initialNote,
}) => {
  const [inputVal, setInputVal] = useState(initialValue);
  const [note, setNote] = useState<string | undefined>(initialNote);
  const [showTips, setShowTips] = useState(false);
  const [isReadingPhoto, setIsReadingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const cleanVal = normalizeIsbn(inputVal);
  const hasFullLength = cleanVal.length === 10 || cleanVal.length === 13;
  const isValid = hasFullLength && isValidIsbn(cleanVal);
  // Kontrolní číslice nesedí – nejspíš je některá číslice opsaná špatně.
  const isChecksumWrong = hasFullLength && !isValid;
  // ISBN-13 musí začínat 978 nebo 979; znak X smí být jen na konci ISBN-10.
  const formatProblem =
    cleanVal.length === 13 && !/^97[89]/.test(cleanVal)
      ? 'ISBN-13 musí začínat 978 nebo 979.'
      : /X./.test(cleanVal) || (cleanVal.length === 13 && cleanVal.includes('X'))
      ? 'Znak X může být jen na konci 10místného ISBN.'
      : null;

  const submitIsbn = () => {
    if (!hasFullLength || isLoading) return;
    onSearch(cleanVal);
    setInputVal('');
    setNote(undefined);
    setPhotoMessage(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Platné ISBN se rovnou vyhledá. U nesedící kontrolní číslice je potřeba
    // kliknout na „Přesto uložit“ (některé starší knihy mají ISBN vytištěné s chybou).
    if (isValid) submitIsbn();
  };

  // Přečte vytištěné ISBN z fotky (tiráž, zadní strana obálky…) a rovnou knihu vyhledá.
  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsReadingPhoto(true);
    setPhotoMessage(null);
    try {
      const { isbn, guess } = await readIsbnFromFile(file);
      if (isbn) {
        setPhotoMessage({ ok: true, text: `Na fotce nalezeno ISBN ${formatIsbn(isbn)}.` });
        onSearch(isbn);
        setInputVal('');
        setNote(undefined);
      } else if (guess) {
        // Číslo se přečetlo jen částečně správně – předvyplníme ho k opravě.
        setInputVal(guess);
        setPhotoMessage({
          ok: false,
          text: 'Číslo se nepřečetlo celé správně (nesedí kontrolní číslice). Porovnejte ho s knihou a opravte.',
        });
      } else {
        setPhotoMessage({
          ok: false,
          text: 'Na fotce se nepodařilo najít platné ISBN. Zkuste ostřejší fotku zblízka, nebo číslo opište.',
        });
      }
    } catch (err) {
      console.error('OCR failed', err);
      setPhotoMessage({ ok: false, text: 'Čtení fotky selhalo. Zkontrolujte připojení k internetu.' });
    } finally {
      setIsReadingPhoto(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ruční zadání ISBN</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowTips(!showTips)}
          className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-1"
          title="Nápověda pro ruční zadání"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>

      {showTips && (
        <div className="bg-indigo-50 dark:bg-slate-700/50 rounded-xl p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
          <p className="font-semibold text-indigo-900 dark:text-indigo-300">Kde najít ISBN u starších knih?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Na tiráži (poslední nebo první strany knížky).</li>
            <li>Na zadní straně obálky nebo přebalu.</li>
            <li>U knih před r. 2007 bývá 10místné ISBN, u novějších 13místné.</li>
          </ul>
        </div>
      )}

      {note && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-200">
          {note}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="isbn-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            ISBN číslo (10 nebo 13 číslic)
          </label>
          <div className="relative">
            <input
              id="isbn-input"
              type="text"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              autoFocus={Boolean(initialValue || initialNote)}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              placeholder="Např. 9788020456123 nebo 802045612X"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono transition-all text-sm"
              disabled={isLoading}
            />
            {cleanVal.length > 0 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                {isValid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : hasFullLength ? (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                ) : null}
              </div>
            )}
          </div>

          {cleanVal.length > 0 && (
            <div className="mt-2 text-xs px-1 space-y-1">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  {hasFullLength ? formatIsbn(cleanVal) : cleanVal}
                </span>
                <span
                  className={`font-medium ${
                    isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {cleanVal.length} / {cleanVal.length > 10 || cleanVal.startsWith('97') ? 13 : '10 nebo 13'} číslic
                </span>
              </div>
              {formatProblem ? (
                <p className="text-amber-600 dark:text-amber-400">{formatProblem}</p>
              ) : isChecksumWrong ? (
                <p className="text-amber-600 dark:text-amber-400">
                  Kontrolní číslice nesedí – některá číslice je nejspíš opsaná špatně. Porovnejte číslo s knihou.
                </p>
              ) : cleanVal.length > 13 ? (
                <p className="text-amber-600 dark:text-amber-400">Číslo je moc dlouhé – ISBN má 10 nebo 13 číslic.</p>
              ) : null}
            </div>
          )}
        </div>

        {isChecksumWrong && !formatProblem ? (
          <button
            type="button"
            onClick={submitIsbn}
            disabled={isLoading}
            className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-medium rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.99]"
          >
            <AlertCircle className="w-5 h-5" />
            <span>Číslo je opsané správně – přesto uložit</span>
          </button>
        ) : (
        <button
          type="submit"
          disabled={!isValid || isLoading}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-medium rounded-xl flex items-center justify-center space-x-2 transition-all shadow-sm active:scale-[0.99]"
        >
          {isLoading ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>Vyhledat knihu</span>
            </>
          )}
        </button>
        )}
      </form>

      <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhoto}
          data-testid="isbn-photo-input"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onPointerEnter={preloadIsbnOcr}
          disabled={isReadingPhoto || isLoading}
          className="mt-3 w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60 text-slate-800 dark:text-slate-100 font-medium rounded-xl flex items-center justify-center space-x-2 transition-all text-sm"
        >
          {isReadingPhoto ? (
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <ImagePlus className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          )}
          <span>{isReadingPhoto ? 'Čtu číslo z fotky…' : 'Vyfotit nebo nahrát fotku s ISBN'}</span>
        </button>
        {photoMessage && (
          <p
            className={`mt-2 text-xs px-1 ${
              photoMessage.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {photoMessage.text}
          </p>
        )}
      </div>
    </div>
  );
};
