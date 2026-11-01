/**
 * BIQ-0285: shell program loads stay off Nutrition, Progress, and Settings,
 * and a newer program load cannot apply over an older one.
 * Run: npx tsx scripts/test-nav-program-load.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { navigationForecast } from '../lib/performance/navLoadPlan';
import {
  beginScreenTiming,
  completeScreenPhase,
  latestScreenTiming,
  noteProgramLoad,
  resetScreenTiming,
} from '../lib/performance/screenTiming';
import {
  createProgramLoadGate,
  groupAssignLoadForNav,
  shellProgramLoadForNav,
} from '../lib/training/programLoadGate';

const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const schedule = readFileSync(new URL('../lib/training/visibleSchedule.ts', import.meta.url), 'utf8');
const groupFacts = readFileSync(new URL('../lib/groups/loadGroupTrainingFacts.ts', import.meta.url), 'utf8');

assert.equal(shellProgramLoadForNav('Nutrition'), null);
assert.equal(shellProgramLoadForNav('Progress'), null);
assert.equal(shellProgramLoadForNav('Settings'), null);
assert.equal(shellProgramLoadForNav('AI Coach'), null);
assert.equal(shellProgramLoadForNav('Training'), 'training');
assert.equal(shellProgramLoadForNav('Dashboard'), 'training');
assert.equal(shellProgramLoadForNav('Programs'), 'training');
assert.equal(shellProgramLoadForNav('Groups'), 'setup');
assert.equal(groupAssignLoadForNav('Nutrition'), false);
assert.equal(groupAssignLoadForNav('Groups'), true);

assert.equal(page.includes("shellProgramLoadForNav(appNav)"), true);
assert.equal(page.includes('createProgramLoadGate'), true);
assert.equal(page.includes('syncMemberGroupEnrollment'), true);
assert.equal(page.includes('checkHistoryRestoreOffer'), true);
assert.equal(page.includes("if(!draftEditProgramId&&appNav==='Training') void loadPrograms('training')"), true);
assert.equal(page.includes("if(profile&&!activeAssignedRecipient) loadPrograms(appNav==='Groups'?'setup':'training')"), false);
assert.equal(page.includes("await loadPrograms(appNav==='Groups'?'setup':'training')"), true);
assert.equal(schedule.includes('repairFollowedTrainingSchedule'), true);
assert.equal(groupFacts.includes('st_apply_group_due_segments'), true);

const member = { phase: 'legacy' as const, from: 'Dashboard', groupMember: true, manager: true };
for (const to of ['Nutrition', 'Progress', 'Settings']) {
  const before = navigationForecast({ ...member, to });
  const after = navigationForecast({ ...member, phase: 'a', to });
  assert.equal(before.trainingLoads, 1, to);
  assert.equal(after.trainingLoads, 0, to);
  assert.equal(after.setupLoads, 0, to);
  assert.equal(after.enrollmentSyncs, 0, to);
  assert.ok(after.networkIdleSteps < before.networkIdleSteps, to);
  assert.ok(after.requests < before.requests, to);
}

const trainingBefore = navigationForecast({ ...member, to: 'Training' });
const trainingAfter = navigationForecast({ ...member, phase: 'a', to: 'Training' });
assert.equal(trainingBefore.trainingLoads, 2);
assert.equal(trainingAfter.trainingLoads, 1);
assert.equal(trainingAfter.enrollmentSyncs, 1);
assert.equal(trainingAfter.historyRestoreChecks, 1);
assert.equal(trainingAfter.scheduleRepairs, 1);
assert.equal(trainingBefore.scheduleRepairs, 1);
assert.ok(trainingAfter.requests < trainingBefore.requests);
assert.equal(trainingAfter.managerProgramLists, 0);
assert.equal(trainingBefore.managerProgramLists, 1);

const dashboardAfter = navigationForecast({ ...member, phase: 'a', to: 'Dashboard', from: 'Training' });
assert.equal(dashboardAfter.trainingLoads, 1);
assert.equal(dashboardAfter.enrollmentSyncs, 1);
assert.equal(dashboardAfter.scheduleRepairs, 1);
assert.equal(dashboardAfter.managerProgramLists, 0);

const groupsAfter = navigationForecast({ ...member, phase: 'a', to: 'Groups' });
const groupsBefore = navigationForecast({ ...member, to: 'Groups' });
assert.equal(groupsAfter.setupLoads, 1);
assert.equal(groupsAfter.trainingLoads, 0);
assert.equal(groupsAfter.groupDueSegmentWrites, 1);
assert.equal(groupsBefore.groupDueSegmentWrites, 1);
assert.equal(groupsAfter.managerProgramLists, 1);
assert.equal(groupsBefore.setupLoads, 2);
assert.equal(navigationForecast({ phase: 'a', to: 'Programs', from: 'Dashboard', groupMember: true, manager: false }).trainingLoads, 1);

const fromGroups = navigationForecast({ phase: 'legacy', to: 'Training', from: 'Groups', groupMember: true, manager: false });
assert.equal(fromGroups.trainingLoads, 1);
assert.equal(fromGroups.setupLoads, 1);
assert.equal(
  navigationForecast({ phase: 'a', to: 'Training', from: 'Groups', groupMember: true, manager: false }).setupLoads,
  0
);

async function assertGate() {
  const gate = createProgramLoadGate();
  let runs = 0;
  let applied = 0;
  const first = gate.begin('same', async (gen) => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (gate.isCurrent(gen)) applied += 1;
  });
  const joined = gate.begin('same', async () => {
    runs += 1;
  });
  await Promise.all([first, joined]);
  assert.equal(runs, 1);
  assert.equal(applied, 1);

  applied = 0;
  const older = gate.begin('old', async (gen) => {
    await new Promise((resolve) => setTimeout(resolve, 30));
    if (gate.isCurrent(gen)) applied += 1;
  });
  const newer = gate.begin('new', async (gen) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (gate.isCurrent(gen)) applied += 1;
  });
  await Promise.all([older, newer]);
  assert.equal(applied, 1);
}

void assertGate()
  .then(() => {
    resetScreenTiming();
    beginScreenTiming('Nutrition');
    noteProgramLoad();
    completeScreenPhase('Nutrition', 'data');
    const nutrition = latestScreenTiming('Nutrition');
    assert.ok(nutrition?.durationMs != null && nutrition.durationMs >= 0);
    assert.equal(nutrition?.programLoads, 1);
    assert.equal(nutrition?.phases.data != null, true);
    console.log('nav program load gate ok');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
