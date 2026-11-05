import { deleteScreenCache } from '../performance/screenSession';
import { isTransientNetworkError } from '../networkErrors';
import { addDaysYmd, formatDisplayDate } from '../training/programCalendar';
import { normalizeServingUnit } from './servingUnits';

export type CopyMealFood = {
  food_name: string;
  food_library_id?: string | null;
  food_catalog_id?: string | null;
  serving_qty: number;
  serving_size?: number | null;
  serving_unit?: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes?: string | null;
  meal_type?: string | null;
};

export type MealCopyInsertRow = {
  user_id: string;
  log_date: string;
  meal_type: string;
  food_name: string;
  food_library_id: string | null;
  food_catalog_id: string | null;
  serving_qty: number;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  notes: string | null;
};

export type CopyLock = { current: boolean };

/** Move a calendar date by whole days. Uses the local calendar, not UTC. */
export function shiftLogDate(logDate: string, days: number) {
  return addDaysYmd(logDate, days);
}

export function yesterdayLogDate(logDate: string) {
  return addDaysYmd(logDate, -1);
}

/**
 * Rows for one copy request.
 * A target meal sends the whole selection there. Copy Yesterday leaves each food's meal.
 */
export function copyMealInsertRows(
  userId: string,
  entries: CopyMealFood[],
  targetDate: string,
  targetMeal?: string
): MealCopyInsertRow[] {
  return entries.map((entry) => ({
    user_id: userId,
    log_date: targetDate,
    meal_type: targetMeal || entry.meal_type || 'snack',
    food_name: entry.food_name,
    food_library_id: entry.food_library_id || null,
    food_catalog_id: entry.food_catalog_id || null,
    serving_qty: entry.serving_qty,
    serving_size: entry.serving_size ?? 1,
    serving_unit: normalizeServingUnit(entry.serving_unit),
    calories: entry.calories,
    protein_g: entry.protein_g,
    carbs_g: entry.carbs_g,
    fat_g: entry.fat_g,
    notes: entry.notes || null,
  }));
}

/** First caller starts the request. A second caller while it is running is ignored. */
export function beginCopySubmit(lock: CopyLock): 'started' | 'ignored' {
  if (lock.current) return 'ignored';
  lock.current = true;
  return 'started';
}

export function endCopySubmit(lock: CopyLock) {
  lock.current = false;
}

export type CopyFailureKind = 'uncertain' | 'failed';

/** A dropped connection may already have saved. Other errors did not. */
export function copyFailureKind(error: unknown): CopyFailureKind {
  return isTransientNetworkError(error) ? 'uncertain' : 'failed';
}

/** An insert response that does not echo every requested row is unresolved. */
export function copyInsertOutcome(requestedCount: number, insertedCount: number): 'saved' | 'uncertain' {
  if (requestedCount > 0 && insertedCount === requestedCount) return 'saved';
  return 'uncertain';
}

export function copySavedMessage(count: number, logDate: string) {
  const noun = count === 1 ? 'food' : 'foods';
  return `Copied ${count} ${noun} to ${formatDisplayDate(logDate)}.`;
}

export function copyUncertainMessage(logDate: string) {
  const date = formatDisplayDate(logDate);
  return `The connection dropped before this copy could be confirmed. Look at ${date}. Foods already listed there were saved.`;
}

export function copyFailedMessage(kind: 'meal' | 'yesterday') {
  return kind === 'yesterday' ? 'Could not copy yesterday.' : 'Could not copy food.';
}

export function copyErrorText(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message || '').trim();
    if (message) return message;
  }
  return fallback;
}

export function invalidateNutritionDayCache(userId: string, logDate: string) {
  deleteScreenCache(userId, 'nutrition', logDate);
}

/** Keep foods already on the day and append only new ids. */
export function mergeCopiedEntries<T extends { id: string }>(existing: T[], inserted: T[]): T[] {
  const seen = new Set(existing.map((row) => row.id));
  const added: T[] = [];
  for (const row of inserted) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    added.push(row);
  }
  return [...existing, ...added];
}

export function sameEntryIds(left: Array<{ id: string }>, right: Array<{ id: string }>) {
  if (left.length !== right.length) return false;
  return left.every((row, index) => row.id === right[index]?.id);
}
