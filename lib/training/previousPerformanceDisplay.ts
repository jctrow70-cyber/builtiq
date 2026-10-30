/**
 * BIQ-0271 Phase E2.2 — logger display and Copy last gating for previous performance.
 * Does not change matching, snapshots, or persistence.
 */
import type {
  PreviousPerformanceHit,
  PreviousPerformanceKind,
  PreviousPerformanceResult,
} from './previousPerformance';

export type PreviousPerformanceLineKind = PreviousPerformanceKind | 'name_only';

export type PreviousPerformanceLine = {
  kind: PreviousPerformanceLineKind;
  text: string;
  copyLast: boolean;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Use the in-progress equipment choice so previous performance does not lag the dropdown. */
export function loggerSelectedEquipment(persisted?: string | null, pending?: string | null): string {
  const next = String(pending || '').trim();
  if (next) return next;
  return String(persisted || '').trim();
}

/** Silent Copy last requires a verified equipment match and catalog identity, not a name-only overlap. */
export function loggerCopyLastEligible(result: PreviousPerformanceResult | null | undefined): boolean {
  if (!result?.copyLastEligible || !result.copyLastSource) return false;
  return result.copyLastSource.identityMatch === 'catalog';
}

export function previousPerformanceLine(result: PreviousPerformanceResult | null | undefined): PreviousPerformanceLine | null {
  if (!result || result.kind === 'none') return null;

  if (result.kind === 'exact' && result.comparable) {
    if (result.comparable.identityMatch === 'name') {
      return {
        kind: 'name_only',
        text: `Last by name: ${formatHit(result.comparable, { includeEquipment: true })}`,
        copyLast: false,
      };
    }
    return {
      kind: 'exact',
      text: `Last: ${formatHit(result.comparable, { includeEquipment: true })}`,
      copyLast: loggerCopyLastEligible(result),
    };
  }

  if (result.kind === 'unknown_equipment' && result.uncertain) {
    return {
      kind: 'unknown_equipment',
      text: `Last (equipment unknown): ${formatHit(result.uncertain, { includeEquipment: false })}`,
      copyLast: false,
    };
  }

  if (result.kind === 'different_equipment' && result.otherEquipment[0]) {
    const hit = result.otherEquipment[0];
    return {
      kind: 'different_equipment',
      text: `Last on ${hit.equipment || 'other equipment'}: ${formatHit(hit, { includeEquipment: false })}`,
      copyLast: false,
    };
  }

  return null;
}

/** Input placeholders stay reserved for verified comparable sets. Uncertain history is labeled, not hinted into the field. */
export function previousPerformanceFieldHint(
  result: PreviousPerformanceResult | null | undefined,
  field: string,
): string | undefined {
  if (!loggerCopyLastEligible(result) || !result?.copyLastSource) return undefined;
  const hit = result.copyLastSource;
  if (field === 'actual_weight') return hit.weight || undefined;
  if (field === 'actual_reps') return hit.reps || undefined;
  return undefined;
}

export function previousPerformanceCopyLastAriaLabel(): string {
  return 'Copy last verified workout values';
}

function formatHit(hit: PreviousPerformanceHit, opts: { includeEquipment: boolean }): string {
  const bits: string[] = [];
  const performance = performanceLabel(hit);
  if (performance) bits.push(performance);
  if (opts.includeEquipment && hit.equipment && hit.equipmentKey !== 'unspecified') bits.push(hit.equipment);
  if (hit.date) bits.push(formatPrevDate(hit.date));
  return bits.join(' · ') || 'previous set';
}

function performanceLabel(hit: PreviousPerformanceHit): string {
  const weight = String(hit.weight || '').trim();
  const reps = String(hit.reps || '').trim();
  if (weight && reps) return `${weight} × ${reps}`;
  if (weight) return weight;
  if (reps) return `${reps} reps`;
  return '';
}

function formatPrevDate(value: string): string {
  const ymd = String(value || '').slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const month = MONTHS[Number(match[2]) - 1];
  const day = String(Number(match[3]));
  return month ? `${month} ${day}` : ymd;
}
