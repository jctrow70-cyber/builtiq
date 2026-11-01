import { shellProgramLoadForNav } from '../training/programLoadGate';

export type NavLoadPhase = 'legacy' | 'a';

export type NavLoadInput = {
  phase: NavLoadPhase;
  to: string;
  from: string;
  groupMember: boolean;
  manager: boolean;
};

export type NavLoadForecast = {
  trainingLoads: number;
  setupLoads: number;
  enrollmentSyncs: number;
  historyRestoreChecks: number;
  scheduleRepairs: number;
  groupDueSegmentWrites: number;
  managerProgramLists: number;
  screenRequests: number;
  requests: number;
  /** Sequential round trips on the longest chain, with overlapped duplicates counted once. */
  networkIdleSteps: number;
};

/** Group-member training load: enroll reads/writes, then index, full tree, activities, calendar. */
export function trainingChainSteps(groupMember: boolean) {
  return (groupMember ? 5 : 0) + 4;
}

/** Linked logs and date logs share a step, then session, feedback, exercise sessions, and lift history. */
export const LOG_CHAIN_STEPS = 5;

/** Visible-schedule repair, then enrollments, names, expectations, and sessions. */
export const SCHEDULE_CHAIN_STEPS = 6;

function screenIdleSteps(to: string) {
  if (to === 'Nutrition') return 2;
  if (to === 'Progress') return 1;
  if (to === 'Settings') return 1;
  return 0;
}

function screenRequests(to: string) {
  if (to === 'Nutrition') return 4;
  if (to === 'Progress') return 7;
  if (to === 'Settings') return 1;
  return 0;
}

function legacyProgramLoads(input: NavLoadInput) {
  const staying = input.from === input.to;
  let training = 0;
  let setup = 0;
  if (!staying) {
    if (input.to === 'Groups') setup += 1;
    else training += 1;
  }
  if (input.to === 'Training') {
    if (input.from === 'Groups' && !staying) setup += 1;
    else training += 1;
  }
  if (input.to === 'Groups') setup += 1;
  return { training, setup };
}

function managerLists(input: NavLoadInput) {
  if (!input.manager) return 0;
  if (input.phase === 'a') return input.to === 'Groups' ? 1 : 0;
  if (input.from === input.to) return input.to === 'Groups' ? 1 : 0;
  return input.to === 'Groups' ? 2 : 1;
}

function phaseAProgramLoads(input: NavLoadInput) {
  const kind = shellProgramLoadForNav(input.to);
  if (!kind) return { training: 0, setup: 0 };
  if (kind === 'setup') return { training: 0, setup: 1 };
  return { training: 1, setup: 0 };
}

export function navigationForecast(input: NavLoadInput): NavLoadForecast {
  const loads = input.phase === 'legacy' ? legacyProgramLoads(input) : phaseAProgramLoads(input);
  const trainingLoads = loads.training;
  const setupLoads = loads.setup;
  const programLoads = trainingLoads + setupLoads;
  const enrollmentSyncs = input.groupMember ? trainingLoads : 0;
  const historyRestoreChecks = trainingLoads;
  const scheduleRepairs = input.to === 'Training' || input.to === 'Dashboard' ? 1 : 0;
  const groupDueSegmentWrites = input.to === 'Groups' ? 1 : 0;
  const managerProgramLists = managerLists(input);
  const ownRequests = screenRequests(input.to);
  const programRequests = trainingLoads * (input.groupMember ? 9 : 4) + setupLoads * 2 + historyRestoreChecks;
  const logRequests = programLoads * 6;
  const scheduleRequests = scheduleRepairs * SCHEDULE_CHAIN_STEPS;
  const requests = ownRequests + programRequests + logRequests + scheduleRequests + managerProgramLists + groupDueSegmentWrites;
  const backgroundIdle =
    (trainingLoads > 0 ? trainingChainSteps(input.groupMember) : setupLoads > 0 ? 2 : 0) +
    (programLoads > 0 ? LOG_CHAIN_STEPS : 0);
  const networkIdleSteps = Math.max(backgroundIdle, screenIdleSteps(input.to), scheduleRepairs > 0 ? SCHEDULE_CHAIN_STEPS : 0);
  return {
    trainingLoads,
    setupLoads,
    enrollmentSyncs,
    historyRestoreChecks,
    scheduleRepairs,
    groupDueSegmentWrites,
    managerProgramLists,
    screenRequests: ownRequests,
    requests,
    networkIdleSteps,
  };
}

export async function measureIdle(steps: number, rttMs: number) {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  for (let i = 0; i < steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, rttMs));
  }
  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return Math.round(end - start);
}
