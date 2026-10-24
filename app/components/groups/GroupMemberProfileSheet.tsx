'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { excuseMemberWorkout, moveMemberWorkout, restoreMemberWorkout, setMemberGroupExpectation, setMemberTrainingSchedule } from '../../../lib/groups/assignGroupTraining';
import { runGroupExtraAction, saveGroupActivity, type GroupExtraAction } from '../../../lib/groups/groupActivities';
import type { GroupActivityLogRequest } from '../../../lib/groups/groupActivityLog';
import { loadMemberTrainingWeek, type GroupCalendarWeekFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import { canOpenMemberTraining } from '../../../lib/groups/memberDirectory';
import { groupExpectationState, groupExtraWeekItems, type GroupActivityLog, type GroupTrainingMemberRow, type GroupTrainingWeekItem } from '../../../lib/groups/trainingWorkspace';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, sundayOfWeek, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import MemberTrainingWorkspace, { type GroupWorkoutLogRequest, type MemberProfileSection } from './MemberTrainingWorkspace';
import { asTrainingPrograms } from './useGroupTrainingBoard';

type GroupMemberProfileSheetProps = {
  teamId: string;
  teamName: string;
  sessionUserId: string;
  member: GroupTrainingMemberRow;
  sourceMember: any;
  canManage: boolean;
  canAssign: boolean;
  section: MemberProfileSection;
  onSection: (section: MemberProfileSection) => void;
  initialDate?: string | null;
  switchMembers: Array<{ userId: string; name: string }>;
  onSwitchMember: (userId: string) => void;
  progressPanel?: ReactNode;
  panelUserId?: string | null;
  groupLogs?: GroupActivityLog[] | null;
  programs?: any[];
  customizePrograms?: Array<{ id: string; name: string }>;
  onCustomize?: (memberUserId: string, programId: string) => void;
  onEditProgram?: (programId: string) => void;
  onOpenAssignWizard?: (seed?: { memberUserId?: string | null; programId?: string | null }) => void;
  onTrainingChanged: () => void;
  onClose: () => void;
  onMessage?: () => void;
  viewerUserId?: string | null;
  onLogGroupWorkout?: (input: GroupWorkoutLogRequest) => void;
  onLogGroupActivity?: (input: GroupActivityLogRequest) => void;
  reloadKey: number;
};

export default function GroupMemberProfileSheet({
  teamId,
  teamName,
  sessionUserId,
  member,
  sourceMember,
  canManage,
  canAssign,
  section,
  onSection,
  initialDate = null,
  switchMembers,
  onSwitchMember,
  progressPanel,
  panelUserId,
  groupLogs = null,
  programs = [],
  customizePrograms = [],
  onCustomize,
  onEditProgram,
  onOpenAssignWizard,
  onTrainingChanged,
  onClose,
  onMessage,
  viewerUserId = null,
  onLogGroupWorkout,
  onLogGroupActivity,
  reloadKey,
}: GroupMemberProfileSheetProps) {
  const selected = member;
  const allowed = canOpenMemberTraining({
    viewerUserId: sessionUserId,
    subjectUserId: selected.userId,
    canManage,
    canAssign,
  });
  const [profileWeekStart, setProfileWeekStart] = useState(() => mondayOfWeek(initialDate || todayYmd()));
  const [openedDate, setOpenedDate] = useState<string | null>(initialDate);
  const [memberWeek, setMemberWeek] = useState<GroupCalendarWeekFacts | null>(null);

  useEffect(() => {
    setProfileWeekStart(mondayOfWeek(initialDate || todayYmd()));
    setOpenedDate(initialDate || null);
  }, [selected.userId, initialDate]);

  useEffect(() => {
    if (!allowed) {
      setMemberWeek(null);
      return;
    }
    let cancelled = false;
    void loadMemberTrainingWeek(supabase, {
      teamId,
      userId: selected.userId,
      weekStart: profileWeekStart,
      today: todayYmd(),
      viewerUserId: sessionUserId,
    }).then((next) => {
      if (!cancelled) setMemberWeek(next);
    });
    return () => {
      cancelled = true;
    };
  }, [allowed, teamId, selected.userId, profileWeekStart, sessionUserId, reloadKey]);

  if (!allowed) return null;

  const profileWeekItems: GroupTrainingWeekItem[] = [
    ...(memberWeek?.expectations || [])
      .filter((row) => row.userId === selected.userId)
      .map((row): GroupTrainingWeekItem => ({
        date: row.scheduledDate,
        title: row.title || 'Workout',
        dayLabel: row.dayLabel || '',
        programWeek: row.programWeek ?? null,
        state: groupExpectationState(row, todayYmd(), !!memberWeek?.completionKnown, null, 'Upcoming'),
        workoutId: row.workoutId || null,
        expectationId: row.id || null,
        origin: row.origin === 'assignment' ? 'assignment' as const : 'program' as const,
        excused: !!row.excused,
        hasSession: !!row.sessionStatus && row.sessionStatus !== 'not_started',
      })),
    ...groupExtraWeekItems(memberWeek?.extras || [], selected.userId, mondayOfWeek(profileWeekStart), sundayOfWeek(profileWeekStart)),
  ];
  const profileWeekLabel = `${formatDisplayDate(mondayOfWeek(profileWeekStart))} – ${formatDisplayDate(sundayOfWeek(profileWeekStart))}`;
  const programRefs = asTrainingPrograms(programs);

  async function changeExtra(action: GroupExtraAction) {
    const { error, message } = await runGroupExtraAction(supabase, action);
    if (error) throw new Error(error);
    onTrainingChanged();
    return message;
  }

  return (
    <div className="member-profile-backdrop" onClick={onClose}>
      <div
        className="member-profile-sheet card"
        data-testid="member-profile-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={teamName ? `${selected.name}, ${teamName}` : selected.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="topline" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <MemberTrainingWorkspace
          groupName={teamName}
          teamId={teamId || null}
          member={selected}
          canManage={canManage}
          section={section}
          onSection={onSection}
          weekItems={memberWeek ? profileWeekItems : selected.weekItems}
          weekStart={profileWeekStart}
          initialDate={openedDate}
          weekRangeLabel={profileWeekLabel}
          weekNotice={memberWeek?.notice}
          onPreviousWeek={() => setProfileWeekStart((current) => addDaysYmd(mondayOfWeek(current), -7))}
          onNextWeek={() => setProfileWeekStart((current) => addDaysYmd(mondayOfWeek(current), 7))}
          onThisWeek={() => setProfileWeekStart(mondayOfWeek(todayYmd()))}
          switchMembers={switchMembers}
          onSwitchMember={onSwitchMember}
          onShowDate={(date) => setProfileWeekStart(mondayOfWeek(date))}
          progressPanel={panelUserId === selected.userId ? progressPanel : panelUserId ? <p className="muted">Loading progress…</p> : undefined}
          viewerUserId={viewerUserId || sessionUserId}
          groupLogs={panelUserId === selected.userId ? groupLogs : null}
          onLogWorkout={onLogGroupWorkout}
          onLogGroupActivity={onLogGroupActivity}
          customizePrograms={customizePrograms}
          onBack={onClose}
          onChangePlan={
            (canManage || canAssign) && sourceMember
              ? () => onOpenAssignWizard?.({ memberUserId: selected.userId })
              : undefined
          }
          canEditSchedule={!!(canAssign && selected.planKind !== 'personal' && selected.programId)}
          canRequireExtra={!!canAssign}
          scheduleProgram={programRefs.find((program) => program.id === selected.programId) || null}
          onSaveSchedule={async (scheduleInput) => {
            const { error } = await setMemberTrainingSchedule(supabase, {
              teamId,
              memberUserId: selected.userId,
              mode: scheduleInput.mode,
              weekdays: scheduleInput.weekdays,
              effectiveOn: scheduleInput.effectiveOn,
              localToday: todayYmd(),
            });
            if (error) throw new Error(error);
            onTrainingChanged();
          }}
          onMoveWorkout={async (moveInput) => {
            const { error } = await moveMemberWorkout(supabase, {
              teamId,
              memberUserId: selected.userId,
              workoutId: moveInput.workoutId,
              originalDate: moveInput.originalDate,
              newDate: moveInput.newDate,
              localToday: todayYmd(),
            });
            if (error) throw new Error(error);
            onTrainingChanged();
          }}
          onExcuseWorkout={async (excuseInput) => {
            const { error } = await excuseMemberWorkout(supabase, {
              teamId,
              memberUserId: selected.userId,
              workoutId: excuseInput.workoutId,
              originalDate: excuseInput.originalDate,
              localToday: todayYmd(),
            });
            if (error) throw new Error(error);
            onTrainingChanged();
          }}
          onRestoreWorkout={async (restoreInput) => {
            const { error } = await restoreMemberWorkout(supabase, {
              teamId,
              memberUserId: selected.userId,
              workoutId: restoreInput.workoutId,
              originalDate: restoreInput.originalDate,
              localToday: todayYmd(),
            });
            if (error) throw new Error(error);
            onTrainingChanged();
          }}
          onSetExpectations={async (enabled) => {
            const today = todayYmd();
            const { error } = await setMemberGroupExpectation(supabase, {
              teamId,
              memberUserId: selected.userId,
              enabled,
              effectiveOn: today,
              localToday: today,
            });
            if (error) throw new Error(error);
            onTrainingChanged();
          }}
          onAddActivity={
            canAssign || sessionUserId === selected.userId
              ? async (activityInput) => {
                  const { error } = await saveGroupActivity(supabase, {
                    teamId,
                    activityType: activityInput.activityType,
                    title: activityInput.title,
                    scheduledDate: activityInput.scheduledDate,
                    memberUserIds: [selected.userId],
                    requestKey: crypto.randomUUID(),
                    workoutId: activityInput.workoutId,
                    programId: activityInput.programId || selected.programId,
                    durationMinutes: activityInput.durationMinutes,
                    notes: activityInput.notes,
                    details: activityInput.details,
                    required: !!activityInput.required && !!canAssign,
                    recurrence: activityInput.recurrence,
                    recurrenceWeekdays: activityInput.recurrenceWeekdays,
                    recurrenceUntil: activityInput.recurrenceUntil,
                  });
                  if (error) throw new Error(error);
                  onTrainingChanged();
                }
              : undefined
          }
          onExtraAction={changeExtra}
          onEditSharedProgram={selected.programId && onEditProgram ? () => onEditProgram(selected.programId as string) : undefined}
          onCustomize={
            canManage && onCustomize && sourceMember?.user_id
              ? (programId) => onCustomize(sourceMember.user_id as string, programId)
              : undefined
          }
          onMessage={onMessage}
        />
      </div>
    </div>
  );
}
