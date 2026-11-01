/**
 * BIQ-0293 — set save status stays out of the card layout unless the save fails.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-set-log-status.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLogStatusPresentation } from '../lib/training/setLogStatus';

const idle = setLogStatusPresentation('idle');
const saving = setLogStatusPresentation('saving');
const failed = setLogStatusPresentation('error');

assert.equal(idle.politeText, '');
assert.equal(idle.showError, false);
assert.equal(idle.reservesLayout, false);
assert.equal(saving.politeText, 'Saving set');
assert.equal(saving.showError, false);
assert.equal(saving.reservesLayout, false);
assert.equal(failed.showError, true);
assert.equal(failed.reservesLayout, true);
assert.equal(failed.politeText, '');

const card = readFileSync(new URL('../app/components/WorkoutSetLogger.tsx', import.meta.url), 'utf8');
assert.equal(card.includes('Saving…'), false);
assert.equal(card.includes('set-log-status-saving'), false);
assert.equal(card.includes('setLogStatusPresentation'), true);
assert.equal(card.includes('visually-hidden'), true);
assert.equal(card.includes('role="alert"'), true);
assert.equal(card.includes('Retry'), true);
assert.equal(card.includes("setSaveState('saving')"), true);
assert.equal(card.includes("setSaveState('error')"), true);

console.log('test-set-log-status: ok');
