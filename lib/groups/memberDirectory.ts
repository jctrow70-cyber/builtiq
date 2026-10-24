import { normalizeRole, roleLabel } from './permissions';
import type { GroupTrainingStatus } from './trainingWorkspace';

export const MEMBER_DIRECTORY_PAGE_SIZE = 40;

export const DIRECTORY_STATUS_OPTIONS: Array<{ value: GroupTrainingStatus; label: string }> = [
  { value: 'on_track', label: 'On track' },
  { value: 'needs_attention', label: 'Missed workouts' },
  { value: 'schedule_paused', label: 'Schedule paused' },
  { value: 'needs_plan', label: 'No program assigned' },
  { value: 'schedule_review', label: 'Schedule needs review' },
  { value: 'personal', label: 'Personal training' },
  { value: 'paused', label: 'Paused' },
];

const STATUS_SORT: Record<GroupTrainingStatus, number> = {
  needs_attention: 0,
  needs_plan: 1,
  schedule_review: 2,
  schedule_paused: 3,
  paused: 4,
  personal: 5,
  on_track: 6,
};

export type DirectorySort = 'name' | 'status' | 'next';

export type DirectoryRosterMember = {
  id: string;
  userId: string;
  name: string;
  role: string;
};

export type DirectoryTrainingSnapshot = {
  userId: string;
  planName: string;
  status: GroupTrainingStatus;
  statusLabel: string;
  nextDate: string | null;
  nextLabel: string | null;
};

export type MemberDirectoryRow = {
  id: string;
  userId: string;
  name: string;
  role: string;
  roleLabel: string;
  isSelf: boolean;
  trainingVisible: boolean;
  canOpen: boolean;
  trainingPending: boolean;
  programLabel: string | null;
  status: GroupTrainingStatus | null;
  statusLabel: string | null;
  nextDate: string | null;
  nextText: string | null;
};

export type MemberDirectoryQuery = {
  name?: string;
  role?: string;
  program?: string;
  status?: string;
  sort?: DirectorySort;
};

/** Owners, managers, and assign-enabled members can open another person's training. Everyone can open their own. */
export function canOpenMemberTraining(input: {
  viewerUserId: string;
  subjectUserId: string;
  canManage: boolean;
  canAssign: boolean;
}): boolean {
  if (!input.viewerUserId || !input.subjectUserId) return false;
  if (input.viewerUserId === input.subjectUserId) return true;
  return input.canManage || input.canAssign;
}

/**
 * The training board only knows the loaded Monday–Sunday week.
 * A later date is not the member's next activity.
 */
export function nextThisWeekText(
  next: { date: string; label: string } | null | undefined,
  today: string,
  weekStart: string,
  weekEnd: string
): { date: string | null; text: string } {
  if (next && next.date >= today && next.date >= weekStart && next.date <= weekEnd && next.label) {
    return { date: next.date, text: `Next this week · ${next.label}` };
  }
  return { date: null, text: 'None remaining this week' };
}

export function buildMemberDirectory(input: {
  roster: DirectoryRosterMember[];
  training: DirectoryTrainingSnapshot[];
  viewerUserId: string;
  canManage: boolean;
  canAssign: boolean;
  today: string;
  weekStart: string;
  weekEnd: string;
  trainingReady: boolean;
}): MemberDirectoryRow[] {
  const trainingByUser = new Map(input.training.map((row) => [row.userId, row]));
  return input.roster.map((member) => {
    const trainingVisible = canOpenMemberTraining({
      viewerUserId: input.viewerUserId,
      subjectUserId: member.userId,
      canManage: input.canManage,
      canAssign: input.canAssign,
    });
    const snapshot = trainingVisible ? trainingByUser.get(member.userId) : undefined;
    const pending = trainingVisible && !input.trainingReady;
    const next = snapshot
      ? nextThisWeekText(
          snapshot.nextDate && snapshot.nextLabel ? { date: snapshot.nextDate, label: snapshot.nextLabel } : null,
          input.today,
          input.weekStart,
          input.weekEnd
        )
      : null;
    return {
      id: member.id,
      userId: member.userId,
      name: member.name || 'Member',
      role: normalizeRole(member.role),
      roleLabel: roleLabel(member.role),
      isSelf: member.userId === input.viewerUserId,
      trainingVisible,
      canOpen: trainingVisible,
      trainingPending: pending,
      programLabel: snapshot ? snapshot.planName : null,
      status: snapshot ? snapshot.status : null,
      statusLabel: snapshot ? snapshot.statusLabel : null,
      nextDate: next?.date || null,
      nextText: pending || !trainingVisible ? null : next?.text || 'None remaining this week',
    };
  });
}

function compareName(left: MemberDirectoryRow, right: MemberDirectoryRow): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: 'base', numeric: true });
}

export function filterMemberDirectory(rows: MemberDirectoryRow[], query: MemberDirectoryQuery): MemberDirectoryRow[] {
  const name = query.name?.trim().toLowerCase() || '';
  const role = query.role && query.role !== 'all' ? normalizeRole(query.role) : '';
  const program = query.program && query.program !== 'all' ? query.program : '';
  const status = query.status && query.status !== 'all' ? query.status : '';
  const filtered = rows.filter((row) => {
    if (name && !row.name.toLowerCase().includes(name)) return false;
    if (role && row.role !== role) return false;
    if (program && row.programLabel !== program) return false;
    if (status && row.status !== status) return false;
    return true;
  });
  const sort = query.sort || 'name';
  return filtered.sort((left, right) => {
    if (sort === 'status') {
      const leftRank = left.status ? STATUS_SORT[left.status] : 99;
      const rightRank = right.status ? STATUS_SORT[right.status] : 99;
      if (leftRank !== rightRank) return leftRank - rightRank;
    }
    if (sort === 'next') {
      if (left.nextDate !== right.nextDate) {
        if (!left.nextDate) return 1;
        if (!right.nextDate) return -1;
        if (left.nextDate < right.nextDate) return -1;
        if (left.nextDate > right.nextDate) return 1;
      }
    }
    return compareName(left, right);
  });
}

export function visibleDirectoryRows<T>(rows: T[], count: number): T[] {
  const size = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return rows.slice(0, size);
}
