'use client';

import { useEffect, useRef, useState } from 'react';

type NutritionBarcodeScannerProps = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

export default function NutritionBarcodeScanner({ onDetected, onClose }: NutritionBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const BarcodeDetectorCtor = (window as any).BarcodeDetector as
      | (new (options?: { formats?: string[] }) => BarcodeDetectorLike)
      | undefined;

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) {
      setSupported(false);
      setError('Camera barcode scan is not supported in this browser. Enter the UPC manually.');
      return;
    }

    const detector = new BarcodeDetectorCtor({
      formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'],
    });

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const tick = async () => {
          if (cancelled || !video.videoWidth) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          try {
            const codes = await detector.detect(video);
            const hit = codes.find((c) => /^\d{8,14}$/.test(String(c.rawValue || '').replace(/\D/g, '')));
            if (hit) {
              onDetected(String(hit.rawValue).replace(/\D/g, ''));
              return;
            }
          } catch {
            // ignore transient detect errors
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e: any) {
        setError(e?.message || 'Could not access camera. Allow camera permission or enter barcode manually.');
      }
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDetected]);

  return (
    <div className="nutrition-barcode-scanner">
      <div className="topline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <b>Scan barcode</b>
        <button type="button" className="btn small secondary" onClick={onClose}>
          Close
        </button>
      </div>
      {supported ? (
        <>
          <video ref={videoRef} className="nutrition-barcode-video" playsInline muted />
          <p className="muted">Point your camera at the product barcode.</p>
        </>
      ) : null}
      {error && <p className="nutrition-error">{error}</p>}
    </div>
  );
}
