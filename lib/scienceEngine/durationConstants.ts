export const BILATERAL_SET_SECONDS = 48;
export const UNILATERAL_SET_SECONDS = 78;
export const RAMP_SET_SECONDS = 32;
export const RAMP_REST_SECONDS = 45;
export const PREP_ITEM_SECONDS = 42;
export const PREP_TRANSITION_SECONDS = 12;
export const EXERCISE_TRANSITION_SECONDS = 40;
export const SESSION_OVERHEAD_SECONDS = 90;
export const COOLDOWN_ITEM_SECONDS = 50;
export const SUPERSET_SWAP_SECONDS = 18;
export const POWER_REST_SECONDS = 60;

export type WorkoutDurationBreakdown = {
  warmupSeconds: number;
  potentiationSeconds: number;
  rampSeconds: number;
  workingSeconds: number;
  cooldownSeconds: number;
  totalSeconds: number;
  minutes: number;
  rampCount: number;
};
