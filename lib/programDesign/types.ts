export const PROGRAM_LIFECYCLE_STATUSES = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'archived',
] as const;

export type ProgramLifecycleStatus = (typeof PROGRAM_LIFECYCLE_STATUSES)[number];

/** Stored on st_programs.status. Includes legacy `published`. */
export type StoredProgramStatus = ProgramLifecycleStatus | 'published';

export const PROGRAM_RECORD_KINDS = ['template', 'instance'] as const;
export type ProgramRecordKind = (typeof PROGRAM_RECORD_KINDS)[number];

export const CYCLE_LENGTH_PRESETS = [4, 6, 8, 12] as const;
export type CycleLengthPreset = (typeof CYCLE_LENGTH_PRESETS)[number];

export const ACTIVITY_TYPES = [
  'strength',
  'cardio',
  'mobility',
  'stretching',
  'recovery',
  'sport',
  'rest',
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type WeekdayLabel = (typeof WEEKDAY_LABELS)[number];

export type ProgramScope = 'personal' | 'group';

export type ProgramDesignRecord = {
  id: string;
  name: string;
  status?: string | null;
  visibility?: string | null;
  weeks?: number | null;
  cycle_length_weeks?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  created_at?: string | null;
  team_id?: string | null;
  owner_user_id?: string | null;
  record_kind?: string | null;
  source_program_id?: string | null;
};

export type ProgramActivityDetails = {
  cardio_type?: string;
  distance?: string;
  intensity?: string;
  heart_rate_zone?: string;
  movements?: Array<{ name: string; duration_or_reps?: string }>;
  sport_name?: string;
  [key: string]: unknown;
};

export type ProgramActivity = {
  id: string;
  program_id: string;
  week_number: number;
  day_of_week: number;
  sort_order: number;
  activity_type: ActivityType;
  title: string;
  duration_minutes: number | null;
  notes: string;
  details: ProgramActivityDetails;
  workout_id?: string | null;
  created_at?: string | null;
};

export type ActivityDraft = {
  activity_type: ActivityType;
  title: string;
  duration_minutes: number | null;
  notes: string;
  details: ProgramActivityDetails;
};

export type GroupOption = {
  id: string;
  name: string;
  my_role?: string | null;
};
