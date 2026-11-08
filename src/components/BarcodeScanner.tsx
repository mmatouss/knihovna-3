import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { Camera, SwitchCamera, AlertTriangle, RefreshCw, Zap, ZapOff, ScanText } from 'lucide-react';
import { normalizeIsbn } from '../utils/isbn';
import { preloadIsbnOcr, readIsbnFromImage } from '../services/isbnOcr';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningActive: boolean;
}

// Kolikrát za sekundu zkoušíme přečíst čárový kód.
const SCAN_INTERVAL_MS = 120;

// Oblast, ve které hledáme čárový kód (vůči šířce náhledu kamery).
// Je o něco větší než nakreslený rámeček, aby kód nemusel být přesně uvnitř.
const SCAN_REGION_WIDTH = 0.95;
const SCAN_REGION_HEIGHT = 0.6;

// Max. šířka výřezu v pixelech – větší obraz by zbytečně zpomaloval dekódování.
const MAX_SCAN_WIDTH = 1280;

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

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, isScanningActive }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  // Prázdný řetězec = výchozí zadní kamera (facingMode: environment).
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [activeCameraLabel, setActiveCameraLabel] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [retryCounter, setRetryCounter] = useState<number>(0);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [isTorchSupported, setIsTorchSupported] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);
  const [isReadingText, setIsReadingText] = useState<boolean>(false);
  const [textReadError, setTextReadError] = useState<string | null>(null);

  // Keep latest onScanSuccess ref without causing scanner restart
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  const handleSuccess = useCallback((decodedText: string) => {
    const clean = normalizeIsbn(decodedText);
    if (!clean) return;

    // Only process valid ISBN lengths (10 or 13 digits)
    if (clean.length !== 10 && clean.length !== 13) return;

    // Prevent continuous duplicate triggers within a 2.5s window
    const now = Date.now();
    if (
      lastScannedRef.current &&
      lastScannedRef.current.code === clean &&
      now - lastScannedRef.current.time < 2500
    ) {
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
    const reader = createReader();
    const canvas = document.createElement('canvas');
    const videoEl = videoRef.current;

    const scanLoop = () => {
      if (cancelled) return;
      const video = videoEl;
      if (video && video.readyState >= video.HAVE_CURRENT_DATA && captureScanRegion(video, canvas)) {
        try {
          const result = reader.decodeFromCanvas(canvas);
          handleSuccess(result.getText());
        } catch {
          // V tomto snímku nebyl kód nalezen – zkusíme další.
        }
      }
      scanTimer = setTimeout(scanLoop, SCAN_INTERVAL_MS);
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
        setActiveCameraLabel(track?.label || '');

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
            setCameras(
              devices
                .filter((d) => d.kind === 'videoinput')
                .map((d, i) => ({ id: d.deviceId, label: d.label || `Kamera ${i + 1}` }))
            );
          }
        } catch { /* ignore */ }

        if (!cancelled) {
          setIsInitializing(false);
          scanLoop();
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
    setIsReadingText(true);
    setTextReadError(null);

    try {
      const attempts: Array<[number, number]> = [
        [SCAN_REGION_WIDTH, SCAN_REGION_HEIGHT], // oblast kolem rámečku
        [1, 10], // celý viditelný obraz (výška se omezí na viditelnou část)
      ];
      for (const [w, h] of attempts) {
        const canvas = document.createElement('canvas');
        if (!captureScanRegion(video, canvas, w, h, 4000)) continue;
        const isbn = await readIsbnFromImage(canvas, canvas.width, canvas.height);
        if (isbn) {
          handleSuccess(isbn);
          return;
        }
      }
      setTextReadError('Číslo ISBN se nepodařilo přečíst. Dejte ho do rámečku, přibližte a zkuste znovu.');
    } catch (err) {
      console.error('OCR failed', err);
      setTextReadError('Čtení textu selhalo. Zkontrolujte připojení k internetu a zkuste znovu.');
    } finally {
      setIsReadingText(false);
    }
  };

  useEffect(() => {
    if (!textReadError) return;
    const t = setTimeout(() => setTextReadError(null), 4000);
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

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentId = selectedCameraId || streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId || '';
    const currentIndex = cameras.findIndex(c => c.id === currentId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
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
              <p className="mt-4 mx-4 text-xs font-medium text-amber-100 bg-amber-900/90 px-4 py-1.5 rounded-2xl text-center shadow-md">
                {textReadError}
              </p>
            ) : (
              <p className="mt-4 text-xs font-medium text-slate-200 bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md text-center shadow-md">
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

      {/* Čtení vytištěného čísla (bez čárového kódu) */}
      {isScanningActive && !errorMsg && !isInitializing && (
        <div className="px-4 pt-4 bg-slate-900">
          <button
            type="button"
            onClick={readPrintedIsbn}
            onPointerEnter={preloadIsbnOcr}
            onTouchStart={preloadIsbnOcr}
            disabled={isReadingText}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-900 disabled:text-indigo-300 text-white text-sm font-semibold rounded-xl flex items-center justify-center space-x-2 transition-all active:scale-[0.99]"
          >
            {isReadingText ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ScanText className="w-4 h-4" />
            )}
            <span>{isReadingText ? 'Čtu číslo…' : 'Přečíst vytištěné číslo ISBN'}</span>
          </button>
          <p className="mt-1.5 text-[10px] text-slate-400 text-center">
            Pro knihy bez čárového kódu – stačí mít číslo ISBN v rámečku.
          </p>
        </div>
      )}

      {/* Control bar */}
      <div className="p-4 bg-slate-900 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-400 min-w-0 pr-2">
          <Camera className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span className="truncate">
            {activeCameraLabel || (isInitializing ? 'Vyhledávání kamer...' : 'Kamera aktivní')}
          </span>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Torch / Flashlight toggle button */}
          {isScanningActive && isTorchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`p-2 rounded-xl flex items-center space-x-1.5 text-xs font-medium transition-all ${
                isTorchOn
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
              title={isTorchOn ? 'Vypnout svítilnu' : 'Zapnout svítilnu pro slabé osvětlení'}
            >
              {isTorchOn ? (
                <>
                  <Zap className="w-4 h-4 fill-current text-slate-950" />
                  <span>Svítilna zapnuta</span>
                </>
              ) : (
                <>
                  <ZapOff className="w-4 h-4 text-slate-300" />
                  <span>Svítilna</span>
                </>
              )}
            </button>
          )}

          {cameras.length > 1 && (
            <button
              type="button"
              onClick={switchCamera}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center space-x-1 text-xs font-medium transition-colors"
              title="Přepnout kameru"
            >
              <SwitchCamera className="w-4 h-4" />
              <span className="hidden sm:inline">Přepnout</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
