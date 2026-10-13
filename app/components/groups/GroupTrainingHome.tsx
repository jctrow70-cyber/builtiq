'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';
import { assignGroupWorkout, excuseMemberWorkout, moveMemberWorkout, restoreMemberWorkout, setMemberGroupExpectation, setMemberTrainingSchedule } from '../../../lib/groups/assignGroupTraining';
import { loadGroupTrainingFacts, type GroupTrainingFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import type { GroupClassification } from '../../../lib/groups/schema';
import {
  buildGroupTrainingBoard,
  type GroupTrainingProgramRef,
} from '../../../lib/groups/trainingWorkspace';
import { todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import GroupTrainingCalendar from './GroupTrainingCalendar';
import GroupTrainingMemberList from './GroupTrainingMemberList';
import MemberTrainingWorkspace from './MemberTrainingWorkspace';

type GroupTrainingHomeProps = {
  canManage: boolean;
  current: TeamProgramRow | null;
  onView?: () => void;
  onEditProgram?: (programId: string) => void;
  onAssign?: () => void;
  onOpenAssignWizard?: (seed?: { memberUserId?: string | null; programId?: string | null }) => void;
  canAssign?: boolean;
  onManagePlans?: () => void;
  managingPlans: boolean;
  planLibrary?: ReactNode;
  teamId?: string | null;
  teamName?: string | null;
  sessionUserId?: string | null;
  members?: Array<{
    id?: string;
    user_id?: string;
    display_name?: string | null;
    training_source?: string | null;
    is_active_participant?: boolean;
  }>;
  classifications?: GroupClassification[];
  memberClassificationIds?: Record<string, string[]>;
  focusUserId?: string | null;
  onFocusHandled?: () => void;
  memberAssignments?: Record<string, any>;
  programs?: any[];
  defaultProgramId?: string | null;
  customizePrograms?: Array<{ id: string; name: string }>;
  onCustomize?: (memberUserId: string, programId: string) => void;
  canMessageMember?: (member: any) => boolean;
  onMessageMember?: (member: any) => void;
};

function asPrograms(programs: any[] | undefined): GroupTrainingProgramRef[] {
  const byId = new Map<string, GroupTrainingProgramRef>();
  (programs || []).forEach((program) => {
    if (!program?.id) return;
    const workouts = (program.st_workouts || program.workouts || []).map((workout: any) => ({
      id: workout.id,
      week: workout.week,
      dayLabel: workout.day_label || workout.dayLabel,
      dayOrder: workout.day_order ?? workout.dayOrder,
      title: workout.workout_type || workout.title,
    }));
    const existing = byId.get(program.id);
    byId.set(program.id, {
      id: program.id,
      name: program.name || existing?.name || 'Program',
      startDate: program.start_date || program.startDate || existing?.startDate || null,
      weeks: program.weeks ?? existing?.weeks,
      cycleLengthWeeks: program.cycle_length_weeks ?? existing?.cycleLengthWeeks,
      visibility: program.visibility || existing?.visibility,
      sourceProgramId: program.source_program_id || program.sourceProgramId || existing?.sourceProgramId || null,
      workouts: workouts.length ? workouts : existing?.workouts || [],
    });
  });
  return Array.from(byId.values());
}

export default function GroupTrainingHome({
  canManage,
  current,
  onView,
  onEditProgram,
  onAssign,
  onOpenAssignWizard,
  canAssign = false,
  onManagePlans,
  managingPlans,
  planLibrary,
  teamId,
  teamName,
  sessionUserId,
  focusUserId,
  onFocusHandled,
  members = [],
  classifications = [],
  memberClassificationIds = {},
  memberAssignments = {},
  programs = [],
  defaultProgramId,
  customizePrograms = [],
  onCustomize,
  canMessageMember,
  onMessageMember,
}: GroupTrainingHomeProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [facts, setFacts] = useState<GroupTrainingFacts | null>(null);
  const [factsTick, setFactsTick] = useState(0);
  const [trainingView, setTrainingView] = useState<'members' | 'calendar'>('members');

  const assignmentKey = useMemo(
    () =>
      members
        .map((member) => {
          const row = member.user_id ? memberAssignments[member.user_id] : null;
          return `${member.user_id || ''}:${member.training_source || ''}:${member.is_active_participant === false ? '0' : '1'}:${row?.assignment_type || ''}:${row?.program_id || ''}`;
        })
        .join('|'),
    [members, memberAssignments]
  );

  useEffect(() => {
    setSelectedUserId(null);
  }, [teamId]);

  useEffect(() => {
    if (!focusUserId) return;
    setSelectedUserId(focusUserId);
    setTrainingView('members');
    onFocusHandled?.();
  }, [focusUserId, onFocusHandled]);

  const memberUserIds = useMemo(
    () => members.map((member) => member.user_id).filter((id): id is string => !!id),
    // assignmentKey already changes when the roster or assignments change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignmentKey]
  );

  useEffect(() => {
    if (!teamId) {
      setFacts(null);
      return;
    }
    let cancelled = false;
    void loadGroupTrainingFacts(supabase, {
      teamId,
      today: todayYmd(),
      viewerUserId: sessionUserId,
      memberUserIds,
    }).then((next) => {
      if (!cancelled) setFacts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, sessionUserId, memberUserIds, factsTick]);

  const board = useMemo(() => {
    if (!teamId || !facts) return null;
    const enrollmentByUser = new Map(facts.enrollments.map((row) => [row.userId, row]));
    return buildGroupTrainingBoard({
      teamId,
      today: todayYmd(),
      canManage: canManage || canAssign,
      viewerUserId: sessionUserId || '',
      defaultProgramId,
      programs: asPrograms(programs),
      expectations: facts.expectations,
      expectationsAvailable: facts.expectationsAvailable,
      completionKnown: facts.completionKnown,
      missedByUser: facts.missedByUser,
      members: members
        .filter((member) => member.user_id)
        .map((member) => {
          const assignment = memberAssignments[member.user_id as string];
          const enrollment = enrollmentByUser.get(member.user_id as string);
          return {
            userId: member.user_id as string,
            name: member.display_name || 'Member',
            trainingSource: member.training_source,
            isActiveParticipant: member.is_active_participant !== false,
            assignment: assignment
              ? {
                  assignmentType: assignment.assignment_type,
                  programId: assignment.program_id,
                  programName: assignment.st_programs?.name || null,
                }
              : null,
            enrollment: enrollment
              ? {
                  programId: enrollment.programId,
                  status: enrollment.status,
                  startsOn: enrollment.startsOn,
                  expectationEnabled: enrollment.expectationEnabled,
                }
              : null,
            schedule: enrollment
              ? { mode: enrollment.scheduleMode, weekdays: enrollment.scheduleWeekdays }
              : null,
          };
        }),
    });
  }, [teamId, facts, canManage, canAssign, sessionUserId, defaultProgramId, programs, members, memberAssignments]);

  const selected = board?.members.find((member) => member.userId === selectedUserId) || null;
  const selectedSource = members.find((member) => member.user_id === selectedUserId) || null;

  function assignTraining() {
    if (onOpenAssignWizard) onOpenAssignWizard();
    else if (current && current.status === 'published' && onAssign) onAssign();
    else onManagePlans?.();
  }

  return (
    <div className="group-training">
      <div className="card group-training-card">
        <div className="group-training-head">
          <div>
            <h2>Training</h2>
            <p className="muted">Who is training, which plan they follow, and who needs attention.</p>
          </div>
          {(canManage || canAssign) && (
            <button type="button" className="btn green group-training-assign" onClick={assignTraining}>
              Assign Training
            </button>
          )}
        </div>
        <div className="group-training-summary" aria-label="Group training summary">
          <div>
            <b>{board ? board.summary.members : '—'}</b>
            <span className="muted">Members</span>
          </div>
          <div>
            <b>{board ? board.summary.assigned : '—'}</b>
            <span className="muted">With a group plan</span>
          </div>
          <div>
            <b>{board ? board.summary.needsPlan : '—'}</b>
            <span className="muted">Need a plan</span>
          </div>
          <div>
            <b>{board ? board.summary.workoutsThisWeek : '—'}</b>
            <span className="muted">Workouts this week</span>
          </div>
        </div>
        {facts?.notice && <p className="muted group-training-notice">{facts.notice}</p>}
      </div>

      <div className="card group-training-card">
        {selected && board ? (
          <MemberTrainingWorkspace
            groupName={teamName || ''}
            member={selected}
            canManage={canManage}
            customizePrograms={customizePrograms}
            onBack={() => {
              setSelectedUserId(null);
            }}
            onChangePlan={
              (canManage || canAssign) && selectedSource
                ? () => onOpenAssignWizard?.({ memberUserId: selected.userId })
                : undefined
            }
            canEditSchedule={!!(canAssign && teamId && selected.planKind !== 'personal' && selected.programId)}
            scheduleProgram={asPrograms(programs).find((program) => program.id === selected.programId) || null}
            onSaveSchedule={
              teamId
                ? async (input) => {
                    const { error } = await setMemberTrainingSchedule(supabase, {
                      teamId,
                      memberUserId: selected.userId,
                      mode: input.mode,
                      weekdays: input.weekdays,
                      effectiveOn: input.effectiveOn,
                      localToday: todayYmd(),
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onMoveWorkout={
              teamId
                ? async (input) => {
                    const { error } = await moveMemberWorkout(supabase, {
                      teamId,
                      memberUserId: selected.userId,
                      workoutId: input.workoutId,
                      originalDate: input.originalDate,
                      newDate: input.newDate,
                      localToday: todayYmd(),
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onExcuseWorkout={
              teamId
                ? async (input) => {
                    const { error } = await excuseMemberWorkout(supabase, {
                      teamId,
                      memberUserId: selected.userId,
                      workoutId: input.workoutId,
                      originalDate: input.originalDate,
                      localToday: todayYmd(),
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onRestoreWorkout={
              teamId
                ? async (input) => {
                    const { error } = await restoreMemberWorkout(supabase, {
                      teamId,
                      memberUserId: selected.userId,
                      workoutId: input.workoutId,
                      originalDate: input.originalDate,
                      localToday: todayYmd(),
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onSetExpectations={
              teamId
                ? async (enabled) => {
                    const today = todayYmd();
                    const { error } = await setMemberGroupExpectation(supabase, {
                      teamId,
                      memberUserId: selected.userId,
                      enabled,
                      effectiveOn: today,
                      localToday: today,
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onAddWorkout={
              teamId && selected.programId
                ? async (input) => {
                    const { error } = await assignGroupWorkout(supabase, {
                      teamId,
                      workoutId: input.workoutId,
                      programId: selected.programId,
                      targetType: 'members',
                      memberUserIds: [selected.userId],
                      scheduledDate: input.scheduledDate,
                      requestKey: crypto.randomUUID(),
                    });
                    if (error) throw new Error(error);
                    setFactsTick((value) => value + 1);
                  }
                : undefined
            }
            onEditSharedProgram={
              selected.programId && onEditProgram
                ? () => onEditProgram(selected.programId as string)
                : onView
            }
            onCustomize={
              canManage && onCustomize && selectedSource?.user_id
                ? (programId) => onCustomize(selectedSource.user_id as string, programId)
                : undefined
            }
            onMessage={
              onMessageMember && selectedSource && canMessageMember?.(selectedSource)
                ? () => onMessageMember(selectedSource)
                : undefined
            }
          />
        ) : (
          <>
            <div className="group-training-view-switch" role="tablist" aria-label="Training view">
              <button type="button" className={trainingView === 'members' ? 'is-current' : ''} onClick={() => setTrainingView('members')}>
                Members
              </button>
              <button type="button" className={trainingView === 'calendar' ? 'is-current' : ''} onClick={() => setTrainingView('calendar')}>
                Calendar
              </button>
            </div>
            {trainingView === 'calendar' && teamId ? (
              <GroupTrainingCalendar
                teamId={teamId}
                teamName={teamName}
                canSeeAll={canManage || canAssign}
                canEdit={!!canAssign}
                viewerUserId={sessionUserId || ''}
                reloadKey={factsTick}
                members={members
                  .filter((member) => member.user_id)
                  .map((member) => ({
                    id: member.id,
                    userId: member.user_id as string,
                    name: member.display_name || 'Member',
                  }))}
                classifications={classifications}
                memberClassificationIds={memberClassificationIds}
                onOpenMember={(userId) => {
                  setSelectedUserId(userId);
                }}
                onMoveWorkout={
                  teamId
                    ? async (input) => {
                        const { error } = await moveMemberWorkout(supabase, {
                          teamId,
                          memberUserId: input.memberUserId,
                          workoutId: input.workoutId,
                          originalDate: input.originalDate,
                          newDate: input.newDate,
                          localToday: todayYmd(),
                        });
                        if (error) throw new Error(error);
                        setFactsTick((value) => value + 1);
                      }
                    : undefined
                }
                onExcuseWorkout={
                  teamId
                    ? async (input) => {
                        const { error } = await excuseMemberWorkout(supabase, {
                          teamId,
                          memberUserId: input.memberUserId,
                          workoutId: input.workoutId,
                          originalDate: input.originalDate,
                          localToday: todayYmd(),
                        });
                        if (error) throw new Error(error);
                        setFactsTick((value) => value + 1);
                      }
                    : undefined
                }
                onRestoreWorkout={
                  teamId
                    ? async (input) => {
                        const { error } = await restoreMemberWorkout(supabase, {
                          teamId,
                          memberUserId: input.memberUserId,
                          workoutId: input.workoutId,
                          originalDate: input.originalDate,
                          localToday: todayYmd(),
                        });
                        if (error) throw new Error(error);
                        setFactsTick((value) => value + 1);
                      }
                    : undefined
                }
              />
            ) : (
              <>
                <h2>Members</h2>
                {!board ? (
                  <p className="muted">Loading training…</p>
                ) : (
                  <GroupTrainingMemberList
                    members={board.members}
                    sessionUserId={sessionUserId}
                    onOpenMember={(userId) => {
                      setSelectedUserId(userId);
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {canManage && (
        <div className="card group-training-card">
          <div className="group-training-library-head">
            <div>
              <h2>Program library</h2>
              <p className="muted">Publish plans here. Assign Training adds a plan or a workout. Building a program stays in Programs.</p>
            </div>
            {onManagePlans && (
              <button type="button" className="btn secondary" onClick={onManagePlans}>
                {managingPlans ? 'Hide programs' : 'Show programs'}
              </button>
            )}
          </div>
          {current && (
            <p className="muted group-training-current">
              Current group program · <b>{current.name}</b>
              {onView && (
                <button type="button" className="btn small secondary" style={{ marginLeft: 8 }} onClick={onView}>
                  View
                </button>
              )}
            </p>
          )}
          {managingPlans && (
            <div className="group-training-library">
              {planLibrary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
