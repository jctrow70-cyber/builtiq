export * from './types';
export { resolveLoadIncrement, roundLoadToIncrement } from './increments';
export { progressionConfidence, reportedRirOrUnknown } from './confidence';
export { weekStatusForNewWorkout, backfillWeekStatus, isHistoricalWeekLocked } from './weekStatus';
export { evaluateProgressionDecision, adaptationDraftFromDecision } from './decision';
export {
  REASON,
  RIR_TOLERANCE,
  RIR_TOLERANCE_LOW,
  RIR_TOLERANCE_HIGH,
  classifyRir,
  COMPARABLE_LOOKBACK_DAYS,
  COMPARABLE_MAX_EXPOSURES,
} from './reasonCodes';
export type { ProgressionDecisionResult } from './decision';
export type { EvaluateProgressionInput, ExerciseExposureInput, LoggedSetInput } from './inputs';
export { applyProgressionDecision, selectNextEligibleExposure, explainAdaptation, APPLY_ENGINE_VERSION } from './apply';
