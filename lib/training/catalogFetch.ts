import type { SupabaseClient } from '@supabase/supabase-js';
import { friendlyWriteError } from '../supabaseClient';

/** PostgREST default max rows per request — paginate to load full catalog. */
const CATALOG_PAGE_SIZE = 1000;

export async function fetchAllExerciseCatalog(supabase: SupabaseClient) {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    try {
      const { data, error } = await supabase
        .from('st_exercise_catalog')
        .select('*')
        .order('name')
        .range(from, from + CATALOG_PAGE_SIZE - 1);

      if (error) return { data: rows, error: friendlyWriteError(error) };

      const chunk = data || [];
      rows.push(...chunk);
      if (chunk.length < CATALOG_PAGE_SIZE) break;
      from += CATALOG_PAGE_SIZE;
    } catch (error) {
      return { data: rows, error: friendlyWriteError(error) };
    }
  }

  return { data: rows, error: null };
}

export async function insertUserCatalogExercise(
  supabase: SupabaseClient,
  input: { userId: string; name: string; category?: string | null; muscleGroup?: string | null; equipment?: string | null }
) {
  const name = input.name.trim();
  if (!name) return { data: null, error: { message: 'Enter exercise name.' } };
  const { data, error } = await supabase
    .from('st_exercise_catalog')
    .insert({
      user_id: input.userId,
      name,
      category: input.category || null,
      muscle_group: input.muscleGroup?.trim() || null,
      equipment: input.equipment?.trim() || null,
      is_system: false,
      is_archived: false,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error || { message: 'Could not create exercise' } };
  return { data, error: null };
}
