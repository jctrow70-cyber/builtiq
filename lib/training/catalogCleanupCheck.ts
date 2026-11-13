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

function distinctCatalogIds(left: string, right: string): boolean {
  return left !== right;
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
  assert(masterCount === 269, `active master count should be 269, got ${masterCount}`);
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
    'Iso-Lateral Row',
    'Standing Lever Row',
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

  const romanianDeadlift = mapped.find((row) => row.record.id === '73');
  assert(romanianDeadlift, 'Romanian Deadlift exists');
  const romanianEq = compatibleEquipmentOptions(romanianDeadlift.catalog);
  ['Barbell', 'Dumbbell', 'Kettlebell', 'Cable', 'Smith Machine'].forEach((item) => {
    assert(
      romanianEq.some((eq) => eq.toLowerCase() === item.toLowerCase()),
      `Romanian Deadlift missing ${item}: ${romanianEq.join(', ')}`
    );
  });

  const frontSquat = mapped.find((row) => row.record.id === '55');
  assert(frontSquat, 'Front Squat exists');
  const frontSquatEq = compatibleEquipmentOptions(frontSquat.catalog);
  ['Barbell', 'Kettlebell', 'Dumbbell', 'Smith Machine'].forEach((item) => {
    assert(
      frontSquatEq.some((eq) => eq.toLowerCase() === item.toLowerCase()),
      `Front Squat missing ${item}: ${frontSquatEq.join(', ')}`
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

  const isoLateralRow = mapped.find((row) => row.record.id === '261');
  const converging = mapped.find((row) => row.record.id === '262');
  const seatedOhp = mapped.find((row) => row.record.id === '263');
  const standingOhp = mapped.find((row) => row.record.id === '29');
  assert(isoLateralRow?.record.name === 'Iso-Lateral Row', 'master 261 is Iso-Lateral Row');
  assert(isoLateralRow?.catalog.external_id === '261', 'Iso-Lateral Row preserves external_id 261');
  assert(converging?.record.name === 'Converging Chest Press', 'master 262 is Converging Chest Press');
  assert(seatedOhp?.record.name === 'Seated Overhead Press', 'master 263 is Seated Overhead Press');
  assert(isoLateralRow?.catalog.exercise_type === 'strength', 'Iso-Lateral Row is strength');
  assert(isoLateralRow?.catalog.equipment === 'Machine', 'Iso-Lateral Row equipment is Machine');
  assert(isoLateralRow?.catalog.movement_pattern === 'pull_horizontal', 'Iso-Lateral Row first-class pattern is pull_horizontal');
  assert(converging?.catalog.exercise_type === 'strength', 'Converging Chest Press is strength');
  assert(seatedOhp?.catalog.exercise_type === 'strength', 'Seated Overhead Press is strength');
  const isoRowAliases = stringList(isoLateralRow!.catalog.coaching_metadata.aliases).map((a) => a.toLowerCase());
  ['diverging row', 'hammer strength row', 'diverging machine row', 'independent row', 'iso-lateral machine row', 'plate-loaded iso-lateral row'].forEach(
    (alias) => {
      assert(isoRowAliases.includes(alias), `Iso-Lateral Row missing alias ${alias}`);
    }
  );
  const isoRowSearch = searchCatalog(catalog, { query: 'iso-lateral row', section: 'strength', limit: 5 });
  assert(isoRowSearch[0]?.name === 'Iso-Lateral Row', 'iso-lateral row search finds Iso-Lateral Row');
  const divergingAliasSearch = searchCatalog(catalog, { query: 'diverging row', section: 'strength', limit: 5 });
  assert(divergingAliasSearch.some((row) => row.name === 'Iso-Lateral Row'), 'Diverging Row alias still finds Iso-Lateral Row');
  const divMeta = isoLateralRow!.catalog.coaching_metadata;
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

  const seatedChest = mapped.find((row) => row.record.id === '265');
  const machineChest = mapped.find((row) => row.record.id === '140');
  const benchPress = mapped.find((row) => row.record.id === '1');
  assert(seatedChest?.record.name === 'Seated Chest Press', 'master 265 is Seated Chest Press');
  assert(seatedChest?.catalog.exercise_type === 'strength', 'Seated Chest Press is strength');
  assert(seatedChest?.catalog.movement_pattern === 'push_horizontal', 'Seated Chest Press first-class pattern is push_horizontal');
  assert(seatedChest?.catalog.equipment === 'Machine', 'Seated Chest Press equipment is Machine');
  assert(seatedChest?.catalog.media_url === null && seatedChest?.catalog.image_url === null && seatedChest?.catalog.gif_url === null, 'Seated Chest Press media placeholders are null');
  assert(seatedChest?.catalog.progression_type === 'weight', 'Seated Chest Press progression is weight');
  assert(seatedChest?.catalog.external_id === '265', 'Seated Chest Press keeps external_id 265');
  assert(machineChest?.record.name === 'Machine Chest Press', 'Machine Chest Press 140 preserved');
  assert(benchPress?.record.name === 'Bench Press', 'Bench Press 1 preserved');
  const seatedChestEq = compatibleEquipmentOptions(seatedChest!.catalog);
  assert(seatedChestEq.length === 1 && seatedChestEq[0] === 'Machine', `Seated Chest Press compatible equipment should be Machine, got ${seatedChestEq.join(', ')}`);
  const seatedChestMeta = seatedChest!.catalog.coaching_metadata;
  assert(seatedChestMeta.exercise_kind === 'compound' && seatedChestMeta.movement_pattern === 'horizontal_push', '265 movement/kind');
  assert(seatedChestMeta.volume_policy === 'strength_hypertrophy' && seatedChestMeta.measurement_type === 'reps' && seatedChestMeta.laterality === 'bilateral', '265 programming fields');
  assert(seatedChestMeta.fatigue_cost === 'moderate' && seatedChestMeta.skill_demand === 'low', '265 fatigue and skill');
  assert(seatedChestMeta.warmup_eligible === false && seatedChestMeta.power_eligible === false && seatedChestMeta.ramp_eligible === true, '265 ramp eligible, not warmup/power');
  assert(
    JSON.stringify(seatedChestMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['265'].hypertrophy_volume_credits),
    '265 volume credits'
  );
  assert(JSON.stringify(seatedChestMeta.primary_muscles) === JSON.stringify(['chest']), '265 primary muscles');
  assert(JSON.stringify(seatedChestMeta.secondary_muscles) === JSON.stringify(['triceps', 'front_delts']), '265 secondary muscles');
  assert(exerciseMatchesEquipment(seatedChest!.catalog, ['machine']), 'Machine equipment filter includes Seated Chest Press');
  assert(!exerciseMatchesEquipment(seatedChest!.catalog, ['barbell']), 'barbell-only filter excludes Seated Chest Press');
  assert(!exerciseMatchesEquipment(seatedChest!.catalog, ['dumbbell']), 'dumbbell-only filter excludes Seated Chest Press');
  assert(!exerciseMatchesEquipment(seatedChest!.catalog, ['kettlebell']), 'kettlebell-only filter excludes Seated Chest Press');
  const seatedChestSearch = searchCatalog(catalog, { query: 'seated chest press', section: 'strength', limit: 5 });
  assert(seatedChestSearch[0]?.name === 'Seated Chest Press', 'seated chest press search finds Seated Chest Press');
  const seatedChestAliasSearch = searchCatalog(catalog, { query: 'selectorized chest press', section: 'strength', limit: 5 });
  assert(seatedChestAliasSearch.some((row) => row.name === 'Seated Chest Press'), 'alias search finds Seated Chest Press');
  assert(seatedChest!.catalog.external_id !== benchPress!.catalog.external_id, 'Seated Chest Press PR key is independent from Bench Press');
  assert(seatedChest!.catalog.external_id !== machineChest!.catalog.external_id, 'Seated Chest Press PR key is independent from Machine Chest Press');

  const isoDecline = mapped.find((row) => row.record.id === '266');
  const declinePress = mapped.find((row) => row.record.id === '3');
  const convergingPress = mapped.find((row) => row.record.id === '262');
  assert(isoDecline?.record.name === 'Iso-Lateral Decline Press', 'master 266 is Iso-Lateral Decline Press');
  assert(isoDecline?.catalog.exercise_type === 'strength', 'Iso-Lateral Decline Press is strength');
  assert(isoDecline?.catalog.movement_pattern === 'push_horizontal', 'Iso-Lateral Decline Press first-class pattern is push_horizontal');
  assert(isoDecline?.catalog.equipment === 'Machine', 'Iso-Lateral Decline Press equipment is Machine');
  assert(
    isoDecline?.catalog.media_url === null && isoDecline?.catalog.image_url === null && isoDecline?.catalog.gif_url === null,
    'Iso-Lateral Decline Press media placeholders are null'
  );
  assert(isoDecline?.catalog.progression_type === 'weight', 'Iso-Lateral Decline Press progression is weight');
  assert(isoDecline?.catalog.external_id === '266', 'Iso-Lateral Decline Press keeps external_id 266');
  assert(declinePress?.record.name === 'Decline Press', 'Decline Press 3 preserved');
  assert(convergingPress?.record.name === 'Converging Chest Press', 'Converging Chest Press 262 preserved');
  const isoDeclineEq = compatibleEquipmentOptions(isoDecline!.catalog);
  assert(
    isoDeclineEq.length === 1 && isoDeclineEq[0] === 'Machine',
    `Iso-Lateral Decline Press compatible equipment should be Machine, got ${isoDeclineEq.join(', ')}`
  );
  const isoDeclineMeta = isoDecline!.catalog.coaching_metadata;
  assert(isoDeclineMeta.exercise_kind === 'compound' && isoDeclineMeta.movement_pattern === 'horizontal_push', '266 movement/kind');
  assert(
    isoDeclineMeta.volume_policy === 'strength_hypertrophy' &&
      isoDeclineMeta.measurement_type === 'reps' &&
      isoDeclineMeta.laterality === 'bilateral',
    '266 programming fields'
  );
  assert(isoDeclineMeta.fatigue_cost === 'moderate' && isoDeclineMeta.skill_demand === 'low', '266 fatigue and skill');
  assert(
    isoDeclineMeta.warmup_eligible === false && isoDeclineMeta.power_eligible === false && isoDeclineMeta.ramp_eligible === true,
    '266 ramp eligible, not warmup/power'
  );
  assert(
    JSON.stringify(isoDeclineMeta.hypertrophy_volume_credits) ===
      JSON.stringify(NEW_MASTER_CLASSIFICATIONS['266'].hypertrophy_volume_credits),
    '266 volume credits'
  );
  assert(JSON.stringify(isoDeclineMeta.primary_muscles) === JSON.stringify(['chest']), '266 primary muscles');
  assert(JSON.stringify(isoDeclineMeta.secondary_muscles) === JSON.stringify(['triceps', 'front_delts']), '266 secondary muscles');
  assert(exerciseMatchesEquipment(isoDecline!.catalog, ['machine']), 'Machine equipment filter includes Iso-Lateral Decline Press');
  assert(!exerciseMatchesEquipment(isoDecline!.catalog, ['barbell']), 'barbell-only filter excludes Iso-Lateral Decline Press');
  assert(!exerciseMatchesEquipment(isoDecline!.catalog, ['dumbbell']), 'dumbbell-only filter excludes Iso-Lateral Decline Press');
  const isoDeclineSearch = searchCatalog(catalog, { query: 'iso-lateral decline press', section: 'strength', limit: 5 });
  assert(isoDeclineSearch[0]?.name === 'Iso-Lateral Decline Press', 'iso-lateral decline press search finds Iso-Lateral Decline Press');
  const hammerDeclineSearch = searchCatalog(catalog, { query: 'hammer strength decline press', section: 'strength', limit: 5 });
  assert(
    hammerDeclineSearch.some((row) => row.name === 'Iso-Lateral Decline Press'),
    'alias search finds Iso-Lateral Decline Press'
  );
  assert(
    distinctCatalogIds(isoDecline!.catalog.external_id, declinePress!.catalog.external_id),
    'Iso-Lateral Decline Press PR key is independent from Decline Press'
  );
  assert(
    distinctCatalogIds(isoDecline!.catalog.external_id, convergingPress!.catalog.external_id),
    'Iso-Lateral Decline Press PR key is independent from Converging Chest Press'
  );
  assert(
    distinctCatalogIds(isoDecline!.catalog.external_id, seatedChest!.catalog.external_id),
    'Iso-Lateral Decline Press PR key is independent from Seated Chest Press'
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
  assert(liveShaped.every(isAiGenerationEligibleRow), `all ${masterCount} mapped masters are AI-eligible`);
  assert(selectAiGenerationCatalogRows([...liveShaped, custom, archived]).length === masterCount, `AI candidates stay ${masterCount}`);
  const standingLever = mapped.find((row) => row.record.id === '267');
  const tBar = mapped.find((row) => row.record.id === '17');
  const landmineRow = mapped.find((row) => row.record.id === '16');
  const chestSupported = mapped.find((row) => row.record.id === '15');
  const machineRow = mapped.find((row) => row.record.id === '142');
  assert(standingLever?.record.name === 'Standing Lever Row', 'master 267 is Standing Lever Row');
  assert(standingLever?.catalog.exercise_type === 'strength', 'Standing Lever Row is strength');
  assert(standingLever?.catalog.movement_pattern === 'pull_horizontal', 'Standing Lever Row first-class pattern is pull_horizontal');
  assert(standingLever?.catalog.equipment === 'Machine', 'Standing Lever Row equipment is Machine');
  assert(
    standingLever?.catalog.media_url === null && standingLever?.catalog.image_url === null && standingLever?.catalog.gif_url === null,
    'Standing Lever Row media placeholders are null'
  );
  assert(standingLever?.catalog.progression_type === 'weight', 'Standing Lever Row progression is weight');
  assert(standingLever?.catalog.external_id === '267', 'Standing Lever Row keeps external_id 267');
  assert(tBar?.record.name === 'T-Bar Row', 'T-Bar Row 17 preserved');
  assert(landmineRow?.record.name === 'Landmine Row', 'Landmine Row 16 preserved');
  assert(chestSupported?.record.name === 'Chest-Supported Row', 'Chest-Supported Row 15 preserved');
  assert(machineRow?.record.name === 'Machine Row', 'Machine Row 142 preserved');
  const standingLeverEq = compatibleEquipmentOptions(standingLever!.catalog);
  assert(
    standingLeverEq.length === 1 && standingLeverEq[0] === 'Machine',
    `Standing Lever Row compatible equipment should be Machine, got ${standingLeverEq.join(', ')}`
  );
  const standingLeverMeta = standingLever!.catalog.coaching_metadata;
  assert(standingLeverMeta.exercise_kind === 'compound' && standingLeverMeta.movement_pattern === 'horizontal_pull', '267 movement/kind');
  assert(
    standingLeverMeta.volume_policy === 'strength_hypertrophy' &&
      standingLeverMeta.measurement_type === 'reps' &&
      standingLeverMeta.laterality === 'bilateral',
    '267 programming fields'
  );
  assert(standingLeverMeta.fatigue_cost === 'moderate' && standingLeverMeta.skill_demand === 'moderate', '267 fatigue and skill');
  assert(
    standingLeverMeta.warmup_eligible === false && standingLeverMeta.power_eligible === false && standingLeverMeta.ramp_eligible === true,
    '267 ramp eligible, not warmup/power'
  );
  assert(
    JSON.stringify(standingLeverMeta.hypertrophy_volume_credits) ===
      JSON.stringify(NEW_MASTER_CLASSIFICATIONS['267'].hypertrophy_volume_credits),
    '267 volume credits'
  );
  assert(JSON.stringify(standingLeverMeta.primary_muscles) === JSON.stringify(['upper_back']), '267 primary muscles');
  assert(
    JSON.stringify(standingLeverMeta.secondary_muscles) === JSON.stringify(['lats', 'biceps', 'rear_delts', 'spinal_erectors']),
    '267 secondary muscles'
  );
  assert(exerciseMatchesEquipment(standingLever!.catalog, ['machine']), 'Machine equipment filter includes Standing Lever Row');
  assert(!exerciseMatchesEquipment(standingLever!.catalog, ['barbell']), 'barbell-only filter excludes Standing Lever Row');
  assert(!exerciseMatchesEquipment(standingLever!.catalog, ['dumbbell']), 'dumbbell-only filter excludes Standing Lever Row');
  const standingLeverSearch = searchCatalog(catalog, { query: 'standing lever row', section: 'strength', limit: 5 });
  assert(standingLeverSearch[0]?.name === 'Standing Lever Row', 'standing lever row search finds Standing Lever Row');
  const leverAliasSearch = searchCatalog(catalog, { query: 'plate-loaded lever row', section: 'strength', limit: 5 });
  assert(leverAliasSearch.some((row) => row.name === 'Standing Lever Row'), 'alias search finds Standing Lever Row');
  assert(
    distinctCatalogIds(standingLever!.catalog.external_id, isoLateralRow!.catalog.external_id),
    'Standing Lever Row PR key is independent from Iso-Lateral Row'
  );
  assert(
    distinctCatalogIds(standingLever!.catalog.external_id, tBar!.catalog.external_id),
    'Standing Lever Row PR key is independent from T-Bar Row'
  );
  assert(
    distinctCatalogIds(standingLever!.catalog.external_id, landmineRow!.catalog.external_id),
    'Standing Lever Row PR key is independent from Landmine Row'
  );
  assert(
    distinctCatalogIds(standingLever!.catalog.external_id, machineRow!.catalog.external_id),
    'Standing Lever Row PR key is independent from Machine Row'
  );

  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '261')), 'Iso-Lateral Row is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '262')), 'Converging Chest Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '263')), 'Seated Overhead Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '264')), 'GHD Sit-Up is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '265')), 'Seated Chest Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '266')), 'Iso-Lateral Decline Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '267')), 'Standing Lever Row is generation-eligible');

  const isoBench = mapped.find((row) => row.record.id === '268');
  const seatedIso = mapped.find((row) => row.record.id === '269');
  assert(isoBench?.record.name === 'Iso-Lateral Bench Press', 'master 268 is Iso-Lateral Bench Press');
  assert(seatedIso?.record.name === 'Seated Iso-Lateral Chest Press', 'master 269 is Seated Iso-Lateral Chest Press');
  assert(isoBench?.catalog.equipment === 'Machine' && seatedIso?.catalog.equipment === 'Machine', 'iso-lateral presses are Machine');
  assert(isoBench?.catalog.movement_pattern === 'push_horizontal' && seatedIso?.catalog.movement_pattern === 'push_horizontal', 'iso-lateral presses are horizontal push');
  assert(isoBench?.catalog.media_url === null && isoBench?.catalog.image_url === null && isoBench?.catalog.gif_url === null, '268 media placeholders are null');
  assert(seatedIso?.catalog.media_url === null && seatedIso?.catalog.image_url === null && seatedIso?.catalog.gif_url === null, '269 media placeholders are null');
  assert(isoBench?.catalog.external_id === '268' && seatedIso?.catalog.external_id === '269', '268 and 269 keep stable external ids');
  assert(/45 lb per side is 90 lb total/i.test(String(isoBench?.catalog.instructions || '')), '268 instructions state combined load');
  assert(/45 lb per side is 90 lb total/i.test(String(seatedIso?.catalog.instructions || '')), '269 instructions state combined load');
  assert(/working arm/i.test(String(isoBench?.catalog.instructions || '')), '268 instructions state single-arm load');
  assert(/working arm/i.test(String(seatedIso?.catalog.instructions || '')), '269 instructions state single-arm load');
  const isoBenchMeta = isoBench!.catalog.coaching_metadata;
  const seatedIsoMeta = seatedIso!.catalog.coaching_metadata;
  assert(isoBenchMeta.exercise_kind === 'compound' && isoBenchMeta.movement_pattern === 'horizontal_push' && isoBenchMeta.laterality === 'bilateral', '268 programming fields');
  assert(seatedIsoMeta.exercise_kind === 'compound' && seatedIsoMeta.movement_pattern === 'horizontal_push' && seatedIsoMeta.laterality === 'bilateral', '269 programming fields');
  assert(
    JSON.stringify(isoBenchMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['268'].hypertrophy_volume_credits),
    '268 volume credits'
  );
  assert(
    JSON.stringify(seatedIsoMeta.hypertrophy_volume_credits) === JSON.stringify(NEW_MASTER_CLASSIFICATIONS['269'].hypertrophy_volume_credits),
    '269 volume credits'
  );
  assert(
    distinctCatalogIds(isoBench!.catalog.external_id, benchPress!.catalog.external_id),
    'Iso-Lateral Bench Press stays independent from Bench Press'
  );
  assert(
    distinctCatalogIds(isoBench!.catalog.external_id, machineChest!.catalog.external_id),
    'Iso-Lateral Bench Press stays independent from Machine Chest Press'
  );
  assert(
    distinctCatalogIds(isoBench!.catalog.external_id, convergingPress!.catalog.external_id),
    'Iso-Lateral Bench Press stays independent from Converging Chest Press'
  );
  assert(
    distinctCatalogIds(seatedIso!.catalog.external_id, seatedChest!.catalog.external_id),
    'Seated Iso-Lateral Chest Press stays independent from Seated Chest Press'
  );
  assert(
    distinctCatalogIds(seatedIso!.catalog.external_id, isoBench!.catalog.external_id),
    'Seated Iso-Lateral Chest Press stays independent from Iso-Lateral Bench Press'
  );
  const isoBenchSearch = searchCatalog(catalog, { query: 'iso-lateral bench press', section: 'strength', limit: 5 });
  assert(isoBenchSearch[0]?.name === 'Iso-Lateral Bench Press', 'iso-lateral bench press search finds 268');
  const seatedIsoSearch = searchCatalog(catalog, { query: 'seated iso-lateral chest press', section: 'strength', limit: 5 });
  assert(seatedIsoSearch[0]?.name === 'Seated Iso-Lateral Chest Press', 'seated iso-lateral chest press search finds 269');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '268')), 'Iso-Lateral Bench Press is generation-eligible');
  assert(isAiGenerationEligibleRow(liveShaped.find((row) => row.external_id === '269')), 'Seated Iso-Lateral Chest Press is generation-eligible');
  assert(!isAiGenerationEligibleRow(archived), 'archived cards cannot enter generation');
  assert(!isAiGenerationEligibleRow(custom), 'user customs cannot enter generation');
  const adapted = adaptGenerationCatalog([...liveShaped, custom, archived], { allowFallback: false });
  assert(adapted.length === masterCount, `adapted generation catalog is ${masterCount}, got ${adapted.length}`);
  assert(adapted.some((ex) => ex.name === 'Iso-Lateral Row'), 'adapted catalog includes Iso-Lateral Row');
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
  const adaptedSeatedChest = adapted.find((ex) => ex.name === 'Seated Chest Press');
  assert(adaptedSeatedChest, 'adapted catalog includes Seated Chest Press');
  assert(adaptedSeatedChest?.movementPattern === 'horizontal_push', 'AI reads Seated Chest Press as horizontal push');
  assert(adaptedSeatedChest?.exerciseType === 'compound', 'AI reads Seated Chest Press as compound');
  assert(adaptedSeatedChest?.primaryMuscles.includes('chest') && adaptedSeatedChest?.secondaryMuscles.includes('triceps'), 'AI reads Seated Chest Press muscles');
  assert(adaptedSeatedChest?.equipment.some((eq) => eq.toLowerCase() === 'machine'), 'AI reads Seated Chest Press Machine equipment');
  assert(adaptedSeatedChest?.fatigueCost === 'medium' && adaptedSeatedChest?.defaultRepMin === 5 && adaptedSeatedChest?.defaultRepMax === 10, 'AI reads Seated Chest Press demand and reps');
  assert(adaptedSeatedChest?.programRoles.includes('accessory') && adaptedSeatedChest?.warmupSuitable === false, 'AI reads Seated Chest Press as accessory, not warmup');
  const adaptedIsoDecline = adapted.find((ex) => ex.name === 'Iso-Lateral Decline Press');
  assert(adaptedIsoDecline, 'adapted catalog includes Iso-Lateral Decline Press');
  assert(adaptedIsoDecline?.movementPattern === 'horizontal_push', 'AI reads Iso-Lateral Decline Press as horizontal push');
  assert(adaptedIsoDecline?.exerciseType === 'compound', 'AI reads Iso-Lateral Decline Press as compound');
  assert(
    adaptedIsoDecline?.primaryMuscles.includes('chest') && adaptedIsoDecline?.secondaryMuscles.includes('triceps'),
    'AI reads Iso-Lateral Decline Press muscles'
  );
  assert(adaptedIsoDecline?.equipment.some((eq) => eq.toLowerCase() === 'machine'), 'AI reads Iso-Lateral Decline Press Machine equipment');
  assert(
    adaptedIsoDecline?.fatigueCost === 'medium' && adaptedIsoDecline?.defaultRepMin === 5 && adaptedIsoDecline?.defaultRepMax === 10,
    'AI reads Iso-Lateral Decline Press demand and reps'
  );
  assert(
    adaptedIsoDecline?.programRoles.includes('accessory') && adaptedIsoDecline?.warmupSuitable === false,
    'AI reads Iso-Lateral Decline Press as accessory, not warmup'
  );
  const adaptedStandingLever = adapted.find((ex) => ex.name === 'Standing Lever Row');
  assert(adaptedStandingLever, 'adapted catalog includes Standing Lever Row');
  assert(adaptedStandingLever?.movementPattern === 'horizontal_pull', 'AI reads Standing Lever Row as horizontal pull');
  assert(adaptedStandingLever?.exerciseType === 'compound', 'AI reads Standing Lever Row as compound');
  assert(
    adaptedStandingLever?.primaryMuscles.includes('upper_back') && adaptedStandingLever?.secondaryMuscles.includes('spinal_erectors'),
    'AI reads Standing Lever Row muscles'
  );
  assert(adaptedStandingLever?.equipment.some((eq) => eq.toLowerCase() === 'machine'), 'AI reads Standing Lever Row Machine equipment');
  assert(
    adaptedStandingLever?.fatigueCost === 'medium' && adaptedStandingLever?.defaultRepMin === 5 && adaptedStandingLever?.defaultRepMax === 10,
    'AI reads Standing Lever Row demand and reps'
  );
  assert(
    adaptedStandingLever?.programRoles.includes('accessory') && adaptedStandingLever?.warmupSuitable === false,
    'AI reads Standing Lever Row as accessory, not warmup'
  );
  const adaptedIsoRow = adapted.find((ex) => ex.name === 'Iso-Lateral Row');
  assert(adaptedIsoRow, 'adapted catalog includes Iso-Lateral Row');
  assert(adaptedIsoRow?.movementPattern === 'horizontal_pull', 'AI reads Iso-Lateral Row as horizontal pull');
  assert(adaptedIsoRow?.equipment.some((eq) => eq.toLowerCase() === 'machine'), 'AI reads Iso-Lateral Row Machine equipment');
  assert(adaptGenerationCatalog([], {}).length === FALLBACK_CATALOG.length, 'fallback still works on empty catalog');

  console.log('BIQ-0235 catalog cleanup checks passed.');
  console.log(`Strength row top: ${strengthNames.slice(0, 10).join(', ')}`);
  console.log(`Cardio row top: ${cardioRow.map((item) => item.name).join(', ')}`);
}
