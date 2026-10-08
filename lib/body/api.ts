import { supabase } from '../supabaseClient';
import {
  draftToCanonical,
  hasAnyBodyMeasurement,
  mergeMeasurement,
  type BodyMeasurementDraft,
  type BodyMeasurementRow,
  type UnitsPreference,
} from './measurements';

const MEASUREMENT_COLUMNS =
  'id,user_id,measured_on,weight_lbs,waist_inches,chest_inches,arm_inches,thigh_inches,hip_inches,neck_inches,body_fat_percent,measurement_extras,notes,created_at,updated_at';
const LEGACY_MEASUREMENT_COLUMNS = 'id,user_id,measured_on,weight_lbs,waist_inches,notes,created_at,updated_at';

function measurementColumnsFor(errorMessage?: string) {
  return errorMessage && /chest_inches|arm_inches|thigh_inches|hip_inches|neck_inches|body_fat_percent|measurement_extras/i.test(errorMessage)
    ? LEGACY_MEASUREMENT_COLUMNS
    : MEASUREMENT_COLUMNS;
}

const DEFAULT_LIMIT = 60;

export async function fetchBodyMeasurements(userId: string, limit = DEFAULT_LIMIT): Promise<BodyMeasurementRow[]> {
  const first = await supabase
    .from('st_body_measurements')
    .select(MEASUREMENT_COLUMNS)
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(limit);
  const result = first.error
    ? await supabase
        .from('st_body_measurements')
        .select(measurementColumnsFor(first.error.message))
        .eq('user_id', userId)
        .order('measured_on', { ascending: false })
        .limit(limit)
    : first;
  if (result.error) throw result.error;
  return (result.data || []) as BodyMeasurementRow[];
}

export async function saveBodyMeasurement(
  userId: string,
  draft: BodyMeasurementDraft,
  units: UnitsPreference
): Promise<BodyMeasurementRow> {
  const parsed = draftToCanonical(draft, units);
  if (!parsed) throw new Error('Enter at least one body measurement.');

  let existingResult = await supabase
    .from('st_body_measurements')
    .select(MEASUREMENT_COLUMNS)
    .eq('user_id', userId)
    .eq('measured_on', parsed.measured_on)
    .maybeSingle();
  if (existingResult.error) {
    existingResult = await supabase
      .from('st_body_measurements')
      .select(measurementColumnsFor(existingResult.error.message))
      .eq('user_id', userId)
      .eq('measured_on', parsed.measured_on)
      .maybeSingle();
  }
  if (existingResult.error) throw existingResult.error;
  const existing = existingResult.data;

  const merged = mergeMeasurement(existing as BodyMeasurementRow | null, parsed);
  if (!hasAnyBodyMeasurement(merged)) {
    throw new Error('Enter at least one body measurement.');
  }

  const payload: Record<string, string | number | null> = {
    user_id: userId,
    measured_on: merged.measured_on,
    weight_lbs: merged.weight_lbs,
    waist_inches: merged.waist_inches,
    chest_inches: merged.chest_inches,
    arm_inches: merged.arm_inches,
    thigh_inches: merged.thigh_inches,
    hip_inches: merged.hip_inches,
    neck_inches: merged.neck_inches,
    body_fat_percent: merged.body_fat_percent,
    notes: merged.notes,
  };

  const dropped: string[] = [];
  let saved = await supabase.from('st_body_measurements').upsert(payload, { onConflict: 'user_id,measured_on' }).select(MEASUREMENT_COLUMNS).single();
  for (let attempt = 0; saved.error && attempt < 8; attempt += 1) {
    const message = String(saved.error.message || '');
    const missing = Object.keys(payload).filter((column) => column !== 'user_id' && column !== 'measured_on' && new RegExp(`\\b${column}\\b`, 'i').test(message));
    if (!missing.length) break;
    missing.forEach((column) => {
      dropped.push(column);
      delete payload[column];
    });
    saved = await supabase.from('st_body_measurements').upsert(payload, { onConflict: 'user_id,measured_on' }).select(measurementColumnsFor(message)).single();
  }
  if (saved.error) throw saved.error;
  if (dropped.some((column) => parsed[column as keyof typeof parsed] != null)) {
    throw new Error('Weight and waist were saved. Chest, arm, thigh, hip, neck, and body fat need the latest database update.');
  }
  return saved.data as BodyMeasurementRow;
}

export async function deleteBodyMeasurement(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('st_body_measurements').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
