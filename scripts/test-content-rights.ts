import assert from 'node:assert/strict';
import { withOpenFoodFactsAttribution } from '../lib/nutrition/barcodeLookup';
import {
  instructionsForDisplay,
  isBlockedExerciseMediaUrl,
  isExerciseDbCatalogItem,
} from '../lib/training/contentRights';
import { UNIFIED_CATALOG_SOURCES, normalizeCatalogSources } from '../lib/training/catalogSources';
import { getExerciseGuidePayload, getExerciseThumb, resolveExerciseMediaUrl } from '../lib/training/exerciseMedia';
import { convertFreeExerciseDbRow } from './import-exercises/sources/freeExerciseDb';
import { importGuidedCatalogToSupabase } from '../lib/training/guidedCatalogImport';

const exercisedbGif = 'https://static.exercisedb.dev/media/abc.gif';
const fedbPhoto = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/Bench_Press/0.jpg';
const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

assert.equal(isBlockedExerciseMediaUrl(exercisedbGif), true);
assert.equal(resolveExerciseMediaUrl(exercisedbGif), null);
assert.equal(isBlockedExerciseMediaUrl(fedbPhoto), true);
assert.equal(resolveExerciseMediaUrl(fedbPhoto), null);
assert.equal(resolveExerciseMediaUrl('Bench_Press/0.jpg'), null);
assert.equal(resolveExerciseMediaUrl(youtube), youtube);

const exercisedb = {
  external_source: 'exercisedb',
  name: '3/4 sit-up',
  instructions: 'Lie flat and curl up.',
  gif_url: exercisedbGif,
  image_url: exercisedbGif,
  media_url: exercisedbGif,
};
assert.equal(isExerciseDbCatalogItem(exercisedb), true);
assert.equal(instructionsForDisplay(exercisedb), null);
assert.equal(getExerciseThumb(exercisedb), null);
assert.equal(getExerciseGuidePayload(exercisedb), null);

const photoLibrary = {
  external_source: 'free_exercise_db',
  name: 'Bench Press',
  instructions: 'Lower the bar to the chest.',
  image_url: fedbPhoto,
  gif_url: null,
  media_url: fedbPhoto,
};
assert.equal(instructionsForDisplay(photoLibrary), 'Lower the bar to the chest.');
assert.equal(getExerciseThumb(photoLibrary), null);
const photoGuide = getExerciseGuidePayload(photoLibrary);
assert.equal(photoGuide?.instructions, 'Lower the bar to the chest.');
assert.deepEqual(photoGuide?.images, []);

const master = {
  external_source: 'builtiq_master',
  name: 'Bench Press',
  instructions: 'Set the shoulder blades and press.',
  image_url: null,
  gif_url: null,
  media_url: youtube,
};
assert.equal(instructionsForDisplay(master), 'Set the shoulder blades and press.');
assert.equal(getExerciseGuidePayload(master)?.embedUrl?.includes('youtube.com/embed/'), true);

const custom = {
  user_id: 'user-1',
  external_source: 'exercisedb',
  instructions: 'My own cue.',
  gif_url: exercisedbGif,
};
assert.equal(instructionsForDisplay(custom), 'My own cue.');
assert.equal(getExerciseThumb(custom), null);

assert.equal(UNIFIED_CATALOG_SOURCES.includes('exercisedb'), false);
assert.equal(UNIFIED_CATALOG_SOURCES.includes('builtiq_master'), true);
assert.equal(UNIFIED_CATALOG_SOURCES.includes('free_exercise_db'), true);
assert.deepEqual(normalizeCatalogSources(['exercisedb']), ['builtiq_master', 'builtiq_essentials']);
assert.equal(normalizeCatalogSources(['builtiq_master', 'exercisedb']).includes('exercisedb'), false);

const converted = convertFreeExerciseDbRow({
  id: 'Bench_Press',
  name: 'Bench Press',
  instructions: ['Lower the bar.'],
  images: ['Bench_Press/0.jpg', 'Bench_Press/1.jpg'],
});
assert.equal(converted.thumbnail_url, undefined);
assert.equal(converted.media_url, undefined);
assert.equal(converted.gif_url, undefined);
assert.equal(String(converted.coaching_metadata?.license_scope || '').includes('photos'), true);

const chipNote = withOpenFoodFactsAttribution(
  'Adjusted to 28 g (~1 oz / about 11 chips) to match typical package labels. Verify against your label.'
);
assert.equal(chipNote.includes('Open Food Facts'), true);
assert.equal(chipNote.includes('Open Database License'), true);
assert.equal(chipNote.includes('CC BY-SA'), true);

async function main() {
  await assert.rejects(() => importGuidedCatalogToSupabase({} as never), /commercial rights/);
  console.log('content rights checks passed');
}

main();
