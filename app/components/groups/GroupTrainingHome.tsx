'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TeamProgramRow } from '../../../lib/groups/programRoster';
import { loadGroupTrainingFacts, type GroupTrainingFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import {
  buildGroupTrainingBoard,
  type GroupTrainingProgramRef,
} from '../../../lib/groups/trainingWorkspace';
import { todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import GroupTrainingMemberList from './GroupTrainingMemberList';
import MemberTrainingWorkspace from './MemberTrainingWorkspace';

type GroupTrainingHomeProps = {
  canManage: boolean;
  current: TeamProgramRow | null;
  onView?: () => void;
  onAssign?: () => void;
  onOpenAssignWizard?: (seed?: { memberUserId?: string | null; programId?: string | null }) => void;
  canAssign?: boolean;
  onManagePlans?: () => void;
  managingPlans: boolean;
  planLibrary?: ReactNode;
  assignmentTools?: ReactNode;
  teamId?: string | null;
  teamName?: string | null;
  sessionUserId?: string | null;
  members?: Array<{
    user_id?: string;
    display_name?: string | null;
    training_source?: string | null;
    is_active_participant?: boolean;
  }>;
  memberAssignments?: Record<string, any>;
  programs?: any[];
  defaultProgramId?: string | null;
  onPrepareAssignment?: (member: any) => void;
  assignmentMemberId?: string | null;
  planEditor?: ReactNode;
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
  onAssign,
  onOpenAssignWizard,
  canAssign = false,
  onManagePlans,
  managingPlans,
  planLibrary,
  assignmentTools,
  teamId,
  teamName,
  sessionUserId,
  members = [],
  memberAssignments = {},
  programs = [],
  defaultProgramId,
  onPrepareAssignment,
  assignmentMemberId,
  planEditor,
  customizePrograms = [],
  onCustomize,
  canMessageMember,
  onMessageMember,
}: GroupTrainingHomeProps) {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [facts, setFacts] = useState<GroupTrainingFacts | null>(null);
  const [editingPlan, setEditingPlan] = useState(false);

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
    setEditingPlan(false);
  }, [teamId]);

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
  }, [teamId, sessionUserId, memberUserIds]);

  const board = useMemo(() => {
    if (!teamId || !facts) return null;
    const enrollmentByUser = new Map(facts.enrollments.map((row) => [row.userId, row]));
    return buildGroupTrainingBoard({
      teamId,
      today: todayYmd(),
      canManage,
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
                }
              : null,
          };
        }),
    });
  }, [teamId, facts, canManage, sessionUserId, defaultProgramId, programs, members, memberAssignments]);

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
            planEditor={
              editingPlan ? (
                assignmentMemberId === selected.userId ? (
                  planEditor
                ) : (
                  <p className="muted">Loading the current assignment…</p>
                )
              ) : null
            }
            onBack={() => {
              setSelectedUserId(null);
              setEditingPlan(false);
            }}
            onChangePlan={
              (canManage || canAssign) && selectedSource
                ? () => onOpenAssignWizard?.({ memberUserId: selected.userId })
                : undefined
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
            <h2>Members</h2>
            {!board ? (
              <p className="muted">Loading training…</p>
            ) : (
              <GroupTrainingMemberList
                members={board.members}
                sessionUserId={sessionUserId}
                onOpenMember={(userId) => {
                  setEditingPlan(false);
                  setSelectedUserId(userId);
                }}
              />
            )}
          </>
        )}
      </div>

      {canManage && (
        <div className="card group-training-card">
          <div className="group-training-library-head">
            <div>
              <h2>Program library</h2>
              <p className="muted">Publish, assign, and send a one-off workout. Building a program stays in Programs.</p>
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
              {assignmentTools}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
