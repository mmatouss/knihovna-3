/**
 * Zvuková a vibrační odezva při skenování (aby knihovník nemusel koukat
 * na displej). Zvuk se generuje přes Web Audio API, žádné soubory.
 */

export type FeedbackKind = 'added' | 'copy' | 'warning' | 'error';

let audioContext: AudioContext | null = null;

/**
 * Prohlížeče povolí zvuk až po akci uživatele – proto se zvuk „odemkne“
 * při zapnutí rychlého skenování (kliknutí na přepínač).
 */
export function unlockAudio(): void {
  try {
    if (!audioContext) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
    }
    if (audioContext.state === 'suspended') void audioContext.resume();
  } catch {
    audioContext = null;
  }
}

function beep(frequency: number, startOffset: number, duration: number, volume = 0.18): void {
  if (!audioContext) return;
  const start = audioContext.currentTime + startOffset;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/**
 * - added:   jedno vysoké pípnutí (nová kniha)
 * - copy:    dvě pípnutí (další výtisk knihy, která už v knihovně je)
 * - warning: dva klesající tóny (údaje nenalezeny / přeskočeno)
 * - error:   hluboký tón (chyba)
 */
export function playFeedback(kind: FeedbackKind, sound = true): void {
  if (sound) {
    if (kind === 'added') beep(1320, 0, 0.12);
    if (kind === 'copy') {
      beep(1320, 0, 0.08);
      beep(1320, 0.12, 0.08);
    }
    if (kind === 'warning') {
      beep(880, 0, 0.12);
      beep(660, 0.14, 0.16);
    }
    if (kind === 'error') beep(220, 0, 0.35, 0.22);
  }
  try {
    const pattern = { added: [60], copy: [60, 60, 60], warning: [120, 80, 120], error: [300] }[kind];
    navigator.vibrate?.(pattern);
  } catch {
    /* vibrace nejsou podporované */
  }
}
