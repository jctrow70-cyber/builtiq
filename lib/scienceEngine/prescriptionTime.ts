export type PrescriptionKind = 'time' | 'reps' | 'distance';

export type ParsedPrescriptionTiming = {
  kind: PrescriptionKind;
  seconds: number;
  reps?: number;
  perSide: boolean;
  distance?: number;
  distanceUnit?: 'mi' | 'km' | 'm';
};

const REP_SECONDS = 2.4;
const MIN_REP_SET_SECONDS = 20;
const WALK_SECONDS_PER_MILE = 900;
const WALK_SECONDS_PER_KM = 560;

export function parsePrescriptionTiming(
  raw?: string,
  measurementType?: string | null
): ParsedPrescriptionTiming {
  const text = String(raw || '').trim();
  const forced = String(measurementType || '').toLowerCase();
  const perSide = /(?:\/\s*side|per\s*side|each\s*side|\/side)/i.test(text);

  const distance = parseDistance(text);
  if (distance || forced === 'distance') {
    const miles = distance?.unit === 'km' ? distance.value * 0.621371 : distance?.unit === 'm' ? distance.value / 1609.34 : distance?.value || 0;
    const seconds = Math.max(20, Math.round((distance?.unit === 'km' ? distance.value * WALK_SECONDS_PER_KM : distance?.unit === 'm' ? (distance.value / 1000) * WALK_SECONDS_PER_KM : miles * WALK_SECONDS_PER_MILE) || MIN_REP_SET_SECONDS));
    return { kind: 'distance', seconds, perSide, distance: distance?.value, distanceUnit: distance?.unit };
  }

  const timed = parseTimeSeconds(text);
  if (timed != null || forced === 'time') {
    return { kind: 'time', seconds: Math.max(1, timed ?? 30), perSide };
  }

  const reps = parseReps(text);
  const sides = perSide ? 2 : 1;
  const seconds = Math.max(MIN_REP_SET_SECONDS, Math.round((reps || 8) * sides * REP_SECONDS));
  return { kind: 'reps', seconds, reps: reps || 8, perSide };
}

export function prepItemSeconds(opts: { prescription?: string; reps?: string; sets?: number; measurementType?: string | null; laterality?: string | null }): number {
  const parsed = parsePrescriptionTiming(opts.prescription || opts.reps, opts.measurementType);
  const sets = Math.max(1, Number(opts.sets) || 1);
  const unilateral = opts.laterality === 'unilateral' || opts.laterality === 'alternating';
  const sides = parsed.perSide || unilateral ? (parsed.kind === 'time' || parsed.kind === 'distance' ? 1 : 2) : 1;
  if (parsed.kind === 'time' || parsed.kind === 'distance') return sets * parsed.seconds;
  return sets * Math.max(MIN_REP_SET_SECONDS, Math.round((parsed.reps || 8) * sides * REP_SECONDS));
}

function parseTimeSeconds(text: string): number | null {
  const rangeMin = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|min|seconds?|secs?|sec|s)\b/i);
  if (rangeMin) {
    const a = Number(rangeMin[1]);
    const b = Number(rangeMin[2]);
    return toSeconds((a + b) / 2, rangeMin[3]);
  }
  const single = text.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|minutes?|mins?|min|seconds?|secs?|sec|s)\b/i);
  if (single) return toSeconds(Number(single[1]), single[2]);
  return null;
}

function toSeconds(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^h/.test(u)) return Math.round(value * 3600);
  if (/^m/.test(u)) return Math.round(value * 60);
  return Math.round(value);
}

function parseReps(text: string): number | undefined {
  const withSets = text.match(/(?:\d+\s*[x×]\s*)?(\d+)(?:\s*[-–]\s*(\d+))?/i);
  if (!withSets) return undefined;
  const min = Number(withSets[1]);
  const max = withSets[2] ? Number(withSets[2]) : min;
  if (!Number.isFinite(min)) return undefined;
  return Math.round((min + max) / 2);
}

function parseDistance(text: string): { value: number; unit: 'mi' | 'km' | 'm' } | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*(miles?|mi|kilometers?|kilometres?|km|meters?|metres?|m)\b/i);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit.startsWith('mi')) return { value, unit: 'mi' };
  if (unit.startsWith('km') || unit.startsWith('kil')) return { value, unit: 'km' };
  return { value, unit: 'm' };
}
