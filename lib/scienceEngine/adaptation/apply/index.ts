export { applyProgressionDecision } from './applyDecision';
export { selectNextEligibleExposure, isEligibleComparableTarget } from './nextExposure';
export { prescriptionFingerprint, applicationKey, workingSetsOf, isWorkingPlannedSet } from './fingerprint';
export { explainAdaptation } from './explain';
export { APPLY_ENGINE_VERSION, AUTOMATIC_DECISIONS, NON_AUTOMATIC_DECISIONS, ELIGIBLE_WEEK_STATUSES, BLOCKED_WEEK_STATUSES } from './types';
export type {
  AdaptationApplicationResult,
  ApplicationStatus,
  ApplyAbortReason,
  ApplyProgressionInput,
  CandidateExposure,
  LedgerEventRecord,
  PlannedSetTarget,
  SourceExposureRef,
} from './types';
