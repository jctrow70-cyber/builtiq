/**
 * Display and import gate for third-party exercise content.
 * First-party and user-owned text stay. Blocked media is hidden wherever the URL points.
 */

export const EXERCISE_DB_IMPORT_BLOCKED =
  'ExerciseDB import is disabled until commercial rights are verified. Existing catalog rows were not changed.';

const BLOCKED_MEDIA_MARKERS = ['exercisedb.dev', 'free-exercise-db', 'yuhonas/free-exercise-db'];

export function isBlockedExerciseMediaUrl(raw?: string | null): boolean {
  const url = String(raw || '').trim();
  if (!url) return false;
  const lower = url.toLowerCase();
  if (BLOCKED_MEDIA_MARKERS.some((marker) => lower.includes(marker))) return true;
  // Older Free Exercise DB imports stored relative paths such as Bench_Press/0.jpg.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith('/') && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) {
    return true;
  }
  return false;
}

export function isExerciseDbCatalogItem(
  item?: { external_source?: string | null; user_id?: string | null } | null
): boolean {
  if (!item || item.user_id) return false;
  return String(item.external_source || '').trim().toLowerCase() === 'exercisedb';
}

/** ExerciseDB instruction text stays in the database and is omitted from the product UI. */
export function instructionsForDisplay(
  item?: { external_source?: string | null; user_id?: string | null; instructions?: string | null } | null
): string | null {
  if (!item || isExerciseDbCatalogItem(item)) return null;
  const text = String(item.instructions || '').trim();
  return text || null;
}
