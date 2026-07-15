/** BIQ-0027: Team Training coach platform — domain types */

export type TeamRole = 'owner' | 'editor' | 'member';

export type AssignmentType = 'team' | 'personal' | 'individual_team' | 'manual';

export type WorkoutDayStatus = 'completed' | 'in_progress' | 'not_started' | 'rest' | 'none';

export type CoachAlertKind = 'missed_session' | 'low_compliance' | 'new_pr' | 'stalled';

export type CoachAlert = {
  id: string;
  kind: CoachAlertKind;
  memberUserId?: string;
  memberName?: string;
  message: string;
};

export type TeamCoachOverview = {
  athleteCount: number;
  trainingToday: number;
  completedToday: number;
  inProgressToday: number;
  missedToday: number;
  compliancePct: number;
  prsThisWeek: number;
  totalSetsThisWeek: number;
  alerts: CoachAlert[];
};

export type AthleteRosterCard = {
  memberId: string;
  userId: string;
  displayName: string;
  role: TeamRole;
  status: WorkoutDayStatus;
  programName: string;
  assignmentType: AssignmentType | 'personal_legacy';
  lastWorkoutDate: string;
  compliancePct: number;
  setsThisWeek: number;
  daysActiveThisWeek: number;
  hasRecentPr: boolean;
  hasCoachNotes: boolean;
  isSelf: boolean;
};

export type AthleteCoachDashboardData = {
  member: any;
  program: any | null;
  assignment: any | null;
  todayWorkout: any | null;
  todayStatus: WorkoutDayStatus;
  lastWorkoutDate: string;
  setsThisWeek: number;
  daysActiveThisWeek: number;
  recentLogs: any[];
  personalRecords: ReturnType<typeof import('../progressAnalytics').computePersonalRecords>;
  weeklyTrends: ReturnType<typeof import('../progressAnalytics').computeWeeklyTrends>;
  coachNotes: string;
  upcomingWorkoutLabel: string;
};

export const ASSIGNMENT_OPTIONS: {
  type: AssignmentType;
  title: string;
  description: string;
  needsProgramPicker: boolean;
  futureAiGenerate?: boolean;
}[] = [
  {
    type: 'team',
    title: 'Team program',
    description: 'Everyone follows the same team plan (e.g. Varsity Baseball Summer Strength).',
    needsProgramPicker: false,
  },
  {
    type: 'personal',
    title: 'Personal program',
    description: 'Athlete uses their own personal BuiltIQ program while staying on the roster.',
    needsProgramPicker: false,
  },
  {
    type: 'individual_team',
    title: 'Individual team program',
    description: 'Assign a specific team-visible program to this athlete only.',
    needsProgramPicker: true,
  },
  {
    type: 'manual',
    title: 'Manual program',
    description: 'Coach picks any team program; edit exercises, sets, and notes in Program Setup.',
    needsProgramPicker: true,
  },
];
