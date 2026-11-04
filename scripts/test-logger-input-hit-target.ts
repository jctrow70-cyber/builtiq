/**
 * BIQ-0304 — weight/reps stay in column 1 so the Done rail cannot cover them.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-logger-input-hit-target.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const logger = readFileSync(new URL('../app/components/WorkoutSetLogger.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

assert.match(
  logger,
  /className="set-log-metrics log-field-row log-field-row-compact log-field-row-metrics"/,
  'metrics row must keep set-log-metrics so the Done rail does not cover weight/reps',
);

assert.match(css, /\.set-log-metrics/, 'grid placement for metrics must exist');
assert.match(css, /\.set-log-grid>\.log-field-row-metrics/, 'CSS fallback must place metrics without the class alone');
assert.match(css, /\.set-log-rail\{[^}]*pointer-events:none/, 'rail must not steal taps outside Done/remove');
assert.match(css, /\.set-log-rail>\*\{pointer-events:auto\}/, 'Done and remove must stay tappable');

console.log('test-logger-input-hit-target: ok');
