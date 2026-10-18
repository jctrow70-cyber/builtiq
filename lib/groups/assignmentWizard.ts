import { addDaysYmd } from '../training/programCalendar';
import { buildProgramExpectationDates, scheduleCycleWeeks } from '../training/unifiedSchedule';
import { isExplicitIndividualAssignment } from './trainingSources';
import {
  formatScheduledDays,
  isExplicitPersonalTraining,
  programScheduleNeedsReview,
  programScheduledDayLabels,
  type GroupTrainingProgramRef,
} from './trainingWorkspace';

/** User-facing names. Database assignment_type values stay the same. */
export const ASSIGNMENT_TYPE_LABELS: Record<string, string> = {
  team: 'Use Group Plan',
  personal: 'Use Personal Training',
  individual_team: 'Assign Different Plan',
  manual: 'Assign Different Plan',
};

export const WIZARD_STEPS = ['who', 'what', 'when', 'review'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];
export type WizardWhoMode = 'members' | 'all' | 'classification';
export type WizardWhatKind = 'program' | 'workout';

export type WizardMember = {
  userId: string;
  memberId?: string | null;
  name: string;
  status?: string | null;
  trainingSource?: string | null;
  isActiveParticipant?: boolean;
  assignmentType?: string | null;
  assignmentProgramId?: string | null;
  assignmentProgramName?: string | null;
  enrollmentProgramId?: string | null;
  enrollmentProgramName?: string | null;
};

export type WizardProgram = GroupTrainingProgramRef & {
  status?: string | null;
  teamId?: string | null;
};

export type AssignmentWizardResume = {
  teamId: string;
  step: WizardStep;
  whoMode: WizardWhoMode;
  memberUserIds: string[];
  classificationId: string | null;
  programId: string | null;
  programName: string | null;
  creation: 'ai' | 'manual' | null;
  whatKind: WizardWhatKind;
  setAsGroupPlan: boolean;
  scheduleChoice?: 'program' | 'custom';
  scheduleScope?: 'same' | 'individual';
  sameWeekdays?: string[];
  memberWeekdays?: Record<string, string[]>;
};

export type MemberPlanKind = 'personal' | 'fork' | 'individual' | 'group' | 'none';

export function assignmentTypeLabel(type: string | null | undefined): string {
  const key = String(type || '').toLowerCase();
  return ASSIGNMENT_TYPE_LABELS[key] || 'Use Group Plan';
}

export function memberPlanKind(member: WizardMember): MemberPlanKind {
  if (isExplicitPersonalTraining({ trainingSource: member.trainingSource }, { assignmentType: member.assignmentType })) {
    return 'personal';
  }
  if (isExplicitIndividualAssignment(member.assignmentType) && String(member.trainingSource || '').toLowerCase() === 'personal') {
    return 'fork';
  }
  if (isExplicitIndividualAssignment(member.assignmentType)) return 'individual';
  if (member.enrollmentProgramId || String(member.assignmentType || '').toLowerCase() === 'team') return 'group';
  return 'none';
}

/** The member's current program is the active group enrollment. Team default and assignment rows are not substitutes. */
export function memberPlanName(member: WizardMember, _defaultProgramName?: string | null): string | null {
  if (memberPlanKind(member) === 'personal') return 'Personal training';
  return member.enrollmentProgramName || null;
}

export function memberPlanLabel(member: WizardMember): string {
  if (memberPlanKind(member) === 'personal') return 'Personal training';
  if (member.enrollmentProgramName) return `Current plan · ${member.enrollmentProgramName}`;
  if (member.enrollmentProgramId) return 'Current plan';
  return 'No group plan';
}

export function isEligibleForGroupAssign(member: WizardMember): boolean {
  return (member.status || 'active') === 'active' && member.isActiveParticipant !== false && memberPlanKind(member) !== 'personal';
}

export function searchMembers(members: WizardMember[], query: string): WizardMember[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return members;
  return members.filter((member) => member.name.toLowerCase().includes(needle));
}

export function memberUserIdsForClassification(
  classificationId: string,
  members: WizardMember[],
  links: Record<string, string[]>
): string[] {
  if (!classificationId) return [];
  return members
    .filter((member) => {
      const ids = links[member.memberId || ''] || [];
      return ids.includes(classificationId) && (member.status || 'active') === 'active' && member.isActiveParticipant !== false;
    })
    .map((member) => member.userId);
}

export function resolveWizardMembers(input: {
  mode: WizardWhoMode;
  members: WizardMember[];
  selectedUserIds: string[];
  classificationId?: string | null;
  classificationLinks?: Record<string, string[]>;
}): WizardMember[] {
  const active = input.members.filter((member) => (member.status || 'active') === 'active');
  if (input.mode === 'all') return active.filter((member) => isEligibleForGroupAssign(member));
  if (input.mode === 'classification') {
    const ids = new Set(
      memberUserIdsForClassification(input.classificationId || '', input.members, input.classificationLinks || {})
    );
    return active.filter((member) => ids.has(member.userId));
  }
  const selected = new Set(input.selectedUserIds);
  return active.filter((member) => selected.has(member.userId));
}

export function programIsAssignable(program: WizardProgram | null | undefined, teamId: string): boolean {
  if (!program?.id || program.teamId && program.teamId !== teamId) return false;
  if (program.visibility && program.visibility !== 'team') return false;
  const status = String(program.status || 'published').toLowerCase();
  return status !== 'draft' && status !== 'archived';
}

export function searchPrograms(programs: WizardProgram[], query: string, teamId: string): WizardProgram[] {
  const needle = query.trim().toLowerCase();
  return programs
    .filter((program) => programIsAssignable(program, teamId))
    .filter((program) => !needle || (program.name || '').toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function previewProgramSchedule(program: WizardProgram, startsOn: string) {
  const weekdays = programScheduledDayLabels(program.workouts);
  const weeks = scheduleCycleWeeks({ weeks: program.weeks, cycle_length_weeks: program.cycleLengthWeeks });
  const dates = buildProgramExpectationDates({
    sourceKind: 'group',
    startsOn,
    programStart: program.startDate,
    cycleWeeks: weeks,
    workouts: (program.workouts || []).map((workout) => ({
      id: workout.id || `${program.id}-${workout.week}-${workout.dayLabel}`,
      week: Number(workout.week) || 1,
      dayLabel: workout.dayLabel || '',
      title: workout.title,
    })),
    effectiveOn: startsOn,
  });
  return {
    weekdays,
    weekdayLabel: formatScheduledDays(weekdays),
    weeks,
    durationLabel: weeks === 1 ? '1 week' : `${weeks} weeks`,
    firstWorkout: dates[0]?.scheduledDate || null,
    finalWorkout: dates.length ? dates[dates.length - 1].scheduledDate : null,
    dates,
    needsReview: programScheduleNeedsReview(program.workouts),
  };
}

export const INDIVIDUAL_SCHEDULE_NOTE =
  'Training days normally come from the program. Custom days change only when this member trains. The shared workouts stay the same.';

export type ScheduleChange =
  | { kind: 'immediate'; startsOn: string }
  | { kind: 'future_segment'; startsOn: string; currentProgramId: string | null }
  | { kind: 'already_on_program' };

/** A future start keeps the current program until that date. The selected date is the new floor. */
export function scheduleChangeForMember(input: {
  currentProgramId: string | null;
  nextProgramId: string;
  startsOn: string;
  today: string;
}): ScheduleChange {
  if (input.startsOn > input.today && input.currentProgramId && input.currentProgramId !== input.nextProgramId) {
    return { kind: 'future_segment', startsOn: input.startsOn, currentProgramId: input.currentProgramId };
  }
  if (input.startsOn > input.today && input.currentProgramId === input.nextProgramId) return { kind: 'already_on_program' };
  return { kind: 'immediate', startsOn: input.startsOn };
}

export function followsGroupDefault(member: WizardMember): boolean {
  if ((member.status || 'active') !== 'active' || member.isActiveParticipant === false) return false;
  const kind = memberPlanKind(member);
  return kind === 'group' || kind === 'none';
}

export type AssignmentReview = {
  mode: 'individual' | 'group_default' | 'workout';
  members: Array<{ userId: string; name: string; planName: string | null; kind: MemberPlanKind }>;
  replaced: Array<{ userId: string; name: string; planName: string }>;
  preserved: Array<{ userId: string; name: string; reason: string }>;
  conflicts: Array<{ userId: string; name: string; date: string; title: string }>;
  confirmationRequired: boolean;
  scheduleNote: string;
};

export function buildAssignmentReview(input: {
  mode: 'individual' | 'group_default' | 'workout';
  members: WizardMember[];
  program?: WizardProgram | null;
  startsOn?: string;
  today: string;
  defaultProgramName?: string | null;
  oneOffs?: Array<{ userId: string; scheduledDate: string; title: string }>;
  workoutDate?: string | null;
}): AssignmentReview {
  const preview = input.program && input.startsOn ? previewProgramSchedule(input.program, input.startsOn) : null;
  const scheduled = new Set((preview?.dates || []).map((row) => row.scheduledDate));
  const replaced: AssignmentReview['replaced'] = [];
  const preserved: AssignmentReview['preserved'] = [];
  const conflicts: AssignmentReview['conflicts'] = [];
  const listed = input.members.map((member) => ({
    userId: member.userId,
    name: member.name,
    planName: memberPlanName(member, input.defaultProgramName),
    kind: memberPlanKind(member),
  }));

  for (const member of input.members) {
    const kind = memberPlanKind(member);
    const planName = memberPlanName(member, input.defaultProgramName) || 'Group plan';
    if (input.mode === 'group_default') {
      if (kind === 'personal') preserved.push({ userId: member.userId, name: member.name, reason: 'Uses personal training' });
      else if (kind === 'fork') preserved.push({ userId: member.userId, name: member.name, reason: 'Customized group plan' });
      else if (kind === 'individual') preserved.push({ userId: member.userId, name: member.name, reason: 'Assigned a different plan' });
      else if (kind === 'group' && member.enrollmentProgramId && input.program && member.enrollmentProgramId !== input.program.id) {
        replaced.push({ userId: member.userId, name: member.name, planName });
      }
    } else if (kind === 'group' || kind === 'individual' || kind === 'fork') {
      replaced.push({ userId: member.userId, name: member.name, planName });
    } else if (kind === 'personal' && input.mode === 'individual') {
      preserved.push({ userId: member.userId, name: member.name, reason: 'Personal training enrollment stays in place' });
    }
    const dates = input.mode === 'workout' && input.workoutDate ? new Set([input.workoutDate]) : scheduled;
    for (const oneOff of input.oneOffs || []) {
      if (oneOff.userId === member.userId && dates.has(oneOff.scheduledDate)) {
        conflicts.push({ userId: member.userId, name: member.name, date: oneOff.scheduledDate, title: oneOff.title || 'Workout' });
      }
    }
  }

  const scheduleNote =
    input.mode === 'workout'
      ? 'This adds one workout. It does not replace the member’s group plan.'
      : input.startsOn && input.startsOn > input.today
        ? `The current group plan stays in place until ${input.startsOn}. Workouts before that date are not marked missed.`
        : 'Workouts before today stay in history. Nothing before the start date is marked missed.';

  return {
    mode: input.mode,
    members: listed,
    replaced,
    preserved,
    conflicts,
    confirmationRequired: replaced.length > 0 || (input.mode === 'individual' && listed.some((member) => member.kind === 'personal')),
    scheduleNote: preview?.needsReview ? `${scheduleNote} This program’s weeks do not share the same training days.` : scheduleNote,
  };
}

export function nextWizardStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index >= 0 && index < WIZARD_STEPS.length - 1 ? WIZARD_STEPS[index + 1] : null;
}

export function previousWizardStep(step: WizardStep): WizardStep | null {
  const index = WIZARD_STEPS.indexOf(step);
  return index > 0 ? WIZARD_STEPS[index - 1] : null;
}

export function wizardAdvanceError(input: {
  step: WizardStep;
  memberCount: number;
  whatKind: WizardWhatKind;
  programId: string | null;
  workoutId: string | null;
  startsOn: string;
  classificationId: string | null;
  whoMode: WizardWhoMode;
}): string | null {
  if (input.step === 'who') {
    if (input.whoMode === 'classification' && !input.classificationId) return 'Select a classification.';
    if (input.memberCount < 1) return 'Select at least one member.';
  }
  if (input.step === 'what') {
    if (input.whatKind === 'workout' && !input.workoutId) return 'Select a workout.';
    if (input.whatKind === 'program' && !input.programId) return 'Select a program.';
  }
  if (input.step === 'when' && !input.startsOn) return 'Select a start date.';
  return null;
}

export function resumeAfterProgramPublish(
  draft: AssignmentWizardResume,
  program: { id: string; name: string }
): AssignmentWizardResume {
  return {
    ...draft,
    programId: program.id,
    programName: program.name,
    step: 'when',
    whatKind: 'program',
  };
}

export function keepWizardDraftOnError<T>(draft: T): T {
  return draft;
}

export type SimExpectation = {
  userId: string;
  sourceKey: string;
  programId: string | null;
  scheduledDate: string;
  origin: 'program' | 'assignment';
};

export type SimDb = {
  actorCanAssign: boolean;
  defaultProgramId: string | null;
  members: Array<{ userId: string; active: boolean; participant: boolean; trainingSource: string }>;
  assignments: Array<{ userId: string; assignmentType: string; programId: string | null; active: boolean }>;
  enrollments: Array<{ userId: string; sourceKey: string; programId: string | null; startsOn: string | null }>;
  segments: Array<{ userId: string; sourceKey: string; programId: string; startsOn: string; endsOn: string | null }>;
  expectations: SimExpectation[];
  personalEnrollments: Array<{ userId: string; sourceKey: string; programId: string | null; startsOn: string | null }>;
  workouts: Array<{ id: string; userIds: string[]; scheduledDate: string }>;
  requests: Record<string, true>;
};

export type BulkCommitRequest = {
  actorCanAssign?: boolean;
  teamId: string;
  memberUserIds: string[];
  programId: string;
  programAllowed: boolean;
  startsOn: string;
  today: string;
  requestKey?: string | null;
  setAsGroupPlan?: boolean;
};

function groupKey(teamId: string): string {
  return `group:${teamId}`;
}

function memberState(db: SimDb, userId: string, teamId: string): WizardMember | null {
  const member = db.members.find((row) => row.userId === userId);
  if (!member) return null;
  const assignment = db.assignments.find((row) => row.userId === userId && row.active);
  const enrollment = db.enrollments.find((row) => row.userId === userId && row.sourceKey === groupKey(teamId));
  return {
    userId,
    name: userId,
    status: member.active ? 'active' : 'removed',
    trainingSource: member.trainingSource,
    isActiveParticipant: member.participant,
    assignmentType: assignment?.assignmentType,
    assignmentProgramId: assignment?.programId,
    enrollmentProgramId: enrollment?.programId,
  };
}

function applyOneProgram(db: SimDb, userId: string, request: BulkCommitRequest) {
  const key = groupKey(request.teamId);
  const enrollment = db.enrollments.find((row) => row.userId === userId && row.sourceKey === key);
  const currentProgramId = enrollment?.programId || null;
  const change = scheduleChangeForMember({
    currentProgramId,
    nextProgramId: request.programId,
    startsOn: request.startsOn,
    today: request.today,
  });
  db.assignments.forEach((row) => {
    if (row.userId === userId && row.active) row.active = false;
  });
  db.assignments.push({
    userId,
    assignmentType: 'individual_team',
    programId: request.programId,
    active: true,
  });
  const member = db.members.find((row) => row.userId === userId);
  if (member) member.trainingSource = 'team';
  if (!enrollment) {
    db.enrollments.push({
      userId,
      sourceKey: key,
      programId: request.programId,
      startsOn: request.startsOn,
    });
    db.segments.push({
      userId,
      sourceKey: key,
      programId: request.programId,
      startsOn: request.startsOn,
      endsOn: null,
    });
  } else if (change.kind === 'future_segment') {
    db.segments.forEach((segment) => {
      if (segment.userId === userId && segment.sourceKey === key && segment.endsOn == null && segment.startsOn < request.startsOn) {
        segment.endsOn = addDaysYmd(request.startsOn, -1);
      }
    });
    const open = db.segments.find((segment) => segment.userId === userId && segment.sourceKey === key && segment.endsOn == null);
    if (open) {
      open.programId = request.programId;
      open.startsOn = request.startsOn;
    } else {
      db.segments.push({
        userId,
        sourceKey: key,
        programId: request.programId,
        startsOn: request.startsOn,
        endsOn: null,
      });
    }
  } else if (change.kind === 'immediate') {
    enrollment.programId = request.programId;
    enrollment.startsOn = request.startsOn;
    db.segments = db.segments.filter(
      (segment) => !(segment.userId === userId && segment.sourceKey === key && segment.endsOn == null && segment.startsOn > request.today)
    );
    const open = db.segments.find((segment) => segment.userId === userId && segment.sourceKey === key && segment.endsOn == null);
    if (open && open.programId !== request.programId) open.endsOn = addDaysYmd(request.today, -1);
    if (!db.segments.some((segment) => segment.userId === userId && segment.sourceKey === key && segment.endsOn == null)) {
      db.segments.push({
        userId,
        sourceKey: key,
        programId: request.programId,
        startsOn: request.startsOn > request.today ? request.startsOn : request.today,
        endsOn: null,
      });
    }
  }
  const floor = change.kind === 'future_segment' ? request.startsOn : request.startsOn > request.today ? request.startsOn : request.today;
  db.expectations = db.expectations.filter((row) => {
    if (row.userId !== userId || row.sourceKey !== key || row.origin !== 'program') return true;
    if (row.scheduledDate < request.today) return true;
    if (change.kind === 'future_segment' && row.scheduledDate < request.startsOn) return true;
    return false;
  });
  if (change.kind !== 'already_on_program') {
    db.expectations.push({
      userId,
      sourceKey: key,
      programId: request.programId,
      scheduledDate: floor,
      origin: 'program',
    });
  }
}

export function commitBulkAssignment(
  db: SimDb,
  request: BulkCommitRequest
): { ok: true; db: SimDb; duplicate?: boolean } | { ok: false; db: SimDb; error: string } {
  const allowed = request.actorCanAssign ?? db.actorCanAssign;
  if (!allowed) return { ok: false, db, error: 'Not authorized' };
  if (!request.programAllowed) return { ok: false, db, error: 'Publish a group program before assigning it' };
  if (!request.memberUserIds.length) return { ok: false, db, error: 'Select at least one member' };
  const distinct = Array.from(new Set(request.memberUserIds));
  if (distinct.some((userId) => !db.members.some((member) => member.userId === userId && member.active))) {
    return { ok: false, db, error: 'Member not found' };
  }
  if (request.requestKey && db.requests[request.requestKey]) return { ok: true, db, duplicate: true };

  const next: SimDb = structuredClone(db);
  for (const userId of distinct) applyOneProgram(next, userId, request);
  if (request.setAsGroupPlan) {
    const fanout = commitGroupDefault(next, {
      actorCanAssign: true,
      teamId: request.teamId,
      programId: request.programId,
      programAllowed: true,
      today: request.today,
    });
    if (fanout.ok === false) return { ok: false, db, error: fanout.error };
    if (request.requestKey) fanout.db.requests[request.requestKey] = true;
    return { ok: true, db: fanout.db };
  }
  if (request.requestKey) next.requests[request.requestKey] = true;
  return { ok: true, db: next };
}

export function commitGroupDefault(
  db: SimDb,
  request: { actorCanAssign?: boolean; teamId: string; programId: string; programAllowed: boolean; today: string }
): { ok: true; db: SimDb } | { ok: false; db: SimDb; error: string } {
  const allowed = request.actorCanAssign ?? db.actorCanAssign;
  if (!allowed) return { ok: false, db, error: 'Not authorized' };
  if (!request.programAllowed) return { ok: false, db, error: 'Publish a group program before assigning it' };
  const next: SimDb = structuredClone(db);
  next.defaultProgramId = request.programId;
  const key = groupKey(request.teamId);
  for (const member of next.members) {
    const view = memberState(next, member.userId, request.teamId);
    if (!view || !followsGroupDefault(view)) continue;
    let enrollment = next.enrollments.find((row) => row.userId === member.userId && row.sourceKey === key);
    const previousProgramId = enrollment?.programId || null;
    if (!enrollment) {
      enrollment = { userId: member.userId, sourceKey: key, programId: request.programId, startsOn: request.today };
      next.enrollments.push(enrollment);
    } else if (enrollment.programId !== request.programId) {
      enrollment.programId = request.programId;
      enrollment.startsOn = request.today;
    }
    const changed = previousProgramId !== request.programId;
    next.expectations = next.expectations.filter(
      (row) =>
        !(
          row.userId === member.userId &&
          row.sourceKey === key &&
          row.origin === 'program' &&
          row.scheduledDate >= request.today &&
          row.programId !== request.programId
        )
    );
    if (changed) {
      next.expectations.push({
        userId: member.userId,
        sourceKey: key,
        programId: request.programId,
        scheduledDate: request.today,
        origin: 'program',
      });
    }
  }
  return { ok: true, db: next };
}

export function commitOneOff(
  db: SimDb,
  request: {
    actorCanAssign?: boolean;
    memberUserIds: string[];
    workoutId: string;
    scheduledDate: string;
    requestKey?: string | null;
    teamId: string;
  }
): { ok: true; db: SimDb; duplicate?: boolean } | { ok: false; db: SimDb; error: string } {
  const allowed = request.actorCanAssign ?? db.actorCanAssign;
  if (!allowed) return { ok: false, db, error: 'Not authorized' };
  if (!request.workoutId || !request.scheduledDate) return { ok: false, db, error: 'Select a workout and date' };
  const distinct = Array.from(new Set(request.memberUserIds));
  if (!distinct.length || distinct.some((userId) => !db.members.some((member) => member.userId === userId && member.active))) {
    return { ok: false, db, error: 'Member not found' };
  }
  if (request.requestKey && db.requests[request.requestKey]) return { ok: true, db, duplicate: true };
  const next: SimDb = structuredClone(db);
  next.workouts.push({ id: request.workoutId, userIds: distinct, scheduledDate: request.scheduledDate });
  for (const userId of distinct) {
    next.expectations.push({
      userId,
      sourceKey: groupKey(request.teamId),
      programId: null,
      scheduledDate: request.scheduledDate,
      origin: 'assignment',
    });
  }
  if (request.requestKey) next.requests[request.requestKey] = true;
  return { ok: true, db: next };
}

export function personalEnrollmentsUntouched(before: SimDb, after: SimDb): boolean {
  return JSON.stringify(before.personalEnrollments) === JSON.stringify(after.personalEnrollments);
}

export function historicalExpectationsRemain(before: SimDb, after: SimDb, today: string): boolean {
  const prior = before.expectations.filter((row) => row.scheduledDate < today);
  return prior.every((row) =>
    after.expectations.some(
      (next) =>
        next.userId === row.userId &&
        next.sourceKey === row.sourceKey &&
        next.scheduledDate === row.scheduledDate &&
        next.programId === row.programId
    )
  );
}
