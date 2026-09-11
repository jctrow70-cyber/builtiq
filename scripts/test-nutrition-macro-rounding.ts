/**
 * BIQ-0175: nutrition macro display rounding stays consistent.
 * Run: npx tsx scripts/test-nutrition-macro-rounding.ts
 */
import assert from 'node:assert/strict';
import {
  formatMacro,
  formatMacroGrams,
  formatMacroLine,
  sumMacros,
} from '../lib/nutrition/macros';

// Classic bug: sum of integer-rounded lines ≠ integer-rounded day total
const entries = [
  { calories: 400, protein_g: 20.4, carbs_g: 10.2, fat_g: 40.4 },
  { calories: 500, protein_g: 30.4, carbs_g: 20.3, fat_g: 51.4 },
];

const totals = sumMacros(entries);
assert.equal(totals.fat_g, 91.8);
assert.equal(totals.protein_g, 50.8);
assert.equal(totals.carbs_g, 30.5);
assert.equal(totals.calories, 900);

// Old display: round each line then eye-sum → 40+51 = 91, gauge Math.round(91.8)=92
assert.equal(formatMacro(40.4) + formatMacro(51.4), '4051'); // integers only
assert.equal(Math.round(40.4) + Math.round(51.4), 91);
assert.equal(Math.round(totals.fat_g), 92);

// New display: grams keep one decimal so line eye-sum matches gauge
assert.equal(formatMacroGrams(40.4), '40.4');
assert.equal(formatMacroGrams(51.4), '51.4');
assert.equal(formatMacroGrams(totals.fat_g), '91.8');
assert.equal(formatMacroGrams(40), '40');
assert.equal(formatMacroGrams(91.0), '91');

const lineA = formatMacroLine(entries[0]);
const lineB = formatMacroLine(entries[1]);
assert.match(lineA, /40\.4F/);
assert.match(lineB, /51\.4F/);
assert.match(formatMacroLine(totals), /91\.8F/);

// Eye-sum of displayed fat strings equals displayed total
const eyeFat =
  Number(formatMacroGrams(entries[0].fat_g)) + Number(formatMacroGrams(entries[1].fat_g));
assert.equal(Number(formatMacroGrams(eyeFat)), Number(formatMacroGrams(totals.fat_g)));

console.log('test-nutrition-macro-rounding: ok');
