import { supabase } from '../supabaseClient';
import {
  draftToCanonical,
  mergeMeasurement,
  type BodyMeasurementDraft,
  type BodyMeasurementRow,
  type UnitsPreference,
} from './measurements';

const DEFAULT_LIMIT = 60;

export async function fetchBodyMeasurements(userId: string, limit = DEFAULT_LIMIT): Promise<BodyMeasurementRow[]> {
  const { data, error } = await supabase
    .from('st_body_measurements')
    .select('id,user_id,measured_on,weight_lbs,waist_inches,notes,created_at,updated_at')
    .eq('user_id', userId)
    .order('measured_on', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as BodyMeasurementRow[];
}

export async function saveBodyMeasurement(
  userId: string,
  draft: BodyMeasurementDraft,
  units: UnitsPreference
): Promise<BodyMeasurementRow> {
  const parsed = draftToCanonical(draft, units);
  if (!parsed) throw new Error('Enter a weight and/or waist measurement.');

  const { data: existing, error: existingError } = await supabase
    .from('st_body_measurements')
    .select('id,user_id,measured_on,weight_lbs,waist_inches,notes')
    .eq('user_id', userId)
    .eq('measured_on', parsed.measured_on)
    .maybeSingle();
  if (existingError) throw existingError;

  const merged = mergeMeasurement(existing as BodyMeasurementRow | null, parsed);
  if (merged.weight_lbs == null && merged.waist_inches == null) {
    throw new Error('Enter a weight and/or waist measurement.');
  }

  const payload = {
    user_id: userId,
    measured_on: merged.measured_on,
    weight_lbs: merged.weight_lbs,
    waist_inches: merged.waist_inches,
    notes: merged.notes,
  };

  const { data, error } = await supabase
    .from('st_body_measurements')
    .upsert(payload, { onConflict: 'user_id,measured_on' })
    .select('id,user_id,measured_on,weight_lbs,waist_inches,notes,created_at,updated_at')
    .single();
  if (error) throw error;
  return data as BodyMeasurementRow;
}

export async function deleteBodyMeasurement(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('st_body_measurements').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}
