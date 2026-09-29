/**
 * BIQ-0235 catalog type inference, picker ranking, and new-master checks.
 */
import { inferExerciseType } from './exerciseTypes';
import { catalogItemIsCardio, searchCatalog, textHasToken } from './catalogSearch';
import { compatibleEquipmentOptions } from './exerciseEquipment';
import {
  expectedMasterCatalogCount,
  loadMasterLibraryRecords,
  MASTER_CATALOG_SOURCE,
  masterRecordToCatalogRow,
} from './masterCatalog';
import { NEW_MASTER_CLASSIFICATIONS } from './masterCatalogEnrichment';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from '../scienceEngine/generation/catalogEligibility';
import { FALLBACK_CATALOG } from '../scienceEngine/catalogAdapter';

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function mappedByName() {
  const rows = loadMasterLibraryRecords().map((record) => ({
    record,
    catalog: { ...masterRecordToCatalogRow(record), id: `master:${record.id}` },
  }));
  return rows;
}

export function runCatalogCleanupChecks() {
  assert(inferExerciseType('Bent-Over Row', 'Mid Back', 'Compound') === 'strength', 'Bent-Over Row -> strength');
  assert(inferExerciseType('Chest-Supported Row', 'Mid Back', 'Compound') === 'strength', 'Chest-Supported Row -> strength');
  assert(inferExerciseType('Machine Row', 'Mid Back', 'Compound') === 'strength', 'Machine Row -> strength');
  assert(inferExerciseType('One-Arm Row', 'Lats', 'Compound') === 'strength', 'One-Arm Row -> strength');
  assert(inferExerciseType('T-Bar Row', 'Mid Back', 'Compound') === 'strength', 'T-Bar Row -> strength');
  assert(inferExerciseType('Bicycle Crunch', 'Obliques', 'Core') === 'strength', 'Bicycle Crunch -> strength');
  assert(inferExerciseType('Row Ergometer', 'Back', 'Cardio') === 'cardio', 'Row Ergometer -> cardio');
  assert(inferExerciseType('Treadmill Walk', 'Cardio', 'Cardio') === 'cardio', 'Treadmill Walk -> cardio');
  assert(inferExerciseType('Assault Bike', 'Cardio', 'Cardio') === 'cardio', 'Assault Bike -> cardio');
  assert(
    inferExerciseType('Bent-Over Row', 'Mid Back', 'Compound', 'cardio') === 'strength',
    'stale stored cardio yields to Compound metadata'
  );
  assert(
    inferExerciseType('Row Ergometer', 'Back', 'strength', 'cardio') === 'cardio',
    'true cardio keeps cardio even from a strength section'
  );

  const mapped = mappedByName();
  const catalog = mapped.map((row) => row.catalog);
  assert(expectedMasterCatalogCount() === 262, `active master count should be 262, got ${expectedMasterCatalogCount()}`);
  assert(catalog.length === 262, `mapped master count should be 262, got ${catalog.length}`);

  assert(!textHasToken('Prowler Push', 'row'), 'word-boundary: Prowler does not match row');
  assert(textHasToken('Bent-Over Row', 'row'), 'word-boundary: Bent-Over Row matches row');
  assert(textHasToken('Row Ergometer', 'row'), 'word-boundary: Row Ergometer matches row');

  const strengthRow = searchCatalog(catalog, { query: 'row', section: 'strength', limit: 20 });
  const strengthNames = strengthRow.map((item) => item.name);
  assert(!strengthNames.includes('Prowler Push') && !strengthNames.includes('Sled Push'), 'Prowler/Sled do not appear for row');
  const requiredRows = [
    'Bent-Over Row',
    'Chest-Supported Row',
    'Machine Row',
    'One-Arm Row',
    'T-Bar Row',
    'Low Row',
    'High Row',
    'Diverging Row',
  ];
  requiredRows.forEach((name) => {
    assert(strengthNames.includes(name), `Strength row search missing ${name}: ${strengthNames.join(', ')}`);
  });
  const rowerRank = strengthNames.indexOf('Row Ergometer');
  const bentRank = strengthNames.indexOf('Bent-Over Row');
  const machineRank = strengthNames.indexOf('Machine Row');
  assert(rowerRank === -1 || (bentRank >= 0 && bentRank < rowerRank), 'Row Ergometer must not outrank Bent-Over Row in Strength');
  assert(rowerRank === -1 || (machineRank >= 0 && machineRank < rowerRank), 'Row Ergometer must not outrank Machine Row in Strength');
  assert(
    strengthRow.slice(0, 8).every((item) => !catalogItemIsCardio(item)),
    `top Strength row results should be strength: ${strengthRow.slice(0, 8).map((i) => `${i.name}/${i.exercise_type}`).join(', ')}`
  );

  const cardioRow = searchCatalog(catalog, { query: 'row', section: 'cardio', limit: 8 });
  assert(cardioRow[0]?.name === 'Row Ergometer', `Cardio row search should lead with Row Ergometer, got ${cardioRow.map((i) => i.name).join(', ')}`);

  const bicycle = searchCatalog(catalog, { query: 'bicycle crunch', section: 'strength', limit: 5 });
  assert(bicycle[0]?.name === 'Bicycle Crunch', 'bicycle crunch finds Bicycle Crunch');
  assert(bicycle[0]?.exercise_type === 'strength', 'Bicycle Crunch maps as strength');

  const reverse = mapped.find((row) => row.record.id === '63');
  assert(reverse, 'Reverse Lunge exists');
  const reverseEq = compatibleEquipmentOptions(reverse!.catalog);
  ['Bodyweight', 'Dumbbell', 'Barbell', 'Kettlebell', 'Smith Machine'].forEach((item) => {
    assert(reverseEq.some((eq) => eq.toLowerCase() === item.toLowerCase()), `Reverse Lunge missing ${item}: ${reverseEq.join(', ')}`);
  });
  assert(stringList(reverse.catalog.coaching_metadata.aliases).includes('Rear Lunge'), 'Reverse Lunge has Rear Lunge alias');

  const inverted = mapped.find((row) => row.record.id === '25');
  const invertedEq = compatibleEquipmentOptions(inverted?.catalog);
  assert(
    invertedEq.includes('Bodyweight') && invertedEq.includes('Suspension Trainer'),
    `Inverted Row compatible should be Bodyweight + Suspension Trainer, got ${invertedEq.join(', ')}`
  );
  assert(
    !invertedEq.some((eq) => /set body under/i.test(eq)),
    'Inverted Row no longer stores setup text as equipment'
  );

  const genericRow = mapped.find((row) => row.record.id === '12');
  const aliases = stringList(genericRow?.catalog.coaching_metadata.aliases).map((a) => a.toLowerCase());
  assert(!aliases.includes('bent row'), 'generic Row no longer aliases Bent Row');
  assert(aliases.includes('seated row'), 'generic Row still has Seated Row');

  const diverging = mapped.find((row) => row.record.id === '261');
  const converging = mapped.find((row) => row.record.id === '262');
  assert(diverging?.record.name === 'Diverging Row', 'master 261 is Diverging Row');
  assert(converging?.record.name === 'Converging Chest Press', 'master 262 is Converging Chest Press');
  assert(diverging?.catalog.exercise_type === 'strength', 'Diverging Row is strength');
  assert(converging?.catalog.exercise_type === 'strength', 'Converging Chest Press is strength');
  const divMeta = diverging!.catalog.coaching_metadata;
  const convMeta = converging!.catalog.coaching_metadata;
  assert(divMeta.exercise_kind === 'compound' && divMeta.movement_pattern === 'horizontal_pull', '261 movement/kind');
  assert(convMeta.exercise_kind === 'compound' && convMeta.movement_pattern === 'horizontal_push', '262 movement/kind');
  assert(
    JSON.stringify(divMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['261'].hypertrophy_volume_credits),
    '261 volume credits'
  );
  assert(
    JSON.stringify(convMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['262'].hypertrophy_volume_credits),
    '262 volume credits'
  );

  const liveShaped = catalog.map((item) => ({
    ...item,
    is_system: true,
    user_id: null,
    is_archived: false,
    external_source: MASTER_CATALOG_SOURCE,
  }));
  const custom = {
    id: 'custom-1',
    name: 'User Curl',
    is_archived: false,
    is_system: false,
    user_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  };
  const archived = { ...liveShaped[0], id: 'archived-1', is_archived: true, name: 'Archived Master' };
  assert(liveShaped.every(isAiGenerationEligibleRow), 'all 262 mapped masters are AI-eligible');
  assert(selectAiGenerationCatalogRows([...liveShaped, custom, archived]).length === 262, 'AI candidates stay 262');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '261')), 'Diverging Row is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '262')), 'Converging Chest Press is generation-eligible');
  assert(!isAiGenerationEligibleRow(archived), 'archived cards cannot enter generation');
  assert(!isAiGenerationEligibleRow(custom), 'user customs cannot enter generation');
  const adapted = adaptGenerationCatalog([...liveShaped, custom, archived], { allowFallback: false });
  assert(adapted.length === 262, `adapted generation catalog is 262, got ${adapted.length}`);
  assert(adapted.some((ex) => ex.name === 'Diverging Row'), 'adapted catalog includes Diverging Row');
  assert(adapted.some((ex) => ex.name === 'Converging Chest Press'), 'adapted catalog includes Converging Chest Press');
  assert(adaptGenerationCatalog([], {}).length === FALLBACK_CATALOG.length, 'fallback still works on empty catalog');

  console.log('BIQ-0235 catalog cleanup checks passed.');
  console.log(`Strength row top: ${strengthNames.slice(0, 10).join(', ')}`);
  console.log(`Cardio row top: ${cardioRow.map((item) => item.name).join(', ')}`);
}
