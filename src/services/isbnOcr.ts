import type { Worker } from 'tesseract.js';
import { isValidIsbn } from '../utils/isbn';

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
  const runs = upper.match(/[0-9X](?:[ -]{0,2}[0-9X]){8,20}/g) ?? [];
  const digitRuns = runs.map((run) => run.replace(/[^0-9X]/g, ''));

  for (const digits of digitRuns) {
    for (let i = 0; i + 13 <= digits.length; i++) {
      const candidate = digits.slice(i, i + 13);
      if (/^97[89]\d{10}$/.test(candidate) && isValidIsbn(candidate)) {
        return candidate;
      }
    }
  }

  for (const digits of digitRuns) {
    for (let i = 0; i + 10 <= digits.length; i++) {
      const candidate = digits.slice(i, i + 10);
      if (/^\d{9}[\dX]$/.test(candidate) && isValidIsbn(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

/**
 * Připraví obrázek pro OCR: převod na odstíny šedi a roztažení kontrastu.
 * Malé obrázky zvětší, aby měly číslice dost pixelů.
 */
function prepareCanvas(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const MIN_WIDTH = 1200;
  const MAX_WIDTH = 2000;
  let scale = 1;
  if (width < MIN_WIDTH) scale = MIN_WIDTH / width;
  if (width > MAX_WIDTH) scale = MAX_WIDTH / width;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
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
    data[i] = data[i + 1] = data[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Přečte ISBN z obrázku (snímek z kamery, fotka…). Vrátí null, když ho nenajde. */
export async function readIsbnFromImage(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<string | null> {
  const worker = await getWorker();
  const canvas = prepareCanvas(source, width, height);
  const { data } = await worker.recognize(canvas);
  return extractIsbnFromText(data.text);
}

/** Přečte ISBN z nahraného souboru s fotkou. */
export async function readIsbnFromFile(file: File): Promise<string | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    return await readIsbnFromImage(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
