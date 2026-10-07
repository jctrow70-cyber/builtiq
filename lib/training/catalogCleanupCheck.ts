/**
 * BIQ-0235 catalog type inference, picker ranking, and new-master checks.
 */
import { inferExerciseType } from './exerciseTypes';
import { catalogItemIsCardio, searchCatalog, textHasToken } from './catalogSearch';
import { compatibleEquipmentOptions } from './exerciseEquipment';
import { exerciseMatchesEquipment } from './equipmentFilter';
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
  const masterCount = expectedMasterCatalogCount();
  assert(masterCount === 264, `active master count should be 264, got ${masterCount}`);
  assert(catalog.length === masterCount, `mapped master count should be ${masterCount}, got ${catalog.length}`);

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

  const deadlift = mapped.find((row) => row.record.id === '71');
  assert(deadlift, 'Deadlift exists');
  const deadliftEq = compatibleEquipmentOptions(deadlift.catalog);
  ['Barbell', 'Smith Machine'].forEach((item) => {
    assert(
      deadliftEq.some((eq) => eq.toLowerCase() === item.toLowerCase()),
      `Deadlift missing ${item}: ${deadliftEq.join(', ')}`
    );
  });

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
  const seatedOhp = mapped.find((row) => row.record.id === '263');
  const standingOhp = mapped.find((row) => row.record.id === '29');
  assert(diverging?.record.name === 'Diverging Row', 'master 261 is Diverging Row');
  assert(converging?.record.name === 'Converging Chest Press', 'master 262 is Converging Chest Press');
  assert(seatedOhp?.record.name === 'Seated Overhead Press', 'master 263 is Seated Overhead Press');
  assert(diverging?.catalog.exercise_type === 'strength', 'Diverging Row is strength');
  assert(converging?.catalog.exercise_type === 'strength', 'Converging Chest Press is strength');
  assert(seatedOhp?.catalog.exercise_type === 'strength', 'Seated Overhead Press is strength');
  const divMeta = diverging!.catalog.coaching_metadata;
  const convMeta = converging!.catalog.coaching_metadata;
  const seatedMeta = seatedOhp!.catalog.coaching_metadata;
  assert(divMeta.exercise_kind === 'compound' && divMeta.movement_pattern === 'horizontal_pull', '261 movement/kind');
  assert(convMeta.exercise_kind === 'compound' && convMeta.movement_pattern === 'horizontal_push', '262 movement/kind');
  assert(seatedMeta.exercise_kind === 'compound' && seatedMeta.movement_pattern === 'vertical_push', '263 movement/kind');
  assert(
    JSON.stringify(divMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['261'].hypertrophy_volume_credits),
    '261 volume credits'
  );
  assert(
    JSON.stringify(convMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['262'].hypertrophy_volume_credits),
    '262 volume credits'
  );
  assert(
    JSON.stringify(seatedMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['263'].hypertrophy_volume_credits),
    '263 volume credits'
  );
  const seatedEq = compatibleEquipmentOptions(seatedOhp!.catalog).map((eq) => eq.toLowerCase()).sort();
  const standingEq = compatibleEquipmentOptions(standingOhp?.catalog).map((eq) => eq.toLowerCase()).sort();
  assert(standingEq.length > 0, 'Overhead Press has compatible equipment');
  assert(JSON.stringify(seatedEq) === JSON.stringify(standingEq), `Seated OHP equipment ${seatedEq.join(', ')} must match Overhead Press ${standingEq.join(', ')}`);

  const ghdSitUp = mapped.find((row) => row.record.id === '264');
  assert(ghdSitUp?.record.name === 'GHD Sit-Up', 'master 264 is GHD Sit-Up');
  assert(ghdSitUp?.catalog.exercise_type === 'strength', 'GHD Sit-Up is strength');
  assert(ghdSitUp?.catalog.movement_pattern === 'isolation', 'GHD Sit-Up first-class pattern is isolation');
  assert(ghdSitUp?.catalog.equipment === 'GHD', 'GHD Sit-Up equipment is GHD');
  const ghdEq = compatibleEquipmentOptions(ghdSitUp!.catalog);
  assert(ghdEq.length === 1 && ghdEq[0] === 'GHD', `GHD Sit-Up compatible equipment should be GHD, got ${ghdEq.join(', ')}`);
  const ghdMeta = ghdSitUp!.catalog.coaching_metadata;
  assert(ghdMeta.movement_pattern === 'core_flexion' && ghdMeta.exercise_kind === 'isolation', '264 movement/kind');
  assert(ghdMeta.volume_policy === 'core' && ghdMeta.measurement_type === 'reps' && ghdMeta.laterality === 'bilateral', '264 programming fields');
  assert(ghdMeta.fatigue_cost === 'moderate' && ghdMeta.skill_demand === 'moderate', '264 fatigue and skill');
  assert(ghdMeta.warmup_eligible === false && ghdMeta.power_eligible === false && ghdMeta.ramp_eligible === false, '264 is not warmup, power, or ramp');
  assert(
    JSON.stringify(ghdMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['264'].hypertrophy_volume_credits),
    '264 volume credits'
  );
  assert(JSON.stringify(ghdMeta.primary_muscles) === JSON.stringify(['abs']), '264 primary muscles');
  assert(JSON.stringify(ghdMeta.secondary_muscles) === JSON.stringify(['hip_flexors']), '264 secondary muscles');
  assert(exerciseMatchesEquipment(ghdSitUp!.catalog, ['ghd']), 'GHD equipment filter includes GHD Sit-Up');
  assert(!exerciseMatchesEquipment(ghdSitUp!.catalog, ['dumbbell']), 'dumbbell-only filter excludes GHD Sit-Up');
  const ghdSearch = searchCatalog(catalog, { query: 'ghd situp', section: 'strength', limit: 5 });
  assert(ghdSearch[0]?.name === 'GHD Sit-Up', 'ghd situp search finds GHD Sit-Up');

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
  assert(liveShaped.every(isAiGenerationEligibleRow), `all ${masterCount} mapped masters are AI-eligible`);
  assert(selectAiGenerationCatalogRows([...liveShaped, custom, archived]).length === masterCount, `AI candidates stay ${masterCount}`);
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '261')), 'Diverging Row is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '262')), 'Converging Chest Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '263')), 'Seated Overhead Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '264')), 'GHD Sit-Up is generation-eligible');
  assert(!isAiGenerationEligibleRow(archived), 'archived cards cannot enter generation');
  assert(!isAiGenerationEligibleRow(custom), 'user customs cannot enter generation');
  const adapted = adaptGenerationCatalog([...liveShaped, custom, archived], { allowFallback: false });
  assert(adapted.length === masterCount, `adapted generation catalog is ${masterCount}, got ${adapted.length}`);
  assert(adapted.some((ex) => ex.name === 'Diverging Row'), 'adapted catalog includes Diverging Row');
  assert(adapted.some((ex) => ex.name === 'Converging Chest Press'), 'adapted catalog includes Converging Chest Press');
  assert(adapted.some((ex) => ex.name === 'Seated Overhead Press'), 'adapted catalog includes Seated Overhead Press');
  const adaptedGhd = adapted.find((ex) => ex.name === 'GHD Sit-Up');
  assert(adaptedGhd, 'adapted catalog includes GHD Sit-Up');
  assert(adaptedGhd?.movementPattern === 'core_flexion', 'AI reads GHD Sit-Up as core flexion');
  assert(adaptedGhd?.exerciseType === 'isolation', 'AI reads GHD Sit-Up as isolation');
  assert(adaptedGhd?.primaryMuscles.includes('abs') && adaptedGhd?.secondaryMuscles.includes('hip_flexors'), 'AI reads GHD Sit-Up muscles');
  assert(adaptedGhd?.equipment.some((eq) => eq.toLowerCase() === 'ghd'), 'AI reads GHD equipment');
  assert(adaptedGhd?.fatigueCost === 'medium' && adaptedGhd?.defaultRepMin === 8 && adaptedGhd?.defaultRepMax === 15, 'AI reads GHD Sit-Up demand and reps');
  assert(adaptedGhd?.programRoles.includes('accessory') && adaptedGhd?.warmupSuitable === false, 'AI reads GHD Sit-Up as accessory, not warmup');
  assert(adaptGenerationCatalog([], {}).length === FALLBACK_CATALOG.length, 'fallback still works on empty catalog');

  console.log('BIQ-0235 catalog cleanup checks passed.');
  console.log(`Strength row top: ${strengthNames.slice(0, 10).join(', ')}`);
  console.log(`Cardio row top: ${cardioRow.map((item) => item.name).join(', ')}`);
}
