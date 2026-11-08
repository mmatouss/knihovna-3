import type { Worker } from 'tesseract.js';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { isValidIsbn, normalizeIsbn } from '../utils/isbn';

/**
 * Čtení vytištěného čísla ISBN z obrázku (OCR) pomocí Tesseract.js.
 *
 * Tesseract (asi 3 MB dat) se stáhne až při prvním použití a pak zůstane
 * načtený, takže další čtení jsou rychlejší.
 */

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM, PSM } = await import('tesseract.js');
      const worker = await createWorker('eng', OEM.LSTM_ONLY);
      await worker.setParameters({
        // Hledáme jen číslice, X (ISBN-10), pomlčky a slovo "ISBN".
        tessedit_char_whitelist: '0123456789X-ISBN: ',
        // Text může být kdekoli v obrázku (např. tiráž s více řádky).
        tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      });
      return worker;
    })();
    // Když se načtení nepovede (např. bez internetu), zkusíme to příště znovu.
    workerPromise.catch(() => {
      workerPromise = null;
    });
  }
  return workerPromise;
}

/** Výsledek čtení: platné ISBN, nebo aspoň „odhad“ k ruční opravě. */
export interface IsbnReadResult {
  /** Platné ISBN (kontrolní číslice sedí). */
  isbn: string | null;
  /**
   * Číslo, které vypadá jako ISBN, ale kontrolní číslice nesedí
   * (např. jedna číslice je zakrytá skvrnou). Předvyplní se do ručního zadání.
   */
  guess: string | null;
}

/** Stáhne Tesseract dopředu, aby první čtení netrvalo tak dlouho. */
export function preloadIsbnOcr(): void {
  getWorker().catch(() => {});
}

/**
 * Najde v rozpoznaném textu platné ISBN (ověřuje kontrolní číslici,
 * takže špatně přečtené číslo se nepoužije).
 * Přednost má 13místné ISBN (978/979…), pak 10místné.
 */
export function extractIsbnFromText(text: string): string | null {
  const upper = text.toUpperCase().replace(/[–—]/g, '-');
  // Úseky číslic, mezi kterými mohou být pomlčky nebo mezery (ne konce řádků).
  const runs = upper.match(/[0-9X](?:[ -]{0,3}[0-9X]){8,20}/g) ?? [];
  const digitRuns = runs.map((run) => run.replace(/[^0-9X]/g, ''));

  for (const digits of digitRuns) {
    for (let i = 0; i + 13 <= digits.length; i++) {
      const candidate = digits.slice(i, i + 13);
      if (/^97[89]\d{10}$/.test(candidate) && isValidIsbn(candidate)) {
        return candidate;
      }
    }
  }

  // ISBN-10 bereme jen jako samostatné 10místné číslo (celý úsek, nebo jeho
  // část oddělenou mezerou). Výřez z delšího čísla by mohl náhodou „sedět“ –
  // např. z neplatného ISBN-13 by vzniklo falešné ISBN-10.
  const tenDigitCandidates = runs.flatMap((run) => [
    run.replace(/[^0-9X]/g, ''),
    ...run.split(/ +/).map((part) => part.replace(/[^0-9X]/g, '')),
  ]);
  for (const candidate of tenDigitCandidates) {
    if (/^\d{9}[\dX]$/.test(candidate) && isValidIsbn(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Najde číslo, které vypadá jako ISBN, i když kontrolní číslice nesedí.
 * Používá se jako předvyplněná hodnota pro ruční opravu.
 */
export function guessIsbnFromText(text: string): string | null {
  const upper = text.toUpperCase().replace(/[–—]/g, '-');
  const runs = (upper.match(/[0-9X](?:[ -]{0,3}[0-9X]){8,20}/g) ?? []).map((run) =>
    run.replace(/[^0-9X]/g, '')
  );
  for (const digits of runs) {
    const start = digits.search(/97[89]/);
    if (start >= 0 && digits.length - start >= 13) return digits.slice(start, start + 13);
  }
  return runs.find((d) => d.length === 13 || d.length === 10) ?? null;
}

/**
 * Varianty úpravy obrázku. Tesseract je citlivý na velikost písma a kontrast,
 * proto zkoušíme víc variant: šířka obrázku v px a jestli převést na čistě
 * černobílý (práh podle Otsua).
 */
export interface OcrVariant {
  width: number;
  blackWhite: boolean;
}

export const OCR_VARIANTS: OcrVariant[] = [
  { width: 1000, blackWhite: false },
  { width: 1000, blackWhite: true },
  { width: 1400, blackWhite: true },
  { width: 700, blackWhite: false },
  { width: 2000, blackWhite: false },
  { width: 1400, blackWhite: false },
  { width: 700, blackWhite: true },
  { width: 2000, blackWhite: true },
];

/** Bílý okraj kolem obrázku – Tesseract špatně čte text, který sahá až k okraji. */
const PADDING = 30;

/** Najde práh pro převod na černobílou (Otsuova metoda). */
function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t];
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * histogram[t];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/**
 * Připraví obrázek pro OCR: změna velikosti, odstíny šedi, roztažení kontrastu,
 * volitelně převod na černobílou a bílý okraj.
 */
function prepareCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
  variant: OcrVariant
): HTMLCanvasElement {
  const scale = variant.width / width;
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w + 2 * PADDING;
  canvas.height = h + 2 * PADDING;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, PADDING, PADDING, w, h);

  const img = ctx.getImageData(PADDING, PADDING, w, h);
  const data = img.data;
  const histogram = new Array<number>(256).fill(0);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    if (gray < min) min = gray;
    if (gray > max) max = gray;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.round(((data[i] - min) * 255) / range);
    data[i] = v;
    histogram[v]++;
  }
  const threshold = variant.blackWhite ? otsuThreshold(histogram, data.length / 4) : -1;
  for (let i = 0; i < data.length; i += 4) {
    const v = variant.blackWhite ? (data[i] > threshold ? 255 : 0) : data[i];
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(img, PADDING, PADDING);
  return canvas;
}

/**
 * Přečte ISBN z obrázku (snímek z kamery, fotka…).
 * Zkouší postupně varianty úpravy obrázku, dokud nenajde platné ISBN.
 */
export async function readIsbnFromImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  variants: OcrVariant[] = OCR_VARIANTS
): Promise<IsbnReadResult> {
  const worker = await getWorker();
  let guess: string | null = null;
  for (const variant of variants) {
    const canvas = prepareCanvas(source, width, height, variant);
    const { data } = await worker.recognize(canvas);
    const isbn = extractIsbnFromText(data.text);
    if (isbn) return { isbn, guess: null };
    guess = guess ?? guessIsbnFromText(data.text);
  }
  return { isbn: null, guess };
}

/** Zkusí na obrázku najít čárový kód EAN-13 s ISBN. */
function readBarcodeFromImage(source: CanvasImageSource, width: number, height: number): string | null {
  const scale = Math.min(1, 2000 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  try {
    const code = normalizeIsbn(new BrowserMultiFormatReader(hints).decodeFromCanvas(canvas).getText());
    return /^97[89]\d{10}$/.test(code) && isValidIsbn(code) ? code : null;
  } catch {
    return null;
  }
}

/** Přečte ISBN z nahraného souboru s fotkou (nejdřív čárový kód, pak vytištěné číslo). */
export async function readIsbnFromFile(file: File): Promise<IsbnReadResult> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const fromBarcode = readBarcodeFromImage(bitmap, bitmap.width, bitmap.height);
    if (fromBarcode) return { isbn: fromBarcode, guess: null };
    return await readIsbnFromImage(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
