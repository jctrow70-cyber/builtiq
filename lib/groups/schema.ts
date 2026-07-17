/** BIQ-0043-P2: DB-aligned constants for group assignments (no UI in P2). */

export const ASSIGNMENT_TARGET_TYPES = ['group', 'classification', 'members', 'individual'] as const;
export type AssignmentTargetType = (typeof ASSIGNMENT_TARGET_TYPES)[number];

export const WORKOUT_ASSIGNMENT_STATUSES = ['pending', 'started', 'completed', 'cancelled'] as const;
export type WorkoutAssignmentStatus = (typeof WORKOUT_ASSIGNMENT_STATUSES)[number];

export const RECIPIENT_STATUSES = ['pending', 'started', 'completed', 'skipped', 'cancelled'] as const;
export type RecipientStatus = (typeof RECIPIENT_STATUSES)[number];

export type GroupClassification = {
  id: string;
  team_id: string;
  name: string;
  slug: string;
  created_at?: string;
};

export type GroupMemberClassification = {
  member_id: string;
  classification_id: string;
  created_at?: string;
};

export type WorkoutAssignment = {
  id: string;
  team_id: string;
  assigned_by?: string | null;
  workout_id?: string | null;
  program_id?: string | null;
  workout_date?: string | null;
  target_type: AssignmentTargetType;
  target_classification_id?: string | null;
  scheduled_date: string;
  due_date?: string | null;
  status: WorkoutAssignmentStatus;
  template_snapshot_version: number;
  is_active: boolean;
  title?: string | null;
  notes?: string | null;
  created_at?: string;
};

export type AssignmentRecipient = {
  id: string;
  assignment_id: string;
  user_id: string;
  status: RecipientStatus;
  personal_copy_program_id?: string | null;
  created_at?: string;
};
