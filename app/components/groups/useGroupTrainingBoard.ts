'use client';

import { useEffect, useMemo, useState } from 'react';
import { loadGroupTrainingFacts, type GroupTrainingFacts } from '../../../lib/groups/loadGroupTrainingFacts';
import { buildGroupTrainingBoard, type GroupTrainingBoard, type GroupTrainingProgramRef } from '../../../lib/groups/trainingWorkspace';
import { todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';

export function asTrainingPrograms(programs: any[] | undefined): GroupTrainingProgramRef[] {
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
            restSeconds: set.rest_seconds ?? set.restSeconds ?? null,
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

type BoardMember = {
  user_id?: string;
  display_name?: string | null;
  training_source?: string | null;
  is_active_participant?: boolean;
};

export function useGroupTrainingBoard(input: {
  teamId: string | null;
  sessionUserId: string | null;
  canSeeAllTraining: boolean;
  members: BoardMember[];
  memberAssignments: Record<string, any>;
  programs: any[];
  defaultProgramId?: string | null;
}) {
  const [facts, setFacts] = useState<GroupTrainingFacts | null>(null);
  const [factsTick, setFactsTick] = useState(0);
  const assignmentKey = useMemo(
    () =>
      input.members
        .map((member) => {
          const row = member.user_id ? input.memberAssignments[member.user_id] : null;
          return `${member.user_id || ''}:${member.training_source || ''}:${member.is_active_participant === false ? '0' : '1'}:${row?.assignment_type || ''}:${row?.program_id || ''}`;
        })
        .join('|'),
    [input.members, input.memberAssignments]
  );
  const memberUserIds = useMemo(
    () => input.members.map((member) => member.user_id).filter((id): id is string => !!id),
    // assignmentKey already changes when the roster or assignments change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assignmentKey]
  );

  useEffect(() => {
    if (!input.teamId || !input.sessionUserId) {
      setFacts(null);
      return;
    }
    let cancelled = false;
    const subjectUserId = input.canSeeAllTraining ? null : input.sessionUserId;
    void loadGroupTrainingFacts(supabase, {
      teamId: input.teamId,
      today: todayYmd(),
      viewerUserId: input.sessionUserId,
      memberUserIds,
      subjectUserId,
    }).then((next) => {
      if (!cancelled) setFacts(next);
    });
    return () => {
      cancelled = true;
    };
  }, [input.teamId, input.sessionUserId, input.canSeeAllTraining, memberUserIds, factsTick]);

  const board: GroupTrainingBoard | null = useMemo(() => {
    if (!input.teamId || !facts) return null;
    const enrollmentByUser = new Map(facts.enrollments.map((row) => [row.userId, row]));
    return buildGroupTrainingBoard({
      teamId: input.teamId,
      today: todayYmd(),
      canManage: input.canSeeAllTraining,
      viewerUserId: input.sessionUserId || '',
      defaultProgramId: input.defaultProgramId,
      programs: asTrainingPrograms(input.programs),
      expectations: facts.expectations,
      expectationsAvailable: facts.expectationsAvailable,
      completionKnown: facts.completionKnown,
      missedByUser: facts.missedByUser,
      extras: facts.extras || [],
      members: input.members
        .filter((member) => member.user_id)
        .map((member) => {
          const userId = member.user_id as string;
          const assignment = input.memberAssignments[userId];
          const enrollment = enrollmentByUser.get(userId);
          return {
            userId,
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
  }, [input.teamId, input.canSeeAllTraining, input.sessionUserId, input.defaultProgramId, input.programs, input.members, input.memberAssignments, facts]);

  return {
    board,
    notice: facts?.notice || null,
    trainingReady: !!facts,
    reloadKey: factsTick,
    reload: () => setFactsTick((value) => value + 1),
  };
}
