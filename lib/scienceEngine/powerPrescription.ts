export type PowerFamily = 'explosive_jump' | 'throw' | 'ballistic_swing' | 'olympic' | 'general_power';

export type PowerRx = {
  family: PowerFamily;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number | null;
  restSeconds: number;
  effortCue: string;
};

export type PowerExerciseMeta = {
  name?: string;
  movementPattern?: string;
  movement_pattern?: string;
};

export function classifyPowerExercise(ex: PowerExerciseMeta): PowerFamily {
  const name = String(ex.name || '').toLowerCase();
  const pattern = String(ex.movementPattern || ex.movement_pattern || '').toLowerCase();
  if (/swing/.test(name)) return 'ballistic_swing';
  if (/(?:hang |power )?snatch|(?:hang |power )?clean|jerk/.test(name) && !/jump/.test(name)) return 'olympic';
  if (pattern === 'throw' || /throw|med(?:icine)?[-\s]?ball|chest pass|slam/.test(name)) return 'throw';
  if (pattern === 'jump' || /jump|bound|hop|plyo/.test(name)) return 'explosive_jump';
  return 'general_power';
}

export function powerPrescriptionFor(
  family: PowerFamily,
  opts?: { experienceLevel?: string; conservative?: boolean }
): PowerRx {
  const beginner = String(opts?.experienceLevel || '').toLowerCase() === 'beginner';
  const conservative = !!opts?.conservative || beginner;
  if (family === 'explosive_jump') {
    return {
      family,
      sets: conservative ? 2 : 3,
      repMin: 3,
      repMax: beginner ? 4 : 5,
      targetRir: null,
      restSeconds: 75,
      effortCue: 'Crisp, explosive reps. Stop the set when height or speed drops.',
    };
  }
  if (family === 'throw') {
    return {
      family,
      sets: conservative ? 2 : 3,
      repMin: 3,
      repMax: 5,
      targetRir: null,
      restSeconds: 60,
      effortCue: 'Explosive throws. Reset each rep.',
    };
  }
  if (family === 'ballistic_swing') {
    return {
      family,
      sets: conservative ? 2 : 3,
      repMin: 5,
      repMax: beginner ? 8 : 10,
      targetRir: null,
      restSeconds: 60,
      effortCue: 'Ballistic hip snap. Keep the set short enough that speed stays high.',
    };
  }
  if (family === 'olympic') {
    return {
      family,
      sets: 2,
      repMin: 1,
      repMax: 3,
      targetRir: null,
      restSeconds: 90,
      effortCue: 'Technical, explosive singles or triples.',
    };
  }
  return {
    family,
    sets: 2,
    repMin: 3,
    repMax: 6,
    targetRir: null,
    restSeconds: 60,
    effortCue: 'Explosive quality over fatigue.',
  };
}

export function parsePrepPrescription(raw?: string): { sets?: number; min?: number; max?: number } {
  const text = String(raw || '').trim();
  if (!text) return {};
  const withSets = text.match(/(\d+)\s*[x×]\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
  if (withSets) {
    const min = Number(withSets[2]);
    const max = withSets[3] ? Number(withSets[3]) : min;
    return { sets: Number(withSets[1]), min, max };
  }
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };
  const single = text.match(/(\d+)/);
  if (single) return { min: Number(single[1]), max: Number(single[1]) };
  return {};
}

export function isHypertrophyStylePowerRx(
  family: PowerFamily,
  sets: number | undefined,
  min?: number,
  max?: number
): boolean {
  const hi = max ?? min ?? 0;
  const lo = min ?? max ?? 0;
  if (!hi && !lo) return false;
  if (family === 'explosive_jump' || family === 'throw') return hi > 6 || lo >= 8;
  if (family === 'ballistic_swing') return hi > 12 || lo >= 12;
  if (family === 'olympic') return hi > 5;
  return hi >= 12 || (sets != null && sets >= 3 && lo >= 8);
}

export function formatPowerPrescription(rx: PowerRx): string {
  return rx.repMin === rx.repMax ? String(rx.repMin) : `${rx.repMin}-${rx.repMax}`;
}

export function clampPowerSets(requested: number | undefined, rx: PowerRx): number {
  const n = Number(requested);
  if (!Number.isFinite(n) || n < 1) return rx.sets;
  return Math.max(2, Math.min(3, Math.round(n)));
}
