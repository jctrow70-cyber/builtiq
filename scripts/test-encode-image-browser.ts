/**
 * BIQ-0267: Browser proof that a multi-MB meal photo compresses under the upload target.
 */
import { chromium } from '@playwright/test';
import path from 'path';

const BUNDLE = '/tmp/encode-image-for-upload.iife.js';
const TARGET = 900_000;
const HARD = 3 * 1024 * 1024;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('about:blank');
  await page.addScriptTag({ path: BUNDLE });

  const result = await page.evaluate(async ({ target, hard }) => {
    const api = (window as any).EncodeUpload;
    if (!api?.encodeImageForUpload) throw new Error('EncodeUpload bundle missing');

    const canvas = document.createElement('canvas');
    canvas.width = 4032;
    canvas.height = 3024;
    const ctx = canvas.getContext('2d')!;
    // High-entropy noise so JPEG stays multi-MB like a phone camera shot.
    const image = ctx.createImageData(canvas.width, canvas.height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (Math.random() * 256) | 0;
      data[i + 1] = (Math.random() * 256) | 0;
      data[i + 2] = (Math.random() * 256) | 0;
      data[i + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.95);
    });

    const file = new File([blob], 'meal.jpg', { type: 'image/jpeg' });
    const encoded = await api.encodeImageForUpload(file);
    const decodedBytes = Math.floor((encoded.image_base64.length * 3) / 4);
    const wireBytes = Math.ceil((decodedBytes * 4) / 3);

    return {
      originalBytes: file.size,
      decodedBytes,
      wireBytes,
      mime: encoded.mime_type,
      underTarget: decodedBytes <= target,
      underHard: decodedBytes <= hard,
      underVercel: wireBytes < 4.5 * 1024 * 1024,
    };
  }, { target: TARGET, hard: HARD });

  await browser.close();

  if (!result.underTarget) {
    throw new Error(`Compressed size ${result.decodedBytes} exceeds target ${TARGET}`);
  }
  if (!result.underVercel) {
    throw new Error(`Wire size ${result.wireBytes} still over Vercel body limit`);
  }
  if (result.mime !== 'image/jpeg') {
    throw new Error(`Expected image/jpeg, got ${result.mime}`);
  }
  if (result.originalBytes < 1_000_000) {
    throw new Error(`Synthetic original should be multi-MB; got ${result.originalBytes}`);
  }

  console.log(
    `BIQ-0267 browser compress ok: ${result.originalBytes} → ${result.decodedBytes} bytes (wire ~${result.wireBytes})`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
