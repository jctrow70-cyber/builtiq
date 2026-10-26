/**
 * BIQ-0267: Client-side resize/compress before meal-photo / label scan uploads.
 * Phone camera JPEGs often exceed Vercel's ~4.5 MB request body once base64-encoded (413).
 */

export const UPLOAD_MAX_EDGE_PX = 1600;
export const UPLOAD_JPEG_QUALITY_START = 0.82;
export const UPLOAD_JPEG_QUALITY_FLOOR = 0.55;
/** Decoded image target before base64 (~33% larger on the wire). Stay well under Vercel 4.5 MB. */
export const UPLOAD_TARGET_MAX_BYTES = 900_000;
export const UPLOAD_HARD_MAX_BYTES = 3 * 1024 * 1024;

export function fitWithinMaxEdge(
  width: number,
  height: number,
  maxEdge: number = UPLOAD_MAX_EDGE_PX
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function nutritionImageScanHttpError(
  status: number,
  serverError: string | undefined,
  kind: 'meal' | 'label'
): string {
  const trimmed = String(serverError || '').trim();
  if (trimmed) return trimmed;
  if (status === 413) {
    return kind === 'meal'
      ? 'Meal photo is too large to upload. Choose a smaller photo or retake closer to the plate.'
      : 'Label photo is too large to upload. Choose a smaller photo or crop closer to the label.';
  }
  return kind === 'meal' ? `Meal photo scan failed (${status})` : `Label scan failed (${status})`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read image.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.slice(result.indexOf(',') + 1) : result;
      if (!base64) reject(new Error('Could not encode image.'));
      else resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Could not compress image.'));
        else resolve(blob);
      },
      'image/jpeg',
      quality
    );
  });
}

async function compressWithCanvas(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithinMaxEdge(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare image for upload.');
    ctx.drawImage(bitmap, 0, 0, width, height);

    let quality = UPLOAD_JPEG_QUALITY_START;
    let blob = await canvasToJpegBlob(canvas, quality);
    while (blob.size > UPLOAD_TARGET_MAX_BYTES && quality > UPLOAD_JPEG_QUALITY_FLOOR + 0.01) {
      quality = Math.max(UPLOAD_JPEG_QUALITY_FLOOR, quality - 0.1);
      blob = await canvasToJpegBlob(canvas, quality);
    }
    return blob;
  } finally {
    bitmap.close();
  }
}

/**
 * Resize and JPEG-compress a photo for nutrition vision APIs.
 * Falls back to the original file only when compression is unavailable and size is still safe.
 */
export async function encodeImageForUpload(file: File): Promise<{ image_base64: string; mime_type: string }> {
  if (!file || file.size <= 0) {
    throw new Error('Image is empty.');
  }

  let uploadBlob: Blob = file;
  let mimeType = (file.type || 'image/jpeg').toLowerCase();

  try {
    uploadBlob = await compressWithCanvas(file);
    mimeType = 'image/jpeg';
  } catch {
    // Safari / older WebViews may fail createImageBitmap on some formats — use original if small enough.
    if (file.size > UPLOAD_HARD_MAX_BYTES) {
      throw new Error('Photo is too large. Try a smaller image or retake the photo.');
    }
    uploadBlob = file;
    mimeType = (file.type || 'image/jpeg').toLowerCase() || 'image/jpeg';
  }

  if (uploadBlob.size > UPLOAD_HARD_MAX_BYTES) {
    throw new Error('Photo is still too large after compression. Try a closer crop of the food.');
  }

  const image_base64 = await blobToBase64(uploadBlob);
  return { image_base64, mime_type: mimeType };
}
