/** BIQ-0042: User-facing barcode scanner error messages */

export type BarcodeScannerErrorCode =
  | 'insecure_context'
  | 'camera_unavailable'
  | 'permission_denied'
  | 'no_rear_camera'
  | 'scanner_init_failed'
  | 'barcode_not_recognized';

export const BARCODE_SCANNER_ERRORS: Record<BarcodeScannerErrorCode, string> = {
  insecure_context:
    'Camera requires a secure connection (HTTPS). Open BuildIQ Health from your installed app or https URL, not an insecure page.',
  camera_unavailable:
    'No camera was found on this device. Use fallback options below to enter the product another way.',
  permission_denied:
    'Camera permission was denied. On iPhone: Settings → BuildIQ Health → Camera → Allow, then tap Scan Barcode again.',
  no_rear_camera:
    'Could not open the rear camera. Try holding the phone farther from the barcode or use fallback options below.',
  scanner_init_failed:
    'The barcode scanner could not start. Close and tap Scan Barcode again, or use fallback options below.',
  barcode_not_recognized:
    'Could not read a UPC/EAN barcode from the camera. Hold steady inside the guide and try again.',
};

export function mapCameraError(err: unknown): { code: BarcodeScannerErrorCode; message: string } {
  const name = String((err as any)?.name || '');
  const msg = String((err as any)?.message || '').toLowerCase();

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return { code: 'permission_denied', message: BARCODE_SCANNER_ERRORS.permission_denied };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { code: 'camera_unavailable', message: BARCODE_SCANNER_ERRORS.camera_unavailable };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return { code: 'no_rear_camera', message: BARCODE_SCANNER_ERRORS.no_rear_camera };
  }
  if (msg.includes('secure') || msg.includes('https')) {
    return { code: 'insecure_context', message: BARCODE_SCANNER_ERRORS.insecure_context };
  }
  return { code: 'scanner_init_failed', message: BARCODE_SCANNER_ERRORS.scanner_init_failed };
}
