import { normalizeMovementPattern } from '../scienceEngine/taxonomy';
import { UNSPECIFIED_EQUIPMENT } from './identity';
import type { DataProvenance } from './provenance';
import type { SeriesWindows } from './strengthSeries';

export const STRENGTH_PATTERNS = [
  { id: 'horizontal_push', label: 'Horizontal Push' },
  { id: 'horizontal_pull', label: 'Horizontal Pull' },
  { id: 'vertical_push', label: 'Vertical Push' },
  { id: 'vertical_pull', label: 'Vertical Pull' },
  { id: 'knee_dominant', label: 'Knee Dominant' },
  { id: 'hip_hinge', label: 'Hip Hinge' },
] as const;

export type StrengthPatternId = (typeof STRENGTH_PATTERNS)[number]['id'];

export type SeriesConfidence = 'high' | 'moderate' | 'low' | 'insufficient';

export type StrengthIndexConfig = {
  /** Patterns with a representative at or above this count use the Overall Strength label. */
  minPatternsForOverall: number;
  patternIds: readonly StrengthPatternId[];
  selector: RepresentativeSeriesSelector;
};

export const DEFAULT_STRENGTH_INDEX_CONFIG: StrengthIndexConfig = {
  minPatternsForOverall: 4,
  patternIds: STRENGTH_PATTERNS.map((pattern) => pattern.id),
  selector: selectRepresentativeSeries,
};

export type RepresentativeCandidate = SeriesWindows & {
  patternId: StrengthPatternId;
  confidence: SeriesConfidence;
  compound: boolean;
  /** Present so tests can prove the selector does not rank by set count. */
  workingSetCount: number;
};

export type RepresentativeSelection = {
  representative: RepresentativeCandidate | null;
  secondary: RepresentativeCandidate[];
  excluded: RepresentativeCandidate[];
  reason: string;
};

export type RepresentativeSelectionInput = {
  patternId: StrengthPatternId;
  candidates: RepresentativeCandidate[];
};

export type RepresentativeSeriesSelector = (input: RepresentativeSelectionInput) => RepresentativeSelection;

export type PatternStrength = {
  patternId: StrengthPatternId;
  label: string;
  percentChange: number | null;
  representative: RepresentativeCandidate | null;
  secondary: RepresentativeCandidate[];
  excluded: RepresentativeCandidate[];
  reason: string;
  includedInIndex: boolean;
};

export type StrengthIndexLabel = 'overall' | 'trend' | 'none';

export type StrengthIndexResult = {
  label: StrengthIndexLabel;
  percentChange: number | null;
  patternsCovered: number;
  patternCount: number;
  headline: string | null;
  coverageLine: string | null;
  confidence: 'measured' | 'mixed' | 'estimated' | 'none';
  disclosure: string | null;
  patterns: PatternStrength[];
};

export function strengthPatternId(movementPattern: string | null): StrengthPatternId | null {
  if (!movementPattern) return null;
  const normalized = normalizeMovementPattern(movementPattern);
  if (normalized === 'horizontal_push') return 'horizontal_push';
  if (normalized === 'horizontal_pull') return 'horizontal_pull';
  if (normalized === 'vertical_push') return 'vertical_push';
  if (normalized === 'vertical_pull') return 'vertical_pull';
  if (normalized === 'squat' || normalized === 'lunge') return 'knee_dominant';
  if (normalized === 'hinge') return 'hip_hinge';
  return null;
}

export function seriesConfidence(series: SeriesWindows): SeriesConfidence {
  if (series.percentChange == null || series.baselineE1rm == null || series.currentE1rm == null) return 'insufficient';
  const sessions = Math.min(series.baselineSessions, series.currentSessions);
  if (series.identity.equipmentKey === UNSPECIFIED_EQUIPMENT || series.equipmentProvenance === 'unknown') return 'low';
  if (sessions >= 3 && series.equipmentProvenance === 'snapshotted' && series.patternProvenance === 'snapshotted') return 'high';
  if (sessions >= 2) return 'moderate';
  return 'low';
}

export function isCompoundCandidate(series: SeriesWindows): boolean {
  const role = String(series.programRole || '').toLowerCase();
  if (role === 'isolation' || role === 'accessory' || role === 'warmup' || role === 'conditioning') return false;
  return true;
}

/**
 * Pick the series that best represents a pattern over time.
 * Repeated sessions and a compound role outrank a high set count.
 * No implement name is preferred.
 */
export function selectRepresentativeSeries(input: RepresentativeSelectionInput): RepresentativeSelection {
  const eligible = input.candidates.filter((candidate) => candidate.confidence !== 'insufficient' && candidate.percentChange != null);
  const excluded = input.candidates.filter((candidate) => !eligible.includes(candidate));
  const headlineEligible = eligible.filter((candidate) => candidate.identity.equipmentKey !== UNSPECIFIED_EQUIPMENT);
  const pool = headlineEligible.length ? headlineEligible : [];
  if (!pool.length) {
    return {
      representative: null,
      secondary: eligible.filter((candidate) => candidate.identity.equipmentKey === UNSPECIFIED_EQUIPMENT),
      excluded,
      reason: 'No series has comparable loaded history on a known implement.',
    };
  }
  const ranked = [...pool].sort(compareRepresentative);
  const representative = ranked[0];
  return {
    representative,
    secondary: ranked.slice(1).concat(eligible.filter((candidate) => candidate.identity.equipmentKey === UNSPECIFIED_EQUIPMENT)),
    excluded,
    reason: representativeReason(representative),
  };
}

export function buildStrengthIndex(series: SeriesWindows[], config: StrengthIndexConfig = DEFAULT_STRENGTH_INDEX_CONFIG): StrengthIndexResult {
  const patterns = config.patternIds.map((patternId) => {
    const label = STRENGTH_PATTERNS.find((pattern) => pattern.id === patternId)?.label || patternId;
    const candidates = series
      .filter((item) => strengthPatternId(item.movementPattern) === patternId)
      .map((item) => ({
        ...item,
        patternId,
        confidence: seriesConfidence(item),
        compound: isCompoundCandidate(item),
        workingSetCount: item.workingSetsInView,
      }));
    const selection = config.selector({ patternId, candidates });
    const included = selection.representative != null && selection.representative.identity.equipmentKey !== UNSPECIFIED_EQUIPMENT;
    return {
      patternId,
      label,
      percentChange: included ? selection.representative?.percentChange ?? null : null,
      representative: selection.representative,
      secondary: selection.secondary,
      excluded: selection.excluded,
      reason: selection.reason,
      includedInIndex: included && selection.representative?.percentChange != null,
    };
  });

  const used = patterns.filter((pattern) => pattern.includedInIndex && pattern.percentChange != null);
  const percentChange = used.length
    ? Math.round((used.reduce((sum, pattern) => sum + (pattern.percentChange || 0), 0) / used.length) * 10) / 10
    : null;
  const patternCount = config.patternIds.length;
  const patternsCovered = used.length;
  const label: StrengthIndexLabel =
    percentChange == null ? 'none' : patternsCovered >= config.minPatternsForOverall ? 'overall' : 'trend';
  const signed = percentChange == null ? '' : `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`;
  const headline = label === 'overall' ? `Overall Strength ${signed}` : label === 'trend' ? `Strength Trend ${signed}` : null;
  const coverageLine =
    label === 'overall'
      ? `Based on ${patternsCovered} of ${patternCount} movement patterns`
      : label === 'trend'
        ? `Based on ${patternsCovered} movement pattern${patternsCovered === 1 ? '' : 's'}`
        : null;

  const usedReps = used.map((pattern) => pattern.representative).filter((item): item is RepresentativeCandidate => !!item);
  const confidence = indexConfidence(usedReps);
  const disclosure = disclosureFor(usedReps);

  return {
    label,
    percentChange,
    patternsCovered,
    patternCount,
    headline,
    coverageLine,
    confidence,
    disclosure,
    patterns,
  };
}

function compareRepresentative(a: RepresentativeCandidate, b: RepresentativeCandidate): number {
  if (a.compound !== b.compound) return a.compound ? -1 : 1;
  const repeatedA = Math.min(a.baselineSessions, a.currentSessions);
  const repeatedB = Math.min(b.baselineSessions, b.currentSessions);
  if (repeatedA !== repeatedB) return repeatedB - repeatedA;
  if (a.distinctWeeks !== b.distinctWeeks) return b.distinctWeeks - a.distinctWeeks;
  const provenanceA = provenanceScore(a.equipmentProvenance) + provenanceScore(a.patternProvenance);
  const provenanceB = provenanceScore(b.equipmentProvenance) + provenanceScore(b.patternProvenance);
  if (provenanceA !== provenanceB) return provenanceB - provenanceA;
  return a.key.localeCompare(b.key);
}

function provenanceScore(value: DataProvenance): number {
  if (value === 'snapshotted') return 3;
  if (value === 'backfilled') return 2;
  if (value === 'estimated') return 1;
  return 0;
}

function representativeReason(series: RepresentativeCandidate): string {
  const sessions = Math.min(series.baselineSessions, series.currentSessions);
  const kind = series.compound ? 'compound' : 'movement';
  return `${series.label} has comparable ${kind} history across ${sessions} session${sessions === 1 ? '' : 's'} in each window.`;
}

function indexConfidence(series: RepresentativeCandidate[]): StrengthIndexResult['confidence'] {
  if (!series.length) return 'none';
  const estimated = series.some(
    (item) => item.patternProvenance === 'estimated' || item.equipmentProvenance === 'backfilled' || item.equipmentProvenance === 'estimated'
  );
  const measured = series.every((item) => item.equipmentProvenance === 'snapshotted' && item.patternProvenance === 'snapshotted');
  if (measured) return 'measured';
  if (estimated) return series.every((item) => item.patternProvenance !== 'snapshotted' && item.equipmentProvenance !== 'snapshotted') ? 'estimated' : 'mixed';
  return 'mixed';
}

function disclosureFor(series: RepresentativeCandidate[]): string | null {
  const estimatedPattern = series.some((item) => item.patternProvenance === 'estimated');
  const backfilledEquipment = series.some((item) => item.equipmentProvenance === 'backfilled');
  if (estimatedPattern && backfilledEquipment) {
    return 'Some older workouts use equipment recovered from the logged name and movement patterns estimated from the current exercise library.';
  }
  if (estimatedPattern) {
    return 'Movement patterns for some older workouts are estimated from the current exercise library.';
  }
  if (backfilledEquipment) {
    return 'Equipment for some older workouts was recovered from the logged exercise name or a single legal implement.';
  }
  return null;
}
