import type { PotentiationPref, PrimaryGoal, TrainingProfile } from './types';

export type PrimerPolicyInput = {
  primaryGoal?: string | null;
  potentiationPreference?: string | null;
  trainingFeel?: string[] | null;
};

export type PrimerMode = 'off' | 'optional' | 'athletic';

function asGoal(raw?: string | null): string {
  return String(raw || '').toLowerCase().trim();
}

function asFeel(raw?: string[] | null): string[] {
  return (raw || []).map((item) => String(item || '').toLowerCase());
}

/** Athletic or power-focused work may use a short primer. Hypertrophy does not need one. */
export function resolvePrimerMode(input: PrimerPolicyInput): PrimerMode {
  const feel = asFeel(input.trainingFeel);
  const preference = String(input.potentiationPreference || '').toLowerCase() as PotentiationPref | '';
  if (preference === 'off' || feel.includes('low_impact')) return 'off';
  if (preference === 'athletic' || feel.includes('athletic')) return 'athletic';
  const goal = asGoal(input.primaryGoal);
  if (goal === 'athletic_performance') return 'athletic';
  return 'optional';
}

export function shouldGeneratePowerPrimer(input: PrimerPolicyInput): boolean {
  return resolvePrimerMode(input) === 'athletic';
}

/** Missing primers are never an error. Athletic sessions may note the omission. */
export function missingPrimerSeverity(input: PrimerPolicyInput): 'none' | 'warning' {
  return resolvePrimerMode(input) === 'athletic' ? 'warning' : 'none';
}

export function primerPolicyFromProfile(profile: Pick<TrainingProfile, 'primaryGoal' | 'potentiationPreference' | 'trainingFeel'>): PrimerPolicyInput {
  return {
    primaryGoal: profile.primaryGoal as PrimaryGoal,
    potentiationPreference: profile.potentiationPreference,
    trainingFeel: profile.trainingFeel,
  };
}
