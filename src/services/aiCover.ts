import { searchBooksByText, type BookCandidate } from './coverSearch';
import { normalizeText } from '../utils/bookMatching';

/*
 * Rozpoznání knihy z fotky obálky pomocí AI (Google Gemini).
 *
 * AI se dívá na celou obálku – ilustraci, barvy, typ písma, logo nakladatele
 * i text – a zkusí poznat, o jakou knihu jde. Funguje i u obálek bez textu,
 * pokud jde o knihu, kterou AI „zná“.
 *
 * Klíč k Gemini API je zdarma (https://aistudio.google.com/apikey). Ukládá se
 * jen v prohlížeči tohoto zařízení (localStorage), nikam jinam se neposílá.
 */

const KEY_STORAGE = 'knihovnik_gemini_key';
const MODEL_STORAGE = 'knihovnik_gemini_model';
const API = 'https://generativelanguage.googleapis.com/v1beta';
const AI_TIMEOUT_MS = 45000;

/** Modely, které zkoušíme, když se seznam modelů nepodaří načíst. */
const FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3-flash-preview', 'gemini-3.6-flash', 'gemini-2.5-flash'];

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

export function setGeminiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(KEY_STORAGE, key.trim());
    else localStorage.removeItem(KEY_STORAGE);
    localStorage.removeItem(MODEL_STORAGE);
  } catch {
    /* úložiště nedostupné */
  }
}

/** Chyba se srozumitelnou českou zprávou pro knihovníka. */
export class AiCoverError extends Error {}

/** Jeden odhad AI. */
export interface AiGuess {
  title: string;
  authors: string[];
  year?: string;
  publisher?: string;
  language?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AiCoverResult {
  /** Nalezené knihy, nejpravděpodobnější první. */
  candidates: BookCandidate[];
  /** Krátký komentář AI (např. co na obálce vidí). */
  note?: string;
  /** Zmenšená fotka obálky – uloží se jako obálka knihy. */
  photoUrl: string;
}

// ---------------------------------------------------------------------------
// Obrázek
// ---------------------------------------------------------------------------

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AiCoverError('Obrázek se nepodařilo načíst.'));
    };
    img.src = url;
  });
}

/** Zmenší obrázek (delší strana nejvýš `maxSide` px) a vrátí ho jako JPEG data URL. */
function toJpeg(img: HTMLImageElement, maxSide: number, quality: number): string {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------

const PROMPT = `Na fotce je obálka knihy (může být i zepředu bez textu, jen s ilustrací).
Zjisti, o jakou knihu jde. Použij všechno: ilustraci, barvy, styl, typ písma, logo nakladatele, edici i text.
Často jde o české knihy ze školní knihovny – název a autory uveď tak, jak jsou na obálce (u českého vydání česky).
Vrať nejvýš 4 odhady od nejpravděpodobnějšího. U každého uveď jistotu:
"high" = jsi si jistý, "medium" = pravděpodobně, "low" = jen tip.
Nevymýšlej si: když knihu nepoznáš, vrať prázdný seznam "guesses" a do "note" napiš, co na obálce vidíš.
Rok vydání, nakladatele a jazyk (kód ISO 639-1, např. "cs") vyplň jen, když je to z obálky zřejmé.
"note" napiš česky, jednou krátkou větou.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    guesses: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          authors: { type: 'ARRAY', items: { type: 'STRING' } },
          year: { type: 'STRING' },
          publisher: { type: 'STRING' },
          language: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
        },
        required: ['title', 'authors', 'confidence'],
      },
    },
    note: { type: 'STRING' },
  },
  required: ['guesses'],
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (controller.signal.aborted) throw new AiCoverError('AI neodpověděla včas. Zkuste to znovu.');
    throw new AiCoverError('Nepodařilo se spojit s AI – zkontrolujte připojení k internetu.', { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

/** Seřadí názvy modelů od nejnovější verze („gemini-3.8-flash“ před „gemini-2.5-flash“). */
function byVersionDesc(a: string, b: string): number {
  const v = (name: string) => parseFloat(name.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? '0');
  return v(b) - v(a);
}

/**
 * Zjistí, které modely „flash“ (rychlé, s bezplatnou verzí) jsou pro klíč dostupné.
 * Nejdřív model, který naposledy fungoval.
 */
async function listModels(key: string): Promise<string[]> {
  let remembered = '';
  try {
    remembered = localStorage.getItem(MODEL_STORAGE) ?? '';
  } catch {
    /* nevadí */
  }
  let available: string[] = [];
  try {
    const res = await fetchWithTimeout(`${API}/models?pageSize=200&key=${encodeURIComponent(key)}`, {}, 10000);
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      throw new AiCoverError('Klíč k Gemini API není platný. Zkontrolujte ho v nastavení (ozubené kolečko).');
    }
    if (res.ok) {
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
      };
      available = (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
        // Rychlé modely, které umí obrázky; ne „lite“, obrázkové, hlasové, živé ani datované verze.
        .filter((n) => /^gemini-[\d.]+-flash(-preview)?$/.test(n))
        .sort(byVersionDesc);
    }
  } catch (err) {
    if (err instanceof AiCoverError && /není platný/.test(err.message)) throw err;
    // Seznam se nenačetl – použijeme známé názvy.
  }
  const models = [remembered, ...available, ...FALLBACK_MODELS].filter(Boolean);
  return [...new Set(models)].slice(0, 5);
}

async function askGemini(key: string, imageDataUrl: string): Promise<{ guesses: AiGuess[]; note?: string }> {
  const body = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: 'image/jpeg', data: imageDataUrl.split(',')[1] } },
          { text: PROMPT },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const models = await listModels(key);
  let lastProblem = '';
  for (const model of models) {
    const res = await fetchWithTimeout(
      `${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      AI_TIMEOUT_MS
    );
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const text = await res.text();
      if (/API key|API_KEY|PERMISSION_DENIED|UNAUTHENTICATED/i.test(text)) {
        throw new AiCoverError('Klíč k Gemini API není platný. Zkontrolujte ho v nastavení (ozubené kolečko).');
      }
      lastProblem = `model ${model}: chyba ${res.status}`;
      continue;
    }
    if (res.status === 429) {
      lastProblem = 'denní limit bezplatných dotazů je vyčerpaný';
      continue; // jiný model má vlastní limit
    }
    if (!res.ok) {
      // 404 = model neexistuje, 5xx = přetížení → zkusíme další model.
      lastProblem = `model ${model}: chyba ${res.status}`;
      continue;
    }

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('');
    if (!text) {
      lastProblem = data.promptFeedback?.blockReason ? 'AI odmítla obrázek zpracovat' : 'AI vrátila prázdnou odpověď';
      continue;
    }
    try {
      localStorage.setItem(MODEL_STORAGE, model);
    } catch {
      /* nevadí */
    }
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as { guesses?: AiGuess[]; note?: string };
    return {
      guesses: (parsed.guesses ?? []).filter((g) => g.title?.trim()),
      note: parsed.note,
    };
  }
  throw new AiCoverError(`AI teď nefunguje (${lastProblem || 'neznámá chyba'}). Zkuste to později, nebo název napište.`);
}

// ---------------------------------------------------------------------------
// Odhad AI → kniha s údaji z databází
// ---------------------------------------------------------------------------

/** Patří výsledek z databáze ke stejné knize jako odhad AI? */
function sameBook(guess: AiGuess, found: BookCandidate): boolean {
  const gt = normalizeText(guess.title);
  const ft = normalizeText(found.title);
  const titleOk = ft === gt || ft.startsWith(gt) || gt.startsWith(ft);
  if (!titleOk) return false;
  if (guess.authors.length === 0 || found.authors.length === 0) return true;
  const surname = (name: string) => normalizeText(name).split(' ').pop() ?? '';
  const guessSurnames = guess.authors.map(surname);
  return found.authors.some((a) => guessSurnames.includes(surname(a)));
}

/**
 * Ke každému odhadu AI dohledá v Google Books / Open Library další údaje
 * (rok, počet stran, popis, obálku). Název a autory necháváme podle AI,
 * protože odpovídají vyfocenému vydání.
 */
async function enrichGuess(guess: AiGuess, index: number): Promise<BookCandidate> {
  const base: BookCandidate = {
    id: `ai-${index}-${normalizeText(guess.title)}`,
    title: guess.title.trim(),
    authors: guess.authors.filter(Boolean),
    year: guess.year || undefined,
    publisher: guess.publisher || undefined,
    language: guess.language || undefined,
    source: 'AI odhad',
    aiConfidence: guess.confidence,
  };
  try {
    const found = await searchBooksByText([guess.title, guess.authors[0]].filter(Boolean).join(' '));
    const match = found.find((f) => sameBook(guess, f));
    if (!match) return base;
    return {
      ...match,
      ...Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)),
      id: base.id,
      source: match.source,
      aiConfidence: guess.confidence,
    } as BookCandidate;
  } catch {
    return base;
  }
}

const CONFIDENCE_ORDER = { high: 0, medium: 1, low: 2 } as const;

/** Pošle fotku obálky AI a vrátí nalezené knihy. */
export async function identifyCoverWithAi(file: Blob, onStatus?: (status: string) => void): Promise<AiCoverResult> {
  const key = getGeminiKey();
  if (!key) throw new AiCoverError('Nejdřív vložte klíč k Gemini API.');

  const img = await loadImage(file);
  const photoUrl = toJpeg(img, 300, 0.7);
  // Pro AI stačí menší obrázek – rychleji se odešle a méně čerpá limit.
  const aiImage = toJpeg(img, 1024, 0.85);

  onStatus?.('AI si prohlíží obálku…');
  const { guesses, note } = await askGemini(key, aiImage);
  if (guesses.length === 0) return { candidates: [], note, photoUrl };

  onStatus?.('Doplňuji údaje z databází knih…');
  const sorted = [...guesses].sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);
  const candidates = await Promise.all(sorted.slice(0, 4).map(enrichGuess));
  return { candidates, note, photoUrl };
}
