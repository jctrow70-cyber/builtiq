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

  const payload = {
    user_id: userId,
    measured_on: merged.measured_on,
    weight_lbs: merged.weight_lbs,
    waist_inches: merged.waist_inches,
    notes: merged.notes,
  };

  let saved = await supabase
    .from('st_body_measurements')
    .upsert(payload, { onConflict: 'user_id,measured_on' })
    .select(MEASUREMENT_COLUMNS)
    .single();
  if (saved.error) {
    saved = await supabase
      .from('st_body_measurements')
      .upsert(payload, { onConflict: 'user_id,measured_on' })
      .select(measurementColumnsFor(saved.error.message))
      .single();
  }
  if (saved.error) throw saved.error;
  return saved.data as BodyMeasurementRow;
}

export async function deleteBodyMeasurement(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('st_body_measurements').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
