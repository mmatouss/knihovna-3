import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { SwitchCamera, AlertTriangle, RefreshCw, Zap, ZapOff, ScanText, Keyboard, Sparkles } from 'lucide-react';
import { normalizeIsbn } from '../utils/isbn';
import { OCR_VARIANTS, preloadIsbnOcr, readIsbnFromImage } from '../services/isbnOcr';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningActive: boolean;
  /**
   * Dočasně nečíst kódy (např. je otevřený detail knihy nebo se kniha vyhledává).
   * Kamera přitom běží dál, takže po zavření detailu se hned pokračuje.
   */
  isPaused?: boolean;
  /**
   * Za jak dlouho (ms) může být stejný kód hlášen znovu, když mezitím zmizel
   * ze záběru. V rychlém skenování kratší, aby šlo skenovat víc stejných výtisků.
   */
  repeatDelayMs?: number;
  /**
   * Přepne na ruční zadání ISBN (když čtení nejde, např. kvůli skvrně).
   * `prefill` je částečně přečtené číslo, které stačí opravit.
   */
  onManualEntry?: (prefill?: string, note?: string) => void;
  /** Vyfotí obálku z kamery a pošle ji k rozpoznání AI (kniha bez ISBN). */
  onCoverPhoto?: (photo: Blob) => void;
}

/**
 * Objektivy, které ke skenování knih nechceme: ultraširokoúhlý („0,5×“),
 * teleobjektiv a „dvojité/trojité“ kamery iPhonu, které často startují na 0,5×.
 * Hlavní zadní fotoaparát (1×) má popisek jen „Back Camera“ / „Zadní fotoaparát“.
 */
const ODD_LENS = /ultra|tele|dual|triple|du[aá]ln|trojit|široko|wide|0[.,]5/i;
const FRONT_CAMERA = /front|přední|user|selfie|facetime|facing front/i;
// Pozn.: „Back Dual Wide Camera“ obsahuje „wide“ – proto je ODD_LENS i na „wide“,
// hlavní „Back Camera“ ho nemá.

/** Kamery, mezi kterými dává smysl přepínat (bez zvláštních objektivů). */
function usableCameras(cameras: Array<{ id: string; label: string }>) {
  const normal = cameras.filter((c) => !ODD_LENS.test(c.label));
  return normal.length > 0 ? normal : cameras;
}

// Kolikrát za sekundu zkoušíme přečíst čárový kód.
const SCAN_INTERVAL_MS = 120;

// Oblast, ve které hledáme čárový kód (vůči šířce náhledu kamery).
// Je o něco větší než nakreslený rámeček, aby kód nemusel být přesně uvnitř.
const SCAN_REGION_WIDTH = 0.95;
const SCAN_REGION_HEIGHT = 0.6;

// Max. šířka výřezu v pixelech – větší obraz by zbytečně zpomaloval dekódování.
const MAX_SCAN_WIDTH = 1280;

// Pauza mezi automatickými pokusy přečíst vytištěné číslo (OCR je pomalejší).
const AUTO_OCR_PAUSE_MS = 300;

function createReader() {
  const hints = new Map<DecodeHintType, unknown>();
  // ISBN je vždy čárový kód EAN-13 (začíná 978 nebo 979).
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints);
}

/**
 * Vyřízne z aktuálního snímku videa oblast kolem rámečku v PLNÉM rozlišení kamery
 * (ne zmenšenou na velikost obrazovky), aby šel přečíst i menší čárový kód.
 */
function captureScanRegion(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  widthFraction = SCAN_REGION_WIDTH,
  heightFraction = SCAN_REGION_HEIGHT,
  maxWidth = MAX_SCAN_WIDTH
): boolean {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  if (!vw || !vh || !cw || !ch) return false;

  // Video je zobrazeno s object-fit: cover – spočítáme, jaká část snímku je vidět.
  const scale = Math.max(cw / vw, ch / vh);
  const visibleW = cw / scale;
  const visibleH = ch / scale;
  const visibleX = (vw - visibleW) / 2;
  const visibleY = (vh - visibleH) / 2;

  // Oblast skenování je vycentrovaná stejně jako nakreslený rámeček.
  const regionW = Math.min(visibleW * widthFraction, vw);
  const regionH = Math.min(visibleW * heightFraction, visibleH);
  const sx = Math.max(0, visibleX + (visibleW - regionW) / 2);
  const sy = Math.max(0, visibleY + (visibleH - regionH) / 2);

  const outScale = Math.min(1, maxWidth / regionW);
  const outW = Math.round(regionW * outScale);
  const outH = Math.round(regionH * outScale);
  if (canvas.width !== outW) canvas.width = outW;
  if (canvas.height !== outH) canvas.height = outH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(video, sx, sy, regionW, regionH, 0, 0, outW, outH);
  return true;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, isScanningActive, isPaused = false, repeatDelayMs = 5000, onManualEntry, onCoverPhoto }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);
  // Když běží ruční čtení tlačítkem, automatické čtení čísla počká.
  const manualOcrRunningRef = useRef(false);
  const isPausedRef = useRef(isPaused);
  const repeatDelayRef = useRef(repeatDelayMs);
  useEffect(() => {
    repeatDelayRef.current = repeatDelayMs;
  }, [repeatDelayMs]);
  useEffect(() => {
    isPausedRef.current = isPaused;
    // Po pauze (zavření detailu knihy) nehlásit znovu kód, který je pořád v záběru.
    if (!isPaused && lastScannedRef.current) lastScannedRef.current.time = Date.now();
  }, [isPaused]);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  // Prázdný řetězec = výchozí zadní kamera (facingMode: environment).
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [isTorchSupported, setIsTorchSupported] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isReadingText, setIsReadingText] = useState<boolean>(false);
  const [textReadError, setTextReadError] = useState<string | null>(null);
  // Částečně přečtené číslo z posledního neúspěšného čtení (k ruční opravě).
  const [textReadGuess, setTextReadGuess] = useState<string | null>(null);

  // Keep latest onScanSuccess ref without causing scanner restart
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const handleSuccess = useCallback((decodedText: string) => {
    const clean = normalizeIsbn(decodedText);
    if (!clean) return;

    // Only process valid ISBN lengths (10 or 13 digits)
    if (clean.length !== 10 && clean.length !== 13) return;

    // Stejný kód, který je pořád v záběru, nehlásíme znovu. Znovu se načte až poté,
    // co nebyl vidět aspoň `repeatDelayMs` (výchozí 5 s) (čas se obnovuje při každém dalším přečtení).
    const now = Date.now();
    if (isPausedRef.current) return;
    if (
      lastScannedRef.current &&
      lastScannedRef.current.code === clean &&
      now - lastScannedRef.current.time < repeatDelayRef.current
    ) {
      lastScannedRef.current.time = now;
      return;
    }

    lastScannedRef.current = { code: clean, time: now };

    // Haptic feedback if available
    if (navigator.vibrate) {
      try { navigator.vibrate(100); } catch { /* ignore */ }
    }
    setScannedFeedback(clean);
    setTimeout(() => setScannedFeedback(null), 1500);

    onScanSuccessRef.current(clean);
  }, []);

  useEffect(() => {
    if (!isScanningActive) return;

    let cancelled = false;
    let scanTimer: ReturnType<typeof setTimeout> | null = null;
    let ocrTimer: ReturnType<typeof setTimeout> | null = null;
    const reader = createReader();
    const canvas = document.createElement('canvas');
    const videoEl = videoRef.current;

    const scanLoop = () => {
      if (cancelled) return;
      const video = videoEl;
      if (
        video &&
        !isPausedRef.current &&
        video.readyState >= video.HAVE_CURRENT_DATA &&
        captureScanRegion(video, canvas)
      ) {
        try {
          const result = reader.decodeFromCanvas(canvas);
          handleSuccess(result.getText());
        } catch {
          // V tomto snímku nebyl kód nalezen – zkusíme další.
        }
      }
      scanTimer = setTimeout(scanLoop, SCAN_INTERVAL_MS);
    };

    // Automatické čtení vytištěného čísla ISBN (bez čárového kódu) na pozadí.
    // Každý pokus použije jinou úpravu obrázku, takže se během pár sekund
    // vystřídají všechny varianty. Přijme se jen číslo s platnou kontrolní číslicí.
    let ocrVariantIndex = 0;
    let ocrFailures = 0;
    const ocrLoop = async () => {
      if (cancelled) return;
      const video = videoEl;
      let delay = AUTO_OCR_PAUSE_MS;
      if (
        video &&
        !manualOcrRunningRef.current &&
        !isPausedRef.current &&
        video.readyState >= video.HAVE_CURRENT_DATA
      ) {
        const ocrCanvas = document.createElement('canvas');
        if (captureScanRegion(video, ocrCanvas, SCAN_REGION_WIDTH, SCAN_REGION_HEIGHT, 2000)) {
          const variant = OCR_VARIANTS[ocrVariantIndex++ % OCR_VARIANTS.length];
          try {
            const result = await readIsbnFromImage(ocrCanvas, ocrCanvas.width, ocrCanvas.height, [variant]);
            ocrFailures = 0;
            if (result.isbn && !cancelled) handleSuccess(result.isbn);
          } catch (err) {
            // Např. se nepodařilo stáhnout Tesseract (bez internetu) – zkusíme později.
            console.warn('Automatic OCR failed', err);
            ocrFailures++;
            delay = Math.min(60000, 5000 * ocrFailures);
          }
        }
      }
      if (!cancelled) ocrTimer = setTimeout(ocrLoop, delay);
    };

    async function start() {
      setIsInitializing(true);
      setErrorMsg(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg('Tento prohlížeč nepodporuje kameru. Stránka musí běžet přes HTTPS.');
        setIsInitializing(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(selectedCameraId
              ? { deviceId: { exact: selectedCameraId } }
              : { facingMode: { ideal: 'environment' } }),
            // Vyšší rozlišení = čitelnější čárový kód i z větší vzdálenosti.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];

        // Průběžné ostření, pokud ho kamera podporuje (hlavně Android).
        try {
          await track?.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as unknown as MediaTrackConstraintSet],
          });
        } catch { /* nepodporováno */ }

        try {
          const capabilities = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
          setIsTorchSupported(Boolean(capabilities.torch));
        } catch {
          setIsTorchSupported(false);
        }
        setIsTorchOn(false);

        const video = videoEl;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {});
        }

        // Seznam kamer (popisky jsou dostupné až po udělení oprávnění).
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const list = devices
              .filter((d) => d.kind === 'videoinput')
              .map((d, i) => ({ id: d.deviceId, label: d.label || `Kamera ${i + 1}` }));
            setCameras(list);
            // Prohlížeč vybral ultraširokoúhlý / „trojitý“ objektiv (obraz na 0,5×,
            // neostří zblízka) → přepneme na hlavní zadní fotoaparát.
            const activeLabel = track?.label ?? '';
            if (!selectedCameraId && ODD_LENS.test(activeLabel)) {
              const main = list.find((c) => !ODD_LENS.test(c.label) && !FRONT_CAMERA.test(c.label));
              if (main) {
                setSelectedCameraId(main.id);
                return; // kamera se spustí znovu s hlavním objektivem
              }
            }
          }
        } catch { /* ignore */ }

        if (!cancelled) {
          setIsInitializing(false);
          scanLoop();
          ocrLoop();
        }
      } catch (err: unknown) {
        if (cancelled) return;
        console.error('Error starting camera', err);
        const name = err instanceof Error ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setErrorMsg('Přístup ke kameře byl zamítnut. Povolte prosím přístup ke kameře v nastavení prohlížeče.');
        } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
          setErrorMsg('Nebyla nalezena žádná použitelná kamera na tomto zařízení.');
        } else {
          setErrorMsg('Chyba při spuštění kamery. Zkontrolujte, zda kamera není používána jinou aplikací.');
        }
        setIsInitializing(false);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (scanTimer) clearTimeout(scanTimer);
      if (ocrTimer) clearTimeout(ocrTimer);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl) videoEl.srcObject = null;
      setIsTorchSupported(false);
      setIsTorchOn(false);
    };
  }, [selectedCameraId, isScanningActive, retryCounter, handleSuccess]);

  /**
   * Přečte vytištěné číslo ISBN (bez čárového kódu) z aktuálního snímku kamery.
   * Nejdřív zkusí oblast kolem rámečku, pak celý viditelný obraz.
   */
  const readPrintedIsbn = async () => {
    const video = videoRef.current;
    if (!video || isReadingText) return;
    manualOcrRunningRef.current = true;
    setIsReadingText(true);
    setTextReadError(null);
    setTextReadGuess(null);

    try {
      const attempts: Array<[number, number, number]> = [
        [SCAN_REGION_WIDTH, SCAN_REGION_HEIGHT, 4], // oblast kolem rámečku, 4 varianty úprav
        [1, 10, 2], // celý viditelný obraz (výška se omezí na viditelnou část), 2 varianty
      ];
      let guess: string | null = null;
      for (const [w, h, variantCount] of attempts) {
        const canvas = document.createElement('canvas');
        if (!captureScanRegion(video, canvas, w, h, 4000)) continue;
        const result = await readIsbnFromImage(
          canvas,
          canvas.width,
          canvas.height,
          OCR_VARIANTS.slice(0, variantCount)
        );
        if (result.isbn) {
          handleSuccess(result.isbn);
          return;
        }
        guess = guess ?? result.guess;
      }
      setTextReadGuess(guess);
      setTextReadError(
        guess
          ? `Přečteno ${guess}, ale číslo nesedí (asi skvrna nebo odlesk). Zkuste znovu, nebo ho opravte ručně.`
          : 'Číslo ISBN se nepodařilo přečíst. Dejte ho do rámečku, přibližte a zkuste znovu.'
      );
    } catch (err) {
      console.error('OCR failed', err);
      setTextReadError('Čtení textu selhalo. Zkontrolujte připojení k internetu a zkuste znovu.');
    } finally {
      manualOcrRunningRef.current = false;
      setIsReadingText(false);
    }
  };

  useEffect(() => {
    if (!textReadError) return;
    const t = setTimeout(() => setTextReadError(null), 6000);
    return () => clearTimeout(t);
  }, [textReadError]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nextTorchState = !isTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorchState } as unknown as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextTorchState);
    } catch (err) {
      console.error('Failed to toggle torch', err);
    }
  };

  const switchableCameras = usableCameras(cameras);

  const switchCamera = () => {
    if (switchableCameras.length <= 1) return;
    const currentId = selectedCameraId || streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId || '';
    const currentIndex = switchableCameras.findIndex((c) => c.id === currentId);
    const nextIndex = (currentIndex + 1) % switchableCameras.length;
    setSelectedCameraId(switchableCameras[nextIndex].id);
  };

  /** Vyfotí aktuální obraz z kamery (celý, v plném rozlišení) pro AI. */
  const takeCoverPhoto = () => {
    const video = videoRef.current;
    if (!video || !onCoverPhoto || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    canvas.toBlob((blob) => blob && onCoverPhoto(blob), 'image/jpeg', 0.9);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-lg border border-slate-800 text-white relative">
      {/* Viewport container */}
      <div className="relative aspect-[3/4] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          muted
          playsInline
        />

        {/* Svítilna a přepnutí kamery – kulatá tlačítka v rohu obrazu */}
        {isScanningActive && !errorMsg && !isInitializing && (isTorchSupported || switchableCameras.length > 1) && (
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            {isTorchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                  isTorchOn ? 'bg-amber-400 text-slate-950' : 'bg-black/50 text-white hover:bg-black/70'
                }`}
                aria-label={isTorchOn ? 'Vypnout svítilnu' : 'Zapnout svítilnu'}
                aria-pressed={isTorchOn}
              >
                {isTorchOn ? <Zap className="w-5 h-5 fill-current" /> : <ZapOff className="w-5 h-5" />}
              </button>
            )}
            {switchableCameras.length > 1 && (
              <button
                type="button"
                onClick={switchCamera}
                className="w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md transition-colors"
                aria-label="Přepnout kameru"
              >
                <SwitchCamera className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Visual Overlay for scanning line & target */}
        {isScanningActive && !errorMsg && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Target Box (80% width, ~3:1 aspect ratio) */}
            <div
              className={`w-[80%] aspect-[3/1] border-2 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] flex items-center justify-center overflow-hidden transition-all duration-300 ${
                scannedFeedback
                  ? 'border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.65),0_0_24px_rgba(52,211,153,0.6)] bg-emerald-950/30'
                  : 'border-white/80'
              }`}
            >
              {/* Corner indicators */}
              <div
                className={`absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 rounded-tl-lg transition-colors ${
                  scannedFeedback ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <div
                className={`absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 rounded-tr-lg transition-colors ${
                  scannedFeedback ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <div
                className={`absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 rounded-bl-lg transition-colors ${
                  scannedFeedback ? 'border-emerald-400' : 'border-red-500'
                }`}
              />
              <div
                className={`absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 rounded-br-lg transition-colors ${
                  scannedFeedback ? 'border-emerald-400' : 'border-red-500'
                }`}
              />

              {/* Animated red laser line or Scanned ISBN Feedback */}
              {isReadingText && !scannedFeedback ? (
                <div className="flex items-center space-x-2 px-3 py-1.5 bg-black/60 rounded-lg">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-300" />
                  <span className="text-xs font-semibold text-white">Čtu číslo ISBN…</span>
                </div>
              ) : scannedFeedback ? (
                <div className="flex flex-col items-center justify-center px-2 py-1 bg-black/40 rounded-lg">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                    Naskenováno
                  </span>
                  <span className="font-mono text-sm sm:text-base font-bold text-white tracking-widest">
                    {scannedFeedback}
                  </span>
                </div>
              ) : (
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_#ef4444] animate-laser" />
              )}
            </div>

            {textReadError ? (
              <p className="relative mt-4 mx-4 text-xs font-medium text-amber-100 bg-amber-900/90 px-4 py-1.5 rounded-2xl text-center shadow-md">
                {textReadError}
              </p>
            ) : (
              <p className="relative mt-4 text-xs font-medium text-slate-200 bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md text-center shadow-md">
                Namiřte čárový kód nebo číslo ISBN do rámečku
              </p>
            )}
          </div>
        )}


        {/* Initializing loader */}
        {isInitializing && !errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-2 text-indigo-400" />
            <p className="text-sm">Načítám kameru...</p>
          </div>
        )}

        {/* Error overlay */}
        {errorMsg && (
          <div className="absolute inset-0 bg-slate-900 p-6 flex flex-col items-center justify-center text-center">
            <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
            <h3 className="text-base font-semibold text-white mb-2">Kamera není k dispozici</h3>
            <p className="text-xs text-slate-300 mb-4">{errorMsg}</p>
            <button
              onClick={() => {
                setSelectedCameraId('');
                setRetryCounter((n) => n + 1);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              Zkusit znovu
            </button>
          </div>
        )}
      </div>

      {/* Akce pod kamerou */}
      {isScanningActive && !errorMsg && !isInitializing && (
        <div className="p-3 space-y-2.5 bg-slate-900">
          <div className={`grid gap-2.5 ${onCoverPhoto ? 'grid-cols-2' : 'grid-cols-1'}`}>
            <button
              type="button"
              onClick={readPrintedIsbn}
              onPointerEnter={preloadIsbnOcr}
              onTouchStart={preloadIsbnOcr}
              disabled={isReadingText}
              className="min-h-[4.25rem] px-3 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-[0.98] disabled:opacity-60 text-left flex items-center gap-2.5 transition-all"
            >
              <span className="w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center flex-shrink-0">
                {isReadingText ? <RefreshCw className="w-4.5 h-4.5 animate-spin" /> : <ScanText className="w-4.5 h-4.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-tight">
                  {isReadingText ? 'Čtu číslo…' : 'Přečíst číslo'}
                </span>
                <span className="block text-[11px] text-slate-400 leading-tight mt-0.5">ISBN bez čárového kódu</span>
              </span>
            </button>
            {onCoverPhoto && (
              <button
                type="button"
                onClick={takeCoverPhoto}
                className="min-h-[4.25rem] px-3 py-2.5 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 hover:from-indigo-400 hover:to-violet-500 active:scale-[0.98] text-left flex items-center gap-2.5 shadow-lg shadow-indigo-900/40 transition-all"
              >
                <span className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4.5 h-4.5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold leading-tight">Vyfotit obálku s AI</span>
                  <span className="block text-[11px] text-indigo-100/90 leading-tight mt-0.5">Kniha nemá ISBN</span>
                </span>
              </button>
            )}
          </div>
          {onManualEntry && (
            <button
              type="button"
              onClick={() =>
                onManualEntry(
                  textReadGuess ?? undefined,
                  textReadGuess
                    ? `Skener přečetl ${textReadGuess}, ale kontrolní číslice nesedí. Porovnejte číslo s knihou a opravte ho.`
                    : 'Čárový kód ani číslo se nepodařilo načíst. Opište ISBN z knihy.'
                )
              }
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
                textReadGuess
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Keyboard className="w-4 h-4" />
              <span>{textReadGuess ? `Opravit ručně: ${textReadGuess}` : 'Zadat ISBN ručně'}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
