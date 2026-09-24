import { lateralityOf, measurementTypeOf } from '../scienceEngine/generation/library';
import type { Laterality, MeasurementType } from '../scienceEngine/generation/types';
import type { ProgramRole } from '../scienceEngine/types';
import { catalogExerciseFromRow } from '../scienceEngine/catalogAdapter';

const ROLES: ProgramRole[] = ['primary', 'secondary', 'accessory', 'isolation', 'warmup', 'power', 'conditioning'];
const LATERALITY: Laterality[] = ['bilateral', 'unilateral', 'alternating'];
const MEASUREMENTS: MeasurementType[] = ['reps', 'time', 'distance'];

export type PrescriptionMeta = {
  program_role: ProgramRole | null;
  measurement_type: MeasurementType | null;
  laterality: Laterality | null;
};

export function normalizeProgramRole(value: unknown, fallback?: ProgramRole | null): ProgramRole | null {
  const raw = String(value || '').trim().toLowerCase();
  if (ROLES.includes(raw as ProgramRole)) return raw as ProgramRole;
  return fallback || null;
}

export function normalizeLaterality(value: unknown): Laterality | null {
  const raw = String(value || '').trim().toLowerCase();
  return LATERALITY.includes(raw as Laterality) ? (raw as Laterality) : null;
}

export function normalizeMeasurementType(value: unknown): MeasurementType | null {
  const raw = String(value || '').trim().toLowerCase();
  return MEASUREMENTS.includes(raw as MeasurementType) ? (raw as MeasurementType) : null;
}

export function roleFromSection(section?: string, notes?: string): ProgramRole {
  if (/power primer/i.test(String(notes || ''))) return 'power';
  const s = String(section || 'strength');
  if (s === 'warmup') return 'warmup';
  if (s === 'cooldown') return 'accessory';
  return 'accessory';
}

export function prescriptionMetaFromCatalog(
  catalogItem: any,
  opts?: { role?: unknown; section?: string; notes?: string }
): PrescriptionMeta {
  const adapted = catalogItem ? catalogExerciseFromRow(catalogItem) : null;
  const role =
    normalizeProgramRole(opts?.role) ||
    roleFromSection(opts?.section, opts?.notes || catalogItem?.notes);
  if (!adapted) {
    return {
      program_role: role,
      measurement_type: normalizeMeasurementType(catalogItem?.coaching_metadata?.measurement_type) || 'reps',
      laterality: normalizeLaterality(catalogItem?.coaching_metadata?.laterality) || 'bilateral',
    };
  }
  return {
    program_role: role,
    measurement_type: measurementTypeOf(adapted),
    laterality: lateralityOf(adapted),
  };
}

export function prescriptionColumnsFromSources(opts: {
  item?: { program_role?: unknown; measurement_type?: unknown; laterality?: unknown; notes?: string };
  catalogItem?: any;
  section?: string;
  role?: unknown;
}): PrescriptionMeta {
  const fromItem = {
    program_role: normalizeProgramRole(opts.item?.program_role || opts.role),
    measurement_type: normalizeMeasurementType(opts.item?.measurement_type),
    laterality: normalizeLaterality(opts.item?.laterality),
  };
  const inferred = prescriptionMetaFromCatalog(opts.catalogItem, {
    role: fromItem.program_role,
    section: opts.section,
    notes: opts.item?.notes,
  });
  return {
    program_role: fromItem.program_role || inferred.program_role,
    measurement_type: fromItem.measurement_type || inferred.measurement_type,
    laterality: fromItem.laterality || inferred.laterality,
  };
}
