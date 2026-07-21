import type { SupabaseClient } from '@supabase/supabase-js';

/** PostgREST default max rows per request — paginate to load full catalog. */
const CATALOG_PAGE_SIZE = 1000;

export async function fetchAllExerciseCatalog(supabase: SupabaseClient) {
  const rows: any[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('st_exercise_catalog')
      .select('*')
      .order('name')
      .range(from, from + CATALOG_PAGE_SIZE - 1);

    if (error) return { data: rows, error: error.message };

    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < CATALOG_PAGE_SIZE) break;
    from += CATALOG_PAGE_SIZE;
  }

  return { data: rows, error: null };
}
