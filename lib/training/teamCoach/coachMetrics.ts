/** BIQ-0027: Coach dashboard metrics — extensible hooks for future team analytics */

import { computePersonalRecords } from '../progressAnalytics';
import { mondayOfWeek, todayYmd } from '../programCalendar';
import {
  assignmentTypeForMember,
  pickProgramForMember,
  programNameForMember,
} from './programResolution';
import { workoutStatusFromLogs } from './workoutStatus';
import type {
  AthleteRosterCard,
  CoachAlert,
  TeamCoachOverview,
  WorkoutDayStatus,
} from './types';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export type MemberWeekStats = { sets: number; days: number };

export type CoachSnapshotInput = {
  members: any[];
  memberStats: Record<string, MemberWeekStats>;
  memberAssignments: Record<string, any>;
  teamPrograms: any[];
  personalProgramsByUser: Record<string, any[]>;
  todayLogsByUser: Record<string, any[]>;
  weekLogsByUser: Record<string, any[]>;
  lastWorkoutDateByUser: Record<string, string>;
  defaultProgramId?: string | null;
  teamDefaultName?: string;
  sessionUserId?: string;
  logDate?: string;
  week?: number;
};

export function todayDayLabel(): string {
  return DAY_LABELS[new Date().getDay()];
}

export function findTodayWorkout(program: any | null, week: number, dayLabel = todayDayLabel()) {
  if (!program) return null;
  const workouts = program.st_workouts || [];
  return (
    workouts.find((w: any) => w.week === week && w.day_label === dayLabel) ||
    workouts.find((w: any) => w.week === 1 && w.day_label === dayLabel) ||
    null
  );
}

export function programsForMember(
  member: any,
  teamPrograms: any[],
  personalProgramsByUser: Record<string, any[]>
) {
  const usePersonal = (member.training_source || 'team') === 'personal';
  return usePersonal ? personalProgramsByUser[member.user_id] || [] : teamPrograms;
}

export function logMapForWorkout(workout: any | null, logs: any[]): Record<string, any> {
  if (!workout) return {};
  const ids = new Set<string>();
  (workout.st_exercises || []).forEach((e: any) =>
    (e.st_planned_sets || [])
      .filter((s: any) => !s.is_deleted)
      .forEach((s: any) => ids.add(s.id))
  );
  const by: Record<string, any> = {};
  (logs || []).forEach((l: any) => {
    if (ids.has(l.planned_set_id)) by[l.planned_set_id] = l;
  });
  return by;
}

export function memberCompliancePct(stats?: MemberWeekStats): number {
  if (!stats) return 0;
  if (stats.sets <= 0) return 0;
  return Math.min(100, Math.round((stats.days / 4) * 100));
}

export function countPrsThisWeek(weekLogsByUser: Record<string, any[]>): number {
  let total = 0;
  Object.values(weekLogsByUser).forEach((logs) => {
    total += computePersonalRecords(logs).filter((p) => p.recentPr).length;
  });
  return total;
}

export function buildAthleteRosterCards(input: CoachSnapshotInput): AthleteRosterCard[] {
  const dayLabel = todayDayLabel();
  const week = input.week ?? 1;

  return (input.members || []).map((member) => {
    const stats = input.memberStats[member.user_id] || { sets: 0, days: 0 };
    const assignment = input.memberAssignments[member.user_id];
    const list = programsForMember(member, input.teamPrograms, input.personalProgramsByUser);
    const defaultId =
      (member.training_source || 'team') === 'team' ? input.defaultProgramId : null;
    const program = pickProgramForMember(list, member, input.memberAssignments, defaultId);
    const todayWorkout = findTodayWorkout(program, week, dayLabel);
    const todayLogs = input.todayLogsByUser[member.user_id] || [];
    const status = workoutStatusFromLogs(todayWorkout, logMapForWorkout(todayWorkout, todayLogs));
    const weekLogs = input.weekLogsByUser[member.user_id] || [];
    const hasRecentPr = computePersonalRecords(weekLogs).some((p) => p.recentPr);

    return {
      memberId: member.id,
      userId: member.user_id,
      displayName: member.display_name || 'Member',
      role: member.role || 'member',
      status,
      programName: programNameForMember(member, assignment, program, input.teamDefaultName),
      assignmentType: assignmentTypeForMember(member, assignment),
      lastWorkoutDate: input.lastWorkoutDateByUser[member.user_id] || '',
      compliancePct: memberCompliancePct(stats),
      setsThisWeek: stats.sets,
      daysActiveThisWeek: stats.days,
      hasRecentPr,
      hasCoachNotes: !!String(assignment?.notes || '').trim(),
      isSelf: !!input.sessionUserId && member.user_id === input.sessionUserId,
    };
  });
}

export function buildCoachAlerts(roster: AthleteRosterCard[]): CoachAlert[] {
  const alerts: CoachAlert[] = [];

  roster.forEach((card) => {
    if (card.isSelf) return;
    if (card.status === 'not_started' && card.programName !== 'No program assigned') {
      alerts.push({
        id: `missed-${card.userId}`,
        kind: 'missed_session',
        memberUserId: card.userId,
        memberName: card.displayName,
        message: `${card.displayName} has not started today's workout.`,
      });
    }
    if (card.compliancePct > 0 && card.compliancePct < 50) {
      alerts.push({
        id: `low-${card.userId}`,
        kind: 'low_compliance',
        memberUserId: card.userId,
        memberName: card.displayName,
        message: `${card.displayName} is at ${card.compliancePct}% weekly compliance.`,
      });
    }
    if (card.hasRecentPr) {
      alerts.push({
        id: `pr-${card.userId}`,
        kind: 'new_pr',
        memberUserId: card.userId,
        memberName: card.displayName,
        message: `${card.displayName} hit a new PR this week.`,
      });
    }
    if (card.setsThisWeek === 0 && card.programName !== 'No program assigned') {
      alerts.push({
        id: `stalled-${card.userId}`,
        kind: 'stalled',
        memberUserId: card.userId,
        memberName: card.displayName,
        message: `${card.displayName} has no logged sets this week.`,
      });
    }
  });

  return alerts.slice(0, 8);
}

export function buildTeamCoachOverview(
  roster: AthleteRosterCard[],
  prsThisWeek: number
): TeamCoachOverview {
  const athletes = roster.filter((c) => !c.isSelf);
  const athleteCount = athletes.length || roster.length;
  const trainingStatuses: WorkoutDayStatus[] = ['in_progress', 'completed'];
  const trainingToday = athletes.filter((c) => trainingStatuses.includes(c.status)).length;
  const completedToday = athletes.filter((c) => c.status === 'completed').length;
  const inProgressToday = athletes.filter((c) => c.status === 'in_progress').length;
  const missedToday = athletes.filter((c) => c.status === 'not_started').length;
  const activeThisWeek = athletes.filter((c) => c.setsThisWeek > 0).length;
  const compliancePct = athleteCount
    ? Math.round((activeThisWeek / athleteCount) * 100)
    : 0;
  const totalSetsThisWeek = athletes.reduce((n, c) => n + c.setsThisWeek, 0);

  return {
    athleteCount,
    trainingToday,
    completedToday,
    inProgressToday,
    missedToday,
    compliancePct,
    prsThisWeek,
    totalSetsThisWeek,
    alerts: buildCoachAlerts(roster),
  };
}

export function buildCoachSnapshot(input: CoachSnapshotInput) {
  const roster = buildAthleteRosterCards(input);
  const prsThisWeek = countPrsThisWeek(input.weekLogsByUser);
  const overview = buildTeamCoachOverview(roster, prsThisWeek);
  return { roster, overview };
}

export function upcomingWorkoutLabel(program: any | null, week: number, dayLabel = todayDayLabel()) {
  if (!program) return 'No program assigned';
  const workouts = (program.st_workouts || []).sort(
    (a: any, b: any) => a.week - b.week || a.day_order - b.day_order
  );
  const todayIdx = DAY_LABELS.indexOf(dayLabel);
  const future = workouts.filter((w: any) => {
    if (w.week > week) return true;
    if (w.week < week) return false;
    const idx = DAY_LABELS.indexOf(w.day_label);
    return idx > todayIdx;
  });
  const next = future[0];
  if (!next) return 'No upcoming workouts in program';
  return `Week ${next.week} · ${next.day_label} · ${next.workout_type}`;
}

export function weekStartForPrWindow(): string {
  return mondayOfWeek(todayYmd());
}
