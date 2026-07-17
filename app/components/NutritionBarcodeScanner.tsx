'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeFormat, BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import { barcodeLookupCandidates, digitsOnly } from '../../lib/nutrition/barcodeLookup';
import {
  BARCODE_SCANNER_ERRORS,
  mapCameraError,
  type BarcodeScannerErrorCode,
} from '../../lib/nutrition/barcodeScannerErrors';

export type NutritionBarcodeScannerProps = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  onError?: (code: BarcodeScannerErrorCode, message: string) => void;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>>;
};

const SCAN_FORMATS = [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E];

function parseScannedBarcode(raw: string): string | null {
  const candidates = barcodeLookupCandidates(raw);
  return candidates[0] || null;
}

export default function NutritionBarcodeScanner({ onDetected, onClose, onError }: NutritionBarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);
  const lockedRef = useRef(false);
  const [status, setStatus] = useState<'starting' | 'scanning' | 'locked'>('starting');
  const [error, setError] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    zxingControlsRef.current?.stop();
    zxingControlsRef.current = null;
    zxingReaderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const reportError = useCallback(
    (code: BarcodeScannerErrorCode, message: string) => {
      setError(message);
      setStatus('starting');
      onError?.(code, message);
    },
    [onError]
  );

  const handleSuccess = useCallback(
    (raw: string) => {
      if (lockedRef.current) return;
      const barcode = parseScannedBarcode(raw);
      if (!barcode) {
        reportError('barcode_not_recognized', BARCODE_SCANNER_ERRORS.barcode_not_recognized);
        return;
      }
      lockedRef.current = true;
      setStatus('locked');
      stopCamera();
      onDetected(barcode);
    },
    [onDetected, reportError, stopCamera]
  );

  useEffect(() => {
    let cancelled = false;

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      reportError('insecure_context', BARCODE_SCANNER_ERRORS.insecure_context);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      reportError('camera_unavailable', BARCODE_SCANNER_ERRORS.camera_unavailable);
      return;
    }

    const BarcodeDetectorCtor = (window as any).BarcodeDetector as
      | (new (options?: { formats?: string[] }) => BarcodeDetectorLike)
      | undefined;

    async function startNativeDetector(stream: MediaStream, video: HTMLVideoElement) {
      const detector = new BarcodeDetectorCtor!({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'],
      });
      video.srcObject = stream;
      await video.play();

      const tick = async () => {
        if (cancelled || lockedRef.current || !video.videoWidth) {
          if (!cancelled && !lockedRef.current) rafRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c) => digitsOnly(String(c.rawValue || '')).length >= 8);
          if (hit) {
            handleSuccess(String(hit.rawValue));
            return;
          }
        } catch {
          // transient frame errors are expected
        }
        if (!cancelled && !lockedRef.current) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    async function startZxing(video: HTMLVideoElement) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, SCAN_FORMATS);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 250 });
      zxingReaderRef.current = reader;

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video,
        (result, err) => {
          if (cancelled || lockedRef.current) return;
          if (result) {
            handleSuccess(result.getText());
            return;
          }
          if (err && !(err as any)?.message?.includes('NotFoundException')) {
            // ignore "no barcode in frame" noise
          }
        }
      );
      zxingControlsRef.current = controls;

      const mediaStream = video.srcObject;
      if (mediaStream instanceof MediaStream) {
        streamRef.current = mediaStream;
      }
    }

    async function start() {
      try {
        const video = videoRef.current;
        if (!video) return;

        if (BarcodeDetectorCtor) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          await startNativeDetector(stream, video);
        } else {
          await startZxing(video);
        }

        if (!cancelled) setStatus('scanning');
      } catch (e: any) {
        if (cancelled) return;
        const mapped = mapCameraError(e);
        reportError(mapped.code, mapped.message);
      }
    }

    start();

    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [handleSuccess, reportError, stopCamera]);

  function handleClose() {
    stopCamera();
    onClose();
  }

  return (
    <div className="nutrition-barcode-scanner">
      <div className="topline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <b>Live barcode scan</b>
        <button type="button" className="btn small secondary" onClick={handleClose}>
          Close
        </button>
      </div>

      <div className="nutrition-barcode-preview-wrap">
        <video ref={videoRef} className="nutrition-barcode-video" playsInline muted autoPlay />
        <div className="nutrition-barcode-guide" aria-hidden="true">
          <div className="nutrition-barcode-guide-frame" />
        </div>
      </div>

      <p className="muted nutrition-barcode-status">
        {status === 'starting' && !error ? 'Starting rear camera…' : null}
        {status === 'scanning' ? 'Align the UPC/EAN barcode inside the frame.' : null}
        {status === 'locked' ? 'Barcode captured — looking up product…' : null}
      </p>
      <p className="muted nutrition-barcode-tip">Hold steady 6–12 inches away in good lighting.</p>

      {error && <p className="nutrition-error">{error}</p>}
    </div>
  );
}
