import React, { useState } from 'react';
import { Search, AlertCircle, CheckCircle2, HelpCircle, BookOpen } from 'lucide-react';
import { isValidIsbn, normalizeIsbn, formatIsbn } from '../utils/isbn';

interface ManualIsbnInputProps {
  onSearch: (isbn: string) => void;
  isLoading: boolean;
}

export const ManualIsbnInput: React.FC<ManualIsbnInputProps> = ({ onSearch, isLoading }) => {
  const [inputVal, setInputVal] = useState('');
  const [showTips, setShowTips] = useState(false);

  const cleanVal = normalizeIsbn(inputVal);
  const isValid = cleanVal.length > 0 && isValidIsbn(cleanVal);
  const isLikelyPartial = cleanVal.length > 0 && (cleanVal.length === 10 || cleanVal.length === 13);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cleanVal) {
      onSearch(cleanVal);
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="isbn-input" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            ISBN číslo (10 nebo 13 číslic)
          </label>
          <div className="relative">
            <input
              id="isbn-input"
              type="text"
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
                ) : isLikelyPartial ? (
                  <AlertCircle className="w-5 h-5 text-amber-500" />
                ) : null}
              </div>
            )}
          </div>

          {cleanVal.length > 0 && (
            <div className="mt-2 text-xs flex justify-between items-center px-1">
              <span className="text-slate-500 dark:text-slate-400 font-mono">
                Čisté: {formatIsbn(cleanVal)}
              </span>
              {!isValid && isLikelyPartial && (
                <span className="text-amber-600 dark:text-amber-400">Kontrolní součet nesouhlasí, zkontrolovat.</span>
              )}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={!cleanVal || isLoading}
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
      </form>
    </div>
  );
};
