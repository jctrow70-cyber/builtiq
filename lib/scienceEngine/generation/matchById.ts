import type { CatalogExercise } from '../types';
import type { DesignerExercise } from './types';

/** Exact ID lookup only. Never match by substring name. */
export function findByExerciseId(
  catalogById: Map<string, CatalogExercise>,
  exerciseId: string | null | undefined
): CatalogExercise | null {
  const id = String(exerciseId || '').trim();
  if (!id) return null;
  return catalogById.get(id) || null;
}

export function findDesignerById(
  library: Map<string, DesignerExercise>,
  exerciseId: string | null | undefined
): DesignerExercise | null {
  const id = String(exerciseId || '').trim();
  if (!id) return null;
  return library.get(id) || null;
}
