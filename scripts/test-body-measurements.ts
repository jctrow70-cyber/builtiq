/**
 * Unit tests for body measurement helpers (no DB).
 * Run: npx tsx scripts/test-body-measurements.ts
 */
import {
  draftToCanonical,
  fromCanonicalWaist,
  fromCanonicalWeight,
  mergeMeasurement,
  parsePositiveNumber,
  toCanonicalWaistInches,
  toCanonicalWeightLbs,
  type BodyMeasurementRow,
} from '../lib/body/measurements';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parsePositiveNumber('185.5') === 185.5, 'parse weight');
assert(parsePositiveNumber('0') == null, 'reject zero');
assert(parsePositiveNumber('') == null, 'reject empty');

assert(Math.abs(toCanonicalWeightLbs(80, 'metric') - 176.37) < 0.1, 'kg to lbs');
assert(fromCanonicalWeight(176.37, 'metric') === 80, 'lbs to kg display');
assert(toCanonicalWeightLbs(185, 'imperial') === 185, 'imperial weight passthrough');

assert(Math.abs(toCanonicalWaistInches(86, 'metric') - 33.86) < 0.05, 'cm to in');
assert(fromCanonicalWaist(34, 'imperial') === 34, 'imperial waist');
assert(Math.abs((fromCanonicalWaist(33.86, 'metric') || 0) - 86) < 0.2, 'in to cm display');

const draft = draftToCanonical({ measured_on: '2026-09-11', weight: '180', waist: '' }, 'imperial');
assert(draft?.weight_lbs === 180 && draft.waist_inches == null, 'draft weight only');

const existing: BodyMeasurementRow = {
  id: '1',
  user_id: 'u',
  measured_on: '2026-09-11',
  weight_lbs: 180,
  waist_inches: 34,
  notes: null,
};
const merged = mergeMeasurement(existing, {
  measured_on: '2026-09-11',
  weight_lbs: 178,
  waist_inches: null,
  notes: null,
});
assert(merged.weight_lbs === 178 && merged.waist_inches === 34, 'merge keeps prior waist');

console.log('test-body-measurements: ok');
