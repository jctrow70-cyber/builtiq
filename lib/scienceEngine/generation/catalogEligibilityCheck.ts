import { MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { userCustomCatalogItems, workoutSearchCatalogItems } from '../../training/catalogSearch';
import { adaptCatalog, FALLBACK_CATALOG } from '../catalogAdapter';
import { adaptGenerationCatalog, isAiGenerationEligibleRow, selectAiGenerationCatalogRows } from './catalogEligibility';
import { buildDesignerLibraries } from './library';
import { trainingProfileFromSources } from '../profile';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function masterRow(id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: MASTER_CATALOG_SOURCE,
    external_id: id,
    category: 'strength',
    muscle_group: 'chest',
    equipment: 'Barbell',
    movement_pattern: 'push_horizontal',
    coaching_metadata: { enrichment_version: 'BIQ-0213' },
    ...extra,
  };
}

function customRow(id: string, name: string, userId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name,
    is_archived: false,
    is_system: false,
    user_id: userId,
    external_source: null,
    external_id: null,
    category: 'strength',
    ...extra,
  };
}

export function runGenerationCatalogPolicyChecks() {
  const userA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const userB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const masters = Array.from({ length: 260 }, (_, i) => masterRow(String(i + 1), `Master ${i + 1}`));
  const archivedMaster = masterRow('archived-1', 'Archived Master', { is_archived: true, id: 'archived-1' });
  const legacySystem = {
    id: 'legacy-1',
    name: 'Legacy Import Row',
    is_archived: false,
    is_system: true,
    user_id: null,
    external_source: 'free_exercise_db',
    external_id: 'Legacy',
  };
  const customsA = [
    customRow('custom-a-curl', 'Cable Curl', userA),
    customRow('custom-a-hip', 'Hip Thrust', userA),
  ];
  const customsB = [customRow('custom-b-row', 'Monkey Rows', userB)];
  const serviceRoleFetch = [...masters, archivedMaster, legacySystem, ...customsA, ...customsB];

  assert(masters.every(isAiGenerationEligibleRow), 'all 260 active builtiq_master exercises are eligible');
  assert(selectAiGenerationCatalogRows(masters).length === 260, 'select keeps all 260 active masters');
  assert(!isAiGenerationEligibleRow(archivedMaster), 'archived master exercises are not eligible');
  assert(customsA.every((row) => !isAiGenerationEligibleRow(row)), 'user custom exercises are not eligible');
  assert(!isAiGenerationEligibleRow(legacySystem), 'non-master system rows are not eligible');

  const userBCandidates = selectAiGenerationCatalogRows([...masters, ...customsA, ...customsB]);
  assert(
    userBCandidates.every((row) => row.user_id !== userA && row.id !== 'custom-a-curl' && row.id !== 'custom-a-hip'),
    "User A's custom cannot enter User B's candidate library"
  );
  assert(
    userBCandidates.every((row) => row.user_id !== userB),
    'User B customs are also excluded from automatic AI generation'
  );

  const serviceRoleEligible = selectAiGenerationCatalogRows(serviceRoleFetch);
  assert(serviceRoleEligible.length === 260, `service-role fetch must not bypass ownership policy, got ${serviceRoleEligible.length}`);
  assert(
    serviceRoleEligible.every((row) => row.external_source === MASTER_CATALOG_SOURCE && !row.user_id && row.is_archived !== true),
    'service-role eligible set is active builtiq_master only'
  );

  const liveShape = Array.from({ length: 279 }, (_, i) =>
    i < 260 ? masters[i] : customRow(`live-custom-${i}`, `Custom ${i}`, userA)
  );
  assert(liveShape.length === 279, 'live-shaped catalog is 279 actives');
  assert(selectAiGenerationCatalogRows(liveShape).length === 260, '279 active rows → AI candidate library should become 260');
  assert(adaptGenerationCatalog(liveShape, { allowFallback: false }).length === 260, 'adapted generation catalog is 260');

  const adaptedLeak = adaptCatalog(serviceRoleFetch, { allowFallback: false });
  const pipelineSafe = adaptGenerationCatalog(adaptedLeak, { allowFallback: false });
  assert(
    pipelineSafe.length === 260 && pipelineSafe.every((ex) => !ex.raw?.user_id),
    'adapting a service-role dump first still cannot leak customs into generation'
  );

  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'muscle' },
    config: { days: ['Mon'], dayTypes: { Mon: 'Full Body' }, weeks: 1, sessionMinutes: 60 },
  });
  const libraries = buildDesignerLibraries(adaptGenerationCatalog(serviceRoleFetch, { allowFallback: false }), profile);
  const libraryIds = [...libraries.candidate_library, ...libraries.warmup_library, ...libraries.cooldown_library].map(
    (ex) => ex.exercise_id
  );
  assert(
    !libraryIds.includes('custom-a-curl') && !libraryIds.includes('custom-b-row'),
    'designer libraries contain no custom IDs'
  );

  const ownerSearch = workoutSearchCatalogItems(serviceRoleFetch, userA);
  const ownerCustoms = userCustomCatalogItems(serviceRoleFetch, userA);
  assert(ownerCustoms.length === 2, 'custom exercises remain visible to the owner for manual/history use');
  assert(
    ownerSearch.some((row) => row.id === 'custom-a-curl'),
    'owner Training search still includes their custom Cable Curl'
  );
  assert(
    workoutSearchCatalogItems(serviceRoleFetch, userB).every((row) => row.id !== 'custom-a-curl'),
    "User B's Training search does not include User A's customs"
  );

  const fallbackFromEmpty = adaptGenerationCatalog([], {});
  const fallbackDirect = adaptCatalog([], {});
  assert(fallbackFromEmpty.length === FALLBACK_CATALOG.length, 'empty generation catalog still uses FALLBACK_CATALOG');
  assert(fallbackDirect.length === FALLBACK_CATALOG.length, 'adaptCatalog FALLBACK behavior remains unchanged');
  assert(
    adaptGenerationCatalog(FALLBACK_CATALOG).length === FALLBACK_CATALOG.length,
    'in-memory FALLBACK_CATALOG remains generation-eligible when genuinely needed'
  );
  assert(
    adaptGenerationCatalog(masters.slice(0, 5)).some((ex) => FALLBACK_CATALOG.some((fb) => fb.id === ex.id)),
    'FALLBACK_CATALOG still injects when fewer than 12 eligible masters exist'
  );
  assert(
    adaptGenerationCatalog(masters, { allowFallback: false }).every((ex) => !FALLBACK_CATALOG.some((fb) => fb.id === ex.id && fb.id !== ex.raw?.id)),
    'FALLBACK_CATALOG is not mixed into a full master library'
  );

  console.log('BIQ-0216 generation catalog eligibility checks passed.');
}
