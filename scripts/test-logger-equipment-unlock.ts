/**
 * BIQ-0305 — logging fields stay enabled; equipment choice is available while logging.
 * Run: npx tsx scripts/test-logger-equipment-unlock.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

assert.match(
  page,
  /canLog=\{canLog\(\)&&exerciseIsLoggable\(ex\)\}/,
  'missing equipment must not grey out weight/reps inputs',
);
assert.equal(
  page.includes('canLog()&&exerciseIsLoggable(ex)&&!equipmentBlocked'),
  false,
  'equipment block must not disable the logger inputs',
);
assert.match(
  page,
  /canLog\(\)&&eqOptions\.length>1\?<select className=\{`exercise-equipment/,
  'read-only logging cards must still show the equipment picker',
);
assert.match(
  page,
  /pendingEquipmentById\[ex\.id\]\|\|equipmentQueuesRef/,
  'pending equipment selection must count for set snapshots',
);
assert.match(css, /\.exercise-equipment-required/, 'required equipment select needs a visible style');
assert.match(css, /\.exercise-equipment-note-required/, 'equipment prompt must stay visible');

console.log('test-logger-equipment-unlock: ok');
