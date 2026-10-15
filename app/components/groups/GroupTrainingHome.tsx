'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';
import { assignGroupWorkout, excuseMemberWorkout, moveMemberWorkout, restoreMemberWorkout, setMemberGroupExpectation, setMemberTrainingSchedule } from '../../../lib/groups/assignGroupTraining';
import { loadGroupTrainingFacts, loadMemberTrainingWeek, type GroupCalendarWeekFacts, type GroupTrainingFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import type { GroupClassification } from '../../../lib/groups/schema';
import {
  buildGroupTrainingBoard,
  groupExpectationState,
  type GroupTrainingProgramRef,
  type GroupTrainingWeekItem,
} from '../../../lib/groups/trainingWorkspace';
import { addDaysYmd, formatDisplayDate, mondayOfWeek, sundayOfWeek, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import GroupTrainingCalendar from './GroupTrainingCalendar';
import GroupTrainingMemberList from './GroupTrainingMemberList';
import MemberTrainingWorkspace, { type MemberProfileSection } from './MemberTrainingWorkspace';

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
  focusSection?: MemberProfileSection;
  onFocusHandled?: () => void;
  onMemberFocus?: (userId: string, section: MemberProfileSection) => void;
  panelUserId?: string | null;
  progressPanel?: ReactNode;
  detailsPanel?: ReactNode;
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
      exercises: (workout.st_exercises || workout.exercises || []).map((exercise: any) => ({
        id: exercise.id,
        name: exercise.name || exercise.exercise_name || 'Exercise',
        sortOrder: exercise.sort_order ?? exercise.sortOrder ?? 0,
        sets: (exercise.st_planned_sets || exercise.sets || [])
          .filter((set: any) => !set.is_deleted)
          .map((set: any) => ({
            setNumber: set.set_number ?? set.setNumber,
            reps: set.target_reps || set.reps || '',
            weight: set.target_weight || set.weight || '',
          })),
      })),
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
  focusSection = 'calendar',
  onFocusHandled,
  onMemberFocus,
  panelUserId,
  progressPanel,
  detailsPanel,
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
  const [profileSection, setProfileSection] = useState<MemberProfileSection>('calendar');
  const [profileWeekStart, setProfileWeekStart] = useState(() => mondayOfWeek(todayYmd()));
  const [memberWeek, setMemberWeek] = useState<GroupCalendarWeekFacts | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
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
    setProfileWeekStart(mondayOfWeek(todayYmd()));
  }, [teamId]);

  useEffect(() => {
    if (!focusUserId) return;
    setSelectedUserId(focusUserId);
    setProfileSection(focusSection);
    setTrainingView('members');
    onFocusHandled?.();
  }, [focusUserId, focusSection, onFocusHandled]);

  useEffect(() => {
    if (!teamId || !selectedUserId) {
      setMemberWeek(null);
      return;
    }
    let cancelled = false;
    void loadMemberTrainingWeek(supabase, {
      teamId,
      userId: selectedUserId,
      weekStart: profileWeekStart,
      today: todayYmd(),
      viewerUserId: sessionUserId,
    }).then((next) => {
      if (!cancelled) setMemberWeek(next);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, selectedUserId, profileWeekStart, sessionUserId, factsTick]);

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
  const visibleMembers = (board?.members || []).filter((member) => {
    const nameMatch = member.name.toLowerCase().includes(memberQuery.trim().toLowerCase());
    const statusMatch = statusFilter === 'all' || member.status === statusFilter;
    return nameMatch && statusMatch;
  });
  const profileWeekItems: GroupTrainingWeekItem[] = (memberWeek?.expectations || [])
    .filter((row) => row.userId === selectedUserId)
    .map((row) => ({
      date: row.scheduledDate,
      title: row.title || 'Workout',
      dayLabel: row.dayLabel || '',
      state: groupExpectationState(row, todayYmd(), !!memberWeek?.completionKnown, null, 'Upcoming'),
      workoutId: row.workoutId || null,
      origin: row.origin === 'assignment' ? 'assignment' : 'program',
      excused: !!row.excused,
      hasSession: !!row.sessionStatus && row.sessionStatus !== 'not_started',
    }));
  const profileWeekLabel = `${formatDisplayDate(mondayOfWeek(profileWeekStart))} – ${formatDisplayDate(sundayOfWeek(profileWeekStart))}`;

  function openProfile(userId: string, section: MemberProfileSection) {
    setSelectedUserId(userId);
    setProfileSection(section);
    setTrainingView('members');
    onMemberFocus?.(userId, section);
  }

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
            section={profileSection}
            onSection={(section) => openProfile(selected.userId, section)}
            weekItems={memberWeek ? profileWeekItems : selected.weekItems}
            weekRangeLabel={profileWeekLabel}
            weekNotice={memberWeek?.notice}
            onPreviousWeek={() => setProfileWeekStart((current) => addDaysYmd(mondayOfWeek(current), -7))}
            onNextWeek={() => setProfileWeekStart((current) => addDaysYmd(mondayOfWeek(current), 7))}
            onThisWeek={() => setProfileWeekStart(mondayOfWeek(todayYmd()))}
            switchMembers={visibleMembers.map((member) => ({ userId: member.userId, name: member.name }))}
            onSwitchMember={(userId) => openProfile(userId, profileSection)}
            progressPanel={panelUserId === selected.userId ? progressPanel : panelUserId ? <p className="muted">Loading progress…</p> : undefined}
            detailsPanel={panelUserId === selected.userId ? detailsPanel : panelUserId ? <p className="muted">Loading details…</p> : undefined}
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
                onOpenMember={(userId) => openProfile(userId, 'calendar')}
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
                <div className="member-profile-filters">
                  <h2>Members</h2>
                  <label>
                    Search
                    <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Name" />
                  </label>
                  <label>
                    Status
                    <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                      <option value="all">All statuses</option>
                      <option value="on_track">On track</option>
                      <option value="needs_attention">Needs attention</option>
                      <option value="schedule_paused">Schedule paused</option>
                      <option value="needs_plan">Needs a plan</option>
                      <option value="schedule_review">Schedule needs review</option>
                      <option value="personal">Personal training</option>
                      <option value="paused">Paused</option>
                    </select>
                  </label>
                </div>
                {!board ? (
                  <p className="muted">Loading training…</p>
                ) : visibleMembers.length === 0 ? (
                  <p className="muted">No members match that search.</p>
                ) : (
                  <GroupTrainingMemberList
                    members={visibleMembers}
                    sessionUserId={sessionUserId}
                    onOpenMember={(userId) => openProfile(userId, 'calendar')}
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
