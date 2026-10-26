/**
 * BIQ-0267: Unit checks for meal/label upload sizing helpers (no DOM required).
 */
import {
  UPLOAD_HARD_MAX_BYTES,
  UPLOAD_MAX_EDGE_PX,
  UPLOAD_TARGET_MAX_BYTES,
  fitWithinMaxEdge,
  nutritionImageScanHttpError,
} from '../lib/nutrition/encodeImageForUpload';

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function approxBase64WireBytes(decodedBytes: number): number {
  return Math.ceil((decodedBytes * 4) / 3);
}

assert(fitWithinMaxEdge(4032, 3024).width === 1600, 'iPhone-ish landscape should scale to max edge 1600');
assert(fitWithinMaxEdge(4032, 3024).height === 1200, 'height should keep aspect ratio');
assert(fitWithinMaxEdge(800, 600).width === 800 && fitWithinMaxEdge(800, 600).height === 600, 'small images stay unchanged');
assert(fitWithinMaxEdge(1200, 2400).height === UPLOAD_MAX_EDGE_PX, 'portrait max edge is height');
assert(fitWithinMaxEdge(0, 10).width === 0, 'zero width stays zero');

const wireAtTarget = approxBase64WireBytes(UPLOAD_TARGET_MAX_BYTES);
assert(wireAtTarget < 4.5 * 1024 * 1024, 'target JPEG should stay under Vercel ~4.5 MB once base64-encoded');
assert(UPLOAD_HARD_MAX_BYTES > UPLOAD_TARGET_MAX_BYTES, 'hard max is intentionally larger than compress target');
assert(
  approxBase64WireBytes(UPLOAD_HARD_MAX_BYTES) < 5 * 1024 * 1024,
  'hard-max fallback should still be near the platform body limit'
);

assert(
  nutritionImageScanHttpError(413, undefined, 'meal').includes('too large'),
  '413 meal error should mention size'
);
assert(
  nutritionImageScanHttpError(413, undefined, 'label').includes('too large'),
  '413 label error should mention size'
);
assert(
  nutritionImageScanHttpError(502, 'Vision request failed', 'meal') === 'Vision request failed',
  'server error text wins'
);
assert(
  nutritionImageScanHttpError(500, '', 'meal') === 'Meal photo scan failed (500)',
  'generic status fallback'
);

console.log('BIQ-0267 encodeImageForUpload checks passed');
