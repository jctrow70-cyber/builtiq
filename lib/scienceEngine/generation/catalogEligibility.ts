/**
 * AI program generation may use only the canonical BuiltIQ master library.
 * User-custom rows stay in the general catalog for manual/history/logging.
 */
import { MASTER_CATALOG_SOURCE } from '../../training/masterCatalog';
import { adaptCatalog } from '../catalogAdapter';
import type { CatalogExercise } from '../types';

export { MASTER_CATALOG_SOURCE };

function dbRecord(row: any): any {
  if (!row) return null;
  if (row.raw && typeof row.raw === 'object' && (row.raw.id || row.raw.external_source !== undefined || row.raw.user_id || row.raw.is_system !== undefined)) {
    return row.raw;
  }
  return row;
}

function looksLikeCatalogRecord(row: any): boolean {
  const rec = dbRecord(row);
  if (!rec || typeof rec !== 'object') return false;
  return (
    'external_source' in rec ||
    'external_id' in rec ||
    'user_id' in rec ||
    'is_system' in rec ||
    'is_archived' in rec
  );
}

/** Application-level ownership gate. Service-role fetches still go through this. */
export function isAiGenerationEligibleRow(row: any): boolean {
  if (!row) return false;
  const rec = dbRecord(row) || row;
  if (rec.is_archived === true || row.is_archived === true) return false;
  if (rec.user_id || row.user_id) return false;
  if (rec.is_system === false || row.is_system === false) return false;
  if (looksLikeCatalogRecord(row)) {
    return String(rec.external_source || '') === MASTER_CATALOG_SOURCE;
  }
  return true;
}

export function selectAiGenerationCatalogRows<T>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter((row) => isAiGenerationEligibleRow(row));
}

export function adaptGenerationCatalog(
  rows: any[] | null | undefined,
  opts?: { allowFallback?: boolean }
): CatalogExercise[] {
  const eligible = selectAiGenerationCatalogRows(rows);
  const allowFallback = opts?.allowFallback === false ? false : eligible.length < 12;
  return adaptCatalog(eligible, { allowFallback });
}
