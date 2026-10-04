import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, SwitchCamera, AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { normalizeIsbn } from '../utils/isbn';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  isScanningActive: boolean;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScanSuccess, isScanningActive }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [scannedFeedback, setScannedFeedback] = useState<string | null>(null);

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
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
      ],
      verbose: false,
    });

    scannerRef.current = html5QrcodeScanner;

    const config = {
      fps: 10,
      qrbox: { width: 280, height: 160 },
      aspectRatio: 1.0,
    };

    const handleSuccess = (decodedText: string) => {
      const clean = normalizeIsbn(decodedText);
      if (clean) {
        // Haptic feedback if available
        if (navigator.vibrate) {
          try { navigator.vibrate(100); } catch { /* ignore */ }
        }
        setScannedFeedback(clean);
        setTimeout(() => setScannedFeedback(null), 1500);

        onScanSuccess(clean);
      }
    };

    html5QrcodeScanner.start(
      selectedCameraId,
      config,
      handleSuccess,
      () => { /* scan error per frame, can ignore */ }
    ).catch((err) => {
      console.error('Error starting scanner', err);
      setErrorMsg('Nepodařilo se spustit kameru. Vyberte jinou kameru nebo zkontrolujte oprávnění.');
    });

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [selectedCameraId, isScanningActive, onScanSuccess]);

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 rounded-3xl overflow-hidden shadow-lg border border-slate-800 text-white relative">
      {/* Viewport container */}
      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        <div id="isbn-qr-reader" className="w-full h-full object-cover"></div>

        {/* Visual Overlay for scanning line & target */}
        {isScanningActive && !errorMsg && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
            {/* Target Box */}
            <div className="w-64 h-36 border-2 border-indigo-400 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.5)] flex items-center justify-center">
              {/* Corner indicators */}
              <div className="absolute -top-1 -left-1 w-4 h-4 border-t-4 border-l-4 border-indigo-500 rounded-tl-lg"></div>
              <div className="absolute -top-1 -right-1 w-4 h-4 border-t-4 border-r-4 border-indigo-500 rounded-tr-lg"></div>
              <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-4 border-l-4 border-indigo-500 rounded-bl-lg"></div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-4 border-r-4 border-indigo-500 rounded-br-lg"></div>

              {/* Animated scanning line */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-pulse shadow-[0_0_8px_#818cf8]"></div>
            </div>

            <p className="mt-4 text-xs font-medium text-slate-300 bg-black/60 px-3 py-1 rounded-full backdrop-blur-sm">
              Namiřte na čárový kód knížky
            </p>
          </div>
        )}

        {/* Feedback popup on detection */}
        {scannedFeedback && (
          <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-sm flex flex-col items-center justify-center text-emerald-300 animate-in fade-in duration-200">
            <Sparkles className="w-12 h-12 mb-2 animate-bounce" />
            <p className="font-semibold text-lg text-white">Čárový kód detekován!</p>
            <p className="font-mono text-sm text-emerald-300 mt-1">{scannedFeedback}</p>
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
        <div className="flex items-center space-x-2 text-xs text-slate-400">
          <Camera className="w-4 h-4 text-indigo-400" />
          <span>
            {cameras.length > 0
              ? (cameras.find(c => c.id === selectedCameraId)?.label || 'Kamera aktivní')
              : 'Vyhledávání kamer...'}
          </span>
        </div>

        {cameras.length > 1 && (
          <button
            type="button"
            onClick={switchCamera}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl flex items-center space-x-1 text-xs font-medium transition-colors"
            title="Přepnout kameru"
          >
            <SwitchCamera className="w-4 h-4" />
            <span>Přepnout</span>
          </button>
        )}
      </div>
    </div>
  );
};
