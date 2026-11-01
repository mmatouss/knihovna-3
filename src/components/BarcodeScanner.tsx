import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, SwitchCamera, AlertTriangle, RefreshCw, Zap, ZapOff } from 'lucide-react';
import { normalizeIsbn } from '../utils/isbn';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningActive: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, isScanningActive }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanSuccessRef = useRef(onScanSuccess);
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);
  const [isTorchSupported, setIsTorchSupported] = useState<boolean>(false);
  const [isTorchOn, setIsTorchOn] = useState<boolean>(false);

  // Keep latest onScanSuccess ref without causing scanner restart
  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

  useEffect(() => {
    let isMounted = true;

    async function initScanner() {
      setIsInitializing(true);
      setErrorMsg(null);

      try {
        const devices = await Html5Qrcode.getCameras();
        if (!isMounted) return;

        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera if available
          const backCamera = devices.find(d =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('zadní') ||
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCamera ? backCamera.id : devices[0].id);
        } else {
          setErrorMsg('Nebyly nalezeny žádné kamery na tomto zařízení.');
        }
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('NotAllowedError') || msg.includes('Permission denied')) {
          setErrorMsg('Přístup ke kameře byl zamítnut. Povolte prosím přístup ke kameře v nastavení prohlížeče.');
        } else {
          setErrorMsg('Chyba při inicializaci kamery. Zkontrolujte, zda kamera není používána jinou aplikací.');
        }
      } finally {
        if (isMounted) setIsInitializing(false);
      }
    }

    initScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!selectedCameraId || !isScanningActive) {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      return;
    }

    const scannerId = 'isbn-qr-reader';
    const html5QrcodeScanner = new Html5Qrcode(scannerId, {
      formatsToSupport: [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.UPC_A,
      ],
      verbose: false,
    });

    scannerRef.current = html5QrcodeScanner;

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
        const width = Math.floor(viewfinderWidth * 0.8);
        const height = Math.min(Math.floor(width / 3), viewfinderHeight);
        return { width, height };
      },
      aspectRatio: 0.75, // 3:4 portrait
    };

    const handleSuccess = (decodedText: string) => {
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
    };

    html5QrcodeScanner.start(
      selectedCameraId,
      config,
      handleSuccess,
      () => { /* scan error per frame, can ignore */ }
    ).then(() => {
      setIsTorchOn(false);
      try {
        const capabilities = html5QrcodeScanner.getRunningTrackCapabilities();
        if ('torch' in capabilities) {
          setIsTorchSupported(Boolean(capabilities.torch));
        } else {
          setIsTorchSupported(true);
        }
      } catch {
        setIsTorchSupported(true);
      }
    }).catch((err) => {
      console.error('Error starting scanner', err);
      setErrorMsg('Nepodařilo se spustit kameru. Vyberte jinou kameru nebo zkontrolujte oprávnění.');
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setIsTorchSupported(false);
      setIsTorchOn(false);
    };
  }, [selectedCameraId, isScanningActive]);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    const nextTorchState = !isTorchOn;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorchState } as unknown as MediaTrackConstraintSet],
      });
      setIsTorchOn(nextTorchState);
    } catch (err) {
      console.error('Failed to toggle torch via applyVideoConstraints', err);
      // Fallback: try applying constraints on the video track directly if available
      try {
        const settings = scannerRef.current.getRunningTrackSettings();
        if (settings) {
          // Attempting native track constraints
          const stream = document.querySelector<HTMLVideoElement>('#isbn-qr-reader video')?.srcObject as MediaStream | null;
          const track = stream?.getVideoTracks()[0];
          if (track && 'applyConstraints' in track) {
            await track.applyConstraints({
              advanced: [{ torch: nextTorchState } as unknown as MediaTrackConstraintSet],
            });
            setIsTorchOn(nextTorchState);
          }
        }
      } catch (fallbackErr) {
        console.error('Failed fallback torch toggle', fallbackErr);
      }
    }
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-lg border border-slate-800 text-white relative">
      {/* Viewport container */}
      <div className="relative aspect-[3/4] w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <div id="isbn-qr-reader" className="w-full h-full object-cover"></div>

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
              {scannedFeedback ? (
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

            <p className="mt-4 text-xs font-medium text-slate-200 bg-black/70 px-4 py-1.5 rounded-full backdrop-blur-md text-center shadow-md">
              Namiřte čárový kód ISBN do rámečku
            </p>
          </div>
        )}


        {/* Initializing loader */}
        {isInitializing && (
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
                setIsInitializing(true);
                setErrorMsg(null);
                Html5Qrcode.getCameras().then(devices => {
                  if (devices.length > 0) setSelectedCameraId(devices[0].id);
                  setIsInitializing(false);
                }).catch(() => setIsInitializing(false));
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              Zkusit znovu
            </button>
          </div>
        )}
      </div>

      {/* Control bar */}
      <div className="p-4 bg-slate-900 flex items-center justify-between border-t border-slate-800">
        <div className="flex items-center space-x-2 text-xs text-slate-400 min-w-0 pr-2">
          <Camera className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span className="truncate">
            {cameras.length > 0
              ? (cameras.find(c => c.id === selectedCameraId)?.label || 'Kamera aktivní')
              : 'Vyhledávání kamer...'}
          </span>
        </div>

        <div className="flex items-center space-x-2 flex-shrink-0">
          {/* Torch / Flashlight toggle button */}
          {isScanningActive && (isTorchSupported || cameras.length > 0) && (
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
