'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DateInput from '../DateInput';
import { formatDisplayDate, todayYmd } from '../../../lib/training/programCalendar';
import { supabase } from '../../../lib/supabaseClient';
import { groupSourceKey, workoutLabel } from '../../../lib/groups';
import { displayWorkoutName, orderedWeekSessions } from '../../../lib/groups/trainingWorkspace';
import { customWeekdayError, materializeMemberSchedule, programCycleAnchor } from '../../../lib/groups/memberSchedule';
import type { MemberScheduleInput } from '../../../lib/groups/assignGroupTraining';
import {
  INDIVIDUAL_SCHEDULE_NOTE,
  buildAssignmentReview,
  keepWizardDraftOnError,
  memberPlanName,
  memberUserIdsForClassification,
  nextWizardStep,
  previewProgramSchedule,
  previousWizardStep,
  programIsAssignable,
  resolveWizardMembers,
  resumeAfterProgramPublish,
  searchMembers,
  searchPrograms,
  wizardAdvanceError,
  type AssignmentWizardResume,
  type WizardMember,
  type WizardProgram,
  type WizardStep,
  type WizardWhatKind,
  type WizardWhoMode,
} from '../../../lib/groups/assignmentWizard';

export type AssignTrainingSubmit =
  | {
      mode: 'individual' | 'group_default';
      memberUserIds: string[];
      programId: string;
      startsOn: string;
      notes: string;
      requestKey: string;
      setAsGroupPlan: boolean;
      schedules: MemberScheduleInput[];
    }
  | {
      mode: 'workout';
      memberUserIds: string[];
      programId: string | null;
      workoutId: string;
      scheduledDate: string;
      dueDate: string;
      notes: string;
      requestKey: string;
      targetType: 'members' | 'classification' | 'group';
      classificationId: string | null;
    };

type AssignTrainingWizardProps = {
  teamId: string;
  members: any[];
  programs: any[];
  classifications: Array<{ id: string; name: string }>;
  memberClassificationIds: Record<string, string[]>;
  memberAssignments?: Record<string, any>;
  defaultProgramId?: string | null;
  defaultProgramName?: string | null;
  resume?: AssignmentWizardResume | null;
  seed?: { memberUserId?: string | null; programId?: string | null } | null;
  onClose: () => void;
  onCreateProgram: (draft: AssignmentWizardResume) => void;
  onSubmit: (payload: AssignTrainingSubmit) => Promise<void>;
};

function asMember(member: any, assignment: any, enrollment: { programId: string | null; programName: string | null } | undefined): WizardMember {
  return {
    userId: member.user_id,
    memberId: member.id,
    name: member.display_name || 'Member',
    status: member.status || 'active',
    trainingSource: member.training_source,
    isActiveParticipant: member.is_active_participant !== false,
    assignmentType: assignment?.assignment_type,
    assignmentProgramId: assignment?.program_id,
    assignmentProgramName: assignment?.st_programs?.name || null,
    enrollmentProgramId: enrollment?.programId || null,
    enrollmentProgramName: enrollment?.programName || null,
  };
}

function asProgram(program: any): WizardProgram | null {
  if (!program?.id) return null;
  const workouts = (program.st_workouts || program.workouts || []).map((workout: any) => ({
    id: workout.id,
    week: workout.week,
    dayLabel: workout.day_label || workout.dayLabel,
    dayOrder: workout.day_order ?? workout.dayOrder,
    title: workout.workout_type || workout.title,
  }));
  return {
    id: program.id,
    name: program.name || 'Program',
    startDate: program.start_date || program.startDate || null,
    weeks: program.weeks,
    cycleLengthWeeks: program.cycle_length_weeks ?? program.cycleLengthWeeks,
    visibility: program.visibility,
    teamId: program.team_id || program.teamId || null,
    status: program.status,
    workouts,
  };
}

export default function AssignTrainingWizard({
  teamId,
  members,
  programs,
  classifications,
  memberClassificationIds,
  memberAssignments = {},
  defaultProgramId,
  defaultProgramName,
  resume = null,
  seed = null,
  onClose,
  onCreateProgram,
  onSubmit,
}: AssignTrainingWizardProps) {
  const today = todayYmd();
  const [step, setStep] = useState<WizardStep>(resume?.step || 'who');
  const [whoMode, setWhoMode] = useState<WizardWhoMode>(resume?.whoMode || (seed?.memberUserId ? 'members' : 'members'));
  const [selectedIds, setSelectedIds] = useState<string[]>(
    resume?.memberUserIds || (seed?.memberUserId ? [seed.memberUserId] : [])
  );
  const [memberQuery, setMemberQuery] = useState('');
  const [classificationId, setClassificationId] = useState(resume?.classificationId || '');
  const [whatKind, setWhatKind] = useState<WizardWhatKind>(resume?.whatKind || 'program');
  const [programId, setProgramId] = useState(resume?.programId || seed?.programId || '');
  const [programQuery, setProgramQuery] = useState('');
  const [workoutId, setWorkoutId] = useState('');
  const [startsOn, setStartsOn] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [setAsGroupPlan, setSetAsGroupPlan] = useState(resume?.setAsGroupPlan || false);
  const [scheduleChoice, setScheduleChoice] = useState<'program' | 'custom'>(resume?.scheduleChoice || 'program');
  const [scheduleScope, setScheduleScope] = useState<'same' | 'individual'>(resume?.scheduleScope || 'same');
  const [sameWeekdays, setSameWeekdays] = useState<string[]>(resume?.sameWeekdays || []);
  const [memberWeekdays, setMemberWeekdays] = useState<Record<string, string[]>>(resume?.memberWeekdays || {});
  const [openScheduleUserId, setOpenScheduleUserId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [enrollments, setEnrollments] = useState<Record<string, { programId: string | null; programName: string | null }>>({});
  const [oneOffs, setOneOffs] = useState<Array<{ userId: string; scheduledDate: string; title: string }>>([]);
  const requestKey = useRef(resume?.programId ? crypto.randomUUID() : crypto.randomUUID());
  const hydrated = useRef(false);

  useEffect(() => {
    if (!resume || hydrated.current) return;
    hydrated.current = true;
    const next = resume.programId
      ? resumeAfterProgramPublish(resume, { id: resume.programId, name: resume.programName || 'Program' })
      : resume;
    setStep(next.step);
    setWhoMode(next.whoMode);
    setSelectedIds(next.memberUserIds);
    setClassificationId(next.classificationId || '');
    setWhatKind(next.whatKind);
    setProgramId(next.programId || '');
    setSetAsGroupPlan(next.setAsGroupPlan);
  }, [resume]);

  useEffect(() => {
    let cancelled = false;
    const sourceKey = groupSourceKey(teamId);
    void supabase
      .from('st_training_enrollments')
      .select('user_id, program_id, source_kind, source_key')
      .eq('team_id', teamId)
      .eq('source_kind', 'group')
      .eq('source_key', sourceKey)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const names = new Map(programs.map((program) => [program.id, program.name]));
        const next: Record<string, { programId: string | null; programName: string | null }> = {};
        data.forEach((row: { user_id: string; program_id?: string | null; source_key?: string }) => {
          if (row.source_key !== sourceKey) return;
          next[row.user_id] = { programId: row.program_id || null, programName: names.get(row.program_id) || null };
        });
        setEnrollments(next);
      });
    void supabase
      .from('st_workout_assignments')
      .select('scheduled_date, title, workout_id, is_active, st_assignment_recipients(user_id)')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .then(async ({ data }) => {
        if (cancelled || !data) return;
        const ids = Array.from(new Set(data.map((row: { workout_id?: string | null }) => row.workout_id).filter((id): id is string => !!id)));
        const names = new Map<string, { title?: string | null; dayLabel?: string | null }>();
        if (ids.length) {
          const workouts = await supabase.from('st_workouts').select('id, workout_type, day_label').in('id', ids);
          if (!workouts.error) {
            (workouts.data || []).forEach((workout: { id: string; workout_type?: string | null; day_label?: string | null }) => {
              names.set(workout.id, { title: workout.workout_type, dayLabel: workout.day_label });
            });
          }
        }
        if (cancelled) return;
        const rows: Array<{ userId: string; scheduledDate: string; title: string }> = [];
        data.forEach((row: { scheduled_date?: string; title?: string | null; workout_id?: string | null; st_assignment_recipients?: Array<{ user_id?: string }> }) => {
          (row.st_assignment_recipients || []).forEach((recipient) => {
            if (!recipient.user_id || !row.scheduled_date) return;
            rows.push({
              userId: recipient.user_id,
              scheduledDate: row.scheduled_date,
              title: displayWorkoutName(row.title, row.workout_id ? names.get(row.workout_id) : null),
            });
          });
        });
        setOneOffs(rows);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, programs]);

  const wizardMembers = useMemo(
    () =>
      members
        .filter((member) => member?.user_id)
        .map((member) => asMember(member, memberAssignments[member.user_id], enrollments[member.user_id])),
    [members, memberAssignments, enrollments]
  );
  const programChoices = useMemo(
    () => programs.map(asProgram).filter((program): program is WizardProgram => !!program),
    [programs]
  );
  const visiblePrograms = searchPrograms(programChoices, programQuery, teamId);
  const selectedProgram = programChoices.find((program) => program.id === programId) || null;
  const preview = selectedProgram && startsOn ? previewProgramSchedule(selectedProgram, startsOn) : null;
  const chosenMembers = resolveWizardMembers({
    mode: whoMode,
    members: wizardMembers,
    selectedUserIds: selectedIds,
    classificationId,
    classificationLinks: memberClassificationIds,
  });
  const useGroupDefault = whatKind === 'program' && whoMode === 'all' && setAsGroupPlan;
  const review = buildAssignmentReview({
    mode: whatKind === 'workout' ? 'workout' : useGroupDefault ? 'group_default' : 'individual',
    members: chosenMembers,
    program: selectedProgram,
    startsOn,
    today,
    defaultProgramName,
    oneOffs,
    workoutDate: whatKind === 'workout' ? startsOn : null,
  });
  const workouts = (selectedProgram?.workouts || []).slice().sort((a, b) => Number(a.week) - Number(b.week) || Number(a.dayOrder) - Number(b.dayOrder));
  const selectedWorkout = workouts.find((workout) => workout.id === workoutId) || null;

  function draft(nextStep: WizardStep = step): AssignmentWizardResume {
    return {
      teamId,
      step: nextStep,
      whoMode,
      memberUserIds: chosenMembers.map((member) => member.userId),
      classificationId: classificationId || null,
      programId: programId || null,
      programName: selectedProgram?.name || null,
      creation: null,
      whatKind,
      setAsGroupPlan,
      scheduleChoice,
      scheduleScope,
      sameWeekdays,
      memberWeekdays,
    };
  }

  const scheduleSessions = selectedProgram
    ? orderedWeekSessions(
        selectedProgram.workouts || [],
        (selectedProgram.workouts || []).map((workout) => Number(workout.week)).find((week) => orderedWeekSessions(selectedProgram.workouts || [], week).length > 0) || 1
      )
    : [];

  function weekdaysFor(userId: string): string[] {
    if (scheduleChoice !== 'custom') return [];
    if (scheduleScope === 'individual' && chosenMembers.length > 1) return memberWeekdays[userId] || [];
    return sameWeekdays;
  }

  function schedules(): MemberScheduleInput[] {
    return chosenMembers.map((member) => ({
      userId: member.userId,
      mode: scheduleChoice === 'custom' ? 'custom_weekdays' : 'program_days',
      weekdays: weekdaysFor(member.userId),
    }));
  }

  function previewFor(userId: string) {
    if (!selectedProgram || !startsOn || whatKind !== 'program') return [];
    return materializeMemberSchedule({
      mode: scheduleChoice === 'custom' ? 'custom_weekdays' : 'program_days',
      weekdays: weekdaysFor(userId),
      program: selectedProgram,
      startsOn,
      effectiveOn: startsOn,
      cycleAnchor: scheduleChoice === 'custom' ? programCycleAnchor(selectedProgram, startsOn) : null,
    });
  }

  function goNext() {
    const problem = wizardAdvanceError({
      step,
      memberCount: chosenMembers.length,
      whatKind,
      programId: programId || null,
      workoutId: workoutId || null,
      startsOn,
      classificationId,
      whoMode,
    });
    if (problem) {
      setError(problem);
      return;
    }
    if (step === 'when' && whatKind === 'program' && scheduleChoice === 'custom' && selectedProgram) {
      const lists = scheduleScope === 'individual' && chosenMembers.length > 1
        ? chosenMembers.map((member) => weekdaysFor(member.userId))
        : [sameWeekdays];
      for (const days of lists) {
        const scheduleProblem = customWeekdayError(selectedProgram.workouts, days);
        if (scheduleProblem) {
          setError(scheduleProblem);
          return;
        }
      }
    }
    const next = nextWizardStep(step);
    if (!next) return;
    setError('');
    setConfirmed(false);
    if (next === 'review') requestKey.current = crypto.randomUUID();
    setStep(next);
  }

  function goBack() {
    const prev = previousWizardStep(step);
    if (!prev) {
      onClose();
      return;
    }
    setError('');
    setStep(prev);
  }

  async function assign() {
    if (review.confirmationRequired && !confirmed) {
      setError('Confirm replacing the current group plans before assigning.');
      return;
    }
    const saved = keepWizardDraftOnError(draft('review'));
    const savedSchedules = schedules();
    setBusy(true);
    setError('');
    try {
      if (whatKind === 'workout') {
        await onSubmit({
          mode: 'workout',
          memberUserIds: saved.memberUserIds,
          programId: programId || null,
          workoutId,
          scheduledDate: startsOn,
          dueDate,
          notes,
          requestKey: requestKey.current,
          targetType: whoMode === 'classification' ? 'classification' : whoMode === 'all' ? 'group' : 'members',
          classificationId: classificationId || null,
        });
        setDone(`Assigned a workout to ${saved.memberUserIds.length} ${saved.memberUserIds.length === 1 ? 'member' : 'members'}.`);
      } else if (useGroupDefault) {
        await onSubmit({
          mode: 'group_default',
          memberUserIds: saved.memberUserIds,
          programId,
          startsOn,
          notes,
          requestKey: requestKey.current,
          setAsGroupPlan: true,
          schedules: savedSchedules,
        });
        setDone('The group plan is updated for members who use it.');
      } else {
        await onSubmit({
          mode: 'individual',
          memberUserIds: saved.memberUserIds,
          programId,
          startsOn,
          notes,
          requestKey: requestKey.current,
          setAsGroupPlan,
          schedules: savedSchedules,
        });
        setDone(`Assigned training to ${saved.memberUserIds.length} ${saved.memberUserIds.length === 1 ? 'member' : 'members'}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Could not assign training. Your selections are still here.');
    } finally {
      setBusy(false);
    }
  }

  const countLabel = `${chosenMembers.length} selected`;

  return (
    <div className="team-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="team-sheet-panel card assign-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-training-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="assign-wizard-head">
          <div>
            <p className="muted assign-wizard-kicker">Assign Training · {countLabel}</p>
            <h2 id="assign-training-title">{done ? 'Training assigned' : step === 'who' ? 'Who' : step === 'what' ? 'What' : step === 'when' ? 'When' : 'Review'}</h2>
          </div>
          <button type="button" className="btn small secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <ol className="assign-wizard-steps">
          {(['who', 'what', 'when', 'review'] as WizardStep[]).map((item, index) => (
            <li key={item} className={item === step ? 'is-current' : ''}>
              {index + 1}
            </li>
          ))}
        </ol>

        {done ? (
          <div className="assign-wizard-step">
            <p>{done}</p>
            <button type="button" className="btn green" onClick={onClose}>
              Back to Training
            </button>
          </div>
        ) : (
          <div className="assign-wizard-step">
            {step === 'who' && (
              <>
                <div className="assign-wizard-choices">
                  <button type="button" className={whoMode === 'members' ? 'is-current' : ''} onClick={() => setWhoMode('members')}>
                    Choose members
                  </button>
                  <button
                    type="button"
                    className={whoMode === 'all' ? 'is-current' : ''}
                    onClick={() => {
                      setWhoMode('all');
                      setSetAsGroupPlan(true);
                    }}
                  >
                    All eligible
                  </button>
                  <button type="button" className={whoMode === 'classification' ? 'is-current' : ''} onClick={() => setWhoMode('classification')}>
                    Classification
                  </button>
                </div>
                {whoMode === 'classification' && (
                  <label>
                    Classification
                    <select value={classificationId} onChange={(event) => setClassificationId(event.target.value)}>
                      <option value="">Select</option>
                      {classifications.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({memberUserIdsForClassification(item.id, wizardMembers, memberClassificationIds).length})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {whoMode === 'members' && (
                  <>
                    <label>
                      Search members
                      <input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Name" />
                    </label>
                    <div className="assign-wizard-list">
                      {searchMembers(wizardMembers, memberQuery).map((member) => {
                        const plan = memberPlanName(member, defaultProgramName);
                        return (
                          <label key={member.userId} className="assign-wizard-person">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(member.userId)}
                              onChange={() =>
                                setSelectedIds((current) =>
                                  current.includes(member.userId)
                                    ? current.filter((id) => id !== member.userId)
                                    : [...current, member.userId]
                                )
                              }
                            />
                            <span>
                              <b>{member.name}</b>
                              <span className="muted">{plan ? `Current plan · ${plan}` : 'No group plan'}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                )}
                {whoMode !== 'members' && (
                  <ul className="assign-wizard-list">
                    {chosenMembers.map((member) => (
                      <li key={member.userId}>
                        <b>{member.name}</b>
                        <span className="muted">{memberPlanName(member, defaultProgramName) || 'No group plan'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {step === 'what' && (
              <>
                <div className="assign-wizard-choices">
                  <button type="button" className={whatKind === 'program' ? 'is-current' : ''} onClick={() => setWhatKind('program')}>
                    Existing program
                  </button>
                  <button type="button" className={whatKind === 'workout' ? 'is-current' : ''} onClick={() => setWhatKind('workout')}>
                    Add Workout
                  </button>
                </div>
                <label>
                  Search programs
                  <input value={programQuery} onChange={(event) => setProgramQuery(event.target.value)} placeholder="Program name" />
                </label>
                <div className="assign-wizard-list">
                  {visiblePrograms.map((program) => (
                    <label key={program.id} className="assign-wizard-person">
                      <input
                        type="radio"
                        name="assign-program"
                        checked={programId === program.id}
                        onChange={() => {
                          setProgramId(program.id);
                          setWorkoutId('');
                        }}
                      />
                      <span>
                        <b>{program.name}</b>
                        {defaultProgramId === program.id && <span className="muted">Current group plan</span>}
                      </span>
                    </label>
                  ))}
                  {!visiblePrograms.length && <p className="muted">No published group programs match that search.</p>}
                </div>
                {whatKind === 'workout' && (
                  <label>
                    Workout
                    <select value={workoutId} onChange={(event) => setWorkoutId(event.target.value)}>
                      <option value="">Select workout</option>
                      {workouts.map((workout) => (
                        <option key={workout.id || `${workout.week}-${workout.dayLabel}`} value={workout.id || ''}>
                          {workoutLabel({ day_label: workout.dayLabel, workout_type: workout.title, week: workout.week })}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="assign-wizard-create">
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => onCreateProgram({ ...draft('what'), creation: 'ai', whatKind: 'program' })}
                  >
                    Create with AI
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => onCreateProgram({ ...draft('what'), creation: 'manual', whatKind: 'program' })}
                  >
                    Create manually
                  </button>
                </div>
              </>
            )}

            {step === 'when' && (
              <>
                <label>
                  {whatKind === 'workout' ? 'Scheduled date' : 'Start date'}
                  <DateInput value={startsOn} onChange={setStartsOn} />
                </label>
                {whatKind === 'workout' ? (
                  <label>
                    Due date (optional)
                    <DateInput value={dueDate} onChange={setDueDate} />
                  </label>
                ) : (
                  preview && (
                    <div className="assign-wizard-preview">
                      <p>Training days · {scheduleChoice === 'custom' ? 'Custom' : preview.weekdayLabel}</p>
                      <p>Duration · {preview.durationLabel}</p>
                      <p>
                        First workout ·{' '}
                        {previewFor(chosenMembers[0]?.userId || '')[0]
                          ? formatDisplayDate(previewFor(chosenMembers[0]?.userId || '')[0].scheduledDate)
                          : '—'}
                      </p>
                      <p>Final workout · {preview.finalWorkout ? formatDisplayDate(preview.finalWorkout) : '—'}</p>
                      <p className="muted">{INDIVIDUAL_SCHEDULE_NOTE}</p>
                    </div>
                  )
                )}
                {whatKind === 'program' && (
                  <div className="assign-wizard-days">
                    <button
                      type="button"
                      className="btn secondary"
                      onClick={() => {
                        if (scheduleChoice === 'custom') {
                          setScheduleChoice('program');
                          return;
                        }
                        const seeded = scheduleSessions.map((session) => session.dayLabel || '');
                        if (!sameWeekdays.length) setSameWeekdays(seeded);
                        setScheduleChoice('custom');
                      }}
                    >
                      {scheduleChoice === 'custom' ? 'Use the program’s days' : 'Customize training days'}
                    </button>
                    {scheduleChoice === 'custom' && chosenMembers.length > 1 && (
                      <div className="assign-wizard-choices">
                        <button type="button" className={scheduleScope === 'same' ? 'is-current' : ''} onClick={() => setScheduleScope('same')}>
                          Same schedule for everyone
                        </button>
                        <button type="button" className={scheduleScope === 'individual' ? 'is-current' : ''} onClick={() => setScheduleScope('individual')}>
                          Different schedule for selected members
                        </button>
                      </div>
                    )}
                    {scheduleChoice === 'custom' && scheduleScope === 'same' && (
                      <WeekdayChoices sessions={scheduleSessions} weekdays={sameWeekdays} onChange={setSameWeekdays} />
                    )}
                    {scheduleChoice === 'custom' && scheduleScope === 'individual' &&
                      chosenMembers.map((member) => (
                        <details key={member.userId} open={openScheduleUserId === member.userId} onToggle={(event) => setOpenScheduleUserId((event.target as HTMLDetailsElement).open ? member.userId : null)}>
                          <summary>{member.name}</summary>
                          <WeekdayChoices
                            sessions={scheduleSessions}
                            weekdays={memberWeekdays[member.userId] || scheduleSessions.map((session) => session.dayLabel || '')}
                            onChange={(next) => setMemberWeekdays((current) => ({ ...current, [member.userId]: next }))}
                          />
                        </details>
                      ))}
                    {scheduleChoice === 'custom' && chosenMembers[0] && (
                      <ul className="assign-wizard-list">
                        {previewFor(chosenMembers[0].userId).slice(0, 4).map((row) => (
                          <li key={`${row.workoutId}-${row.scheduledDate}`}>
                            <b>{formatDisplayDate(row.scheduledDate)}</b>
                            <span className="muted">{row.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <button type="button" className="btn small secondary" onClick={() => setShowNotes((open) => !open)}>
                  {showNotes ? 'Hide notes' : 'Add notes'}
                </button>
                {showNotes && (
                  <label>
                    Notes
                    <input value={notes} onChange={(event) => setNotes(event.target.value)} />
                  </label>
                )}
              </>
            )}

            {step === 'review' && (
              <>
                <div className="assign-wizard-preview">
                  <p>Members · {chosenMembers.length}</p>
                  <p>Program · {selectedProgram?.name || '—'}</p>
                  {whatKind === 'workout' && <p>Workout · {selectedWorkout?.title || selectedWorkout?.dayLabel || 'Workout'}</p>}
                  <p>{whatKind === 'workout' ? 'Date' : 'Start'} · {formatDisplayDate(startsOn)}</p>
                  {whatKind === 'program' && preview && (
                    <>
                      <p>Training days · {scheduleChoice === 'custom' ? 'Custom for each member below' : preview.weekdayLabel}</p>
                      <p>Duration · {preview.durationLabel}</p>
                    </>
                  )}
                  {whatKind === 'program' &&
                    chosenMembers.map((member) => (
                      <div key={member.userId}>
                        <p>
                          {member.name} · {scheduleChoice === 'custom' ? weekdaysFor(member.userId).join(' / ') : preview?.weekdayLabel}
                        </p>
                        <ul className="assign-wizard-list">
                          {previewFor(member.userId).slice(0, 4).map((row) => (
                            <li key={`${member.userId}-${row.scheduledDate}-${row.workoutId}`}>
                              <b>{formatDisplayDate(row.scheduledDate)}</b>
                              <span className="muted">{row.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  <p className="muted">{review.scheduleNote}</p>
                </div>
                {!!review.replaced.length && (
                  <div>
                    <h3>Plans that will be replaced</h3>
                    <ul className="assign-wizard-list">
                      {review.replaced.map((member) => (
                        <li key={member.userId}>
                          <b>{member.name}</b>
                          <span className="muted">{member.planName}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!review.preserved.length && (
                  <div>
                    <h3>Left as they are</h3>
                    <ul className="assign-wizard-list">
                      {review.preserved.map((member) => (
                        <li key={member.userId}>
                          <b>{member.name}</b>
                          <span className="muted">{member.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!!review.conflicts.length && (
                  <div>
                    <h3>Same-day workouts</h3>
                    <ul className="assign-wizard-list">
                      {review.conflicts.map((conflict) => (
                        <li key={`${conflict.userId}-${conflict.date}`}>
                          <b>{conflict.name}</b>
                          <span className="muted">
                            {formatDisplayDate(conflict.date)} · {conflict.title}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {whatKind === 'program' && (
                  <label className="assign-wizard-person">
                    <input type="checkbox" checked={setAsGroupPlan} onChange={(event) => setSetAsGroupPlan(event.target.checked)} />
                    <span>Also use this as the group plan for members who follow the group plan</span>
                  </label>
                )}
                {review.confirmationRequired && (
                  <label className="assign-wizard-person">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
                    <span>Replace the current group plans shown above</span>
                  </label>
                )}
              </>
            )}

            {error && <p className="team-sheet-error">{error}</p>}
            <div className="assign-wizard-actions">
              <button type="button" className="btn secondary" onClick={goBack} disabled={busy}>
                Back
              </button>
              {step === 'review' ? (
                <button type="button" className="btn green" onClick={() => void assign()} disabled={busy || !programIsAssignable(selectedProgram, teamId)}>
                  {busy ? 'Assigning…' : 'Assign'}
                </button>
              ) : (
                <button type="button" className="btn green" onClick={goNext} disabled={busy}>
                  Next
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function WeekdayChoices({
  sessions,
  weekdays,
  onChange,
}: {
  sessions: Array<{ id?: string | null; title?: string | null; dayLabel?: string | null }>;
  weekdays: string[];
  onChange: (next: string[]) => void;
}) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <div className="assign-wizard-day-grid">
      {sessions.map((session, index) => (
        <label key={session.id || index}>
          {session.title || session.dayLabel || `Workout ${index + 1}`}
          <select
            value={weekdays[index] || ''}
            onChange={(event) => {
              const next = sessions.map((_, item) => weekdays[item] || '');
              next[index] = event.target.value;
              onChange(next);
            }}
          >
            <option value="">Select day</option>
            {days.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
