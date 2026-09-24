import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { persistAiProgramPlan, persistExercisesOntoWorkout, persistWorkoutsOntoProgram, type GenerationConfig } from '../../../../lib/training/aiProgramPlan';
import { missingProgramColumnFromError } from '../../../../lib/training/programStatus';
import { focusMusclesForSingleDayType, inferScheduleFromPrompt, inferSessionMinutesFromPrompt, inferSingleDayTypeFromPrompt } from '../../../../lib/programDesign/inferSchedule';
import { createActivitiesFromWorkouts, updateDesignProgram } from '../../../../lib/programDesign/programDesignApi';
import { cycleEndDate, generationWeeksOf, snapStartToMonday } from '../../../../lib/programDesign/cycle';
import { fetchAllExerciseCatalog } from '../../../../lib/training/catalogFetch';
import { builtinCatalogItems } from '../../../../lib/training/catalogSearch';
import { normalizeEquipmentList } from '../../../../lib/training/equipmentFilter';
import { limitationExclusions, limitationNotesFromIds } from '../../../../lib/programDesign/intakePreferences';
import {
  SCIENCE_ENGINE_VERSION,
  scienceProgramToAiPlan,
  summarizeRecentLogs,
  trainingProfileFromSources,
} from '../../../../lib/scienceEngine';
import { adaptGenerationCatalog } from '../../../../lib/scienceEngine/generation/catalogEligibility';
import { runGenerationPipeline } from '../../../../lib/scienceEngine/generation';
import { attachGenerationRunProgram } from '../../../../lib/scienceEngine/generation/log';

export const runtime = 'nodejs';
export const maxDuration = 120;

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeDays(days: unknown): string[] {
  if (!Array.isArray(days) || !days.length) return ['Mon', 'Tue', 'Fri'];
  return days
    .map((d) => String(d))
    .filter((d) => DAY_LABELS.includes(d))
    .sort((a, b) => DAY_LABELS.indexOf(a) - DAY_LABELS.indexOf(b));
}

export async function POST(request: Request) {
  const { supabase, token } = createSupabaseFromRequest(request);
  const { user, error: authError } = await requireAuthUser(supabase, token);
  if (authError || !user) {
    return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = String(body?.prompt || '').trim();
  if (prompt.length > 6000) {
    return NextResponse.json({ error: 'Prompt is too long (max 6000 characters)' }, { status: 400 });
  }

  const structuredIntake = body?.structuredIntake === true;
  const promptSchedule = inferScheduleFromPrompt(prompt);
  const dayTypes: Record<string, string> =
    structuredIntake && body?.dayTypes && typeof body.dayTypes === 'object'
      ? body.dayTypes
      : promptSchedule.named && Object.keys(promptSchedule.dayTypes).length
        ? promptSchedule.dayTypes
        : body?.dayTypes && typeof body.dayTypes === 'object'
          ? body.dayTypes
          : {};
  let days = structuredIntake
    ? normalizeDays(body?.days)
    : promptSchedule.named
      ? normalizeDays(promptSchedule.days)
      : normalizeDays(body?.days);
  let mode: 'personal' | 'team' = body?.mode === 'team' ? 'team' : 'personal';
  let teamId = body?.teamId ? String(body.teamId) : null;
  let focusMuscles = Array.isArray(body?.focusMuscles) ? body.focusMuscles.map(String) : [];
  const programName = body?.programName ? String(body.programName).trim() : '';
  const defaultProgramName = 'BuiltIQ Training Program';
  const includeCooldown = body?.includeCooldown !== false;
  const startDateRaw = body?.startDate ? String(body.startDate).slice(0, 10) : null;
  const existingProgramId = body?.existingProgramId ? String(body.existingProgramId) : '';
  const targetWorkoutId = body?.targetWorkoutId ? String(body.targetWorkoutId) : '';

  type ExistingProgramRow = {
    id: string;
    owner_user_id: string;
    team_id: string | null;
    visibility: string;
    weeks?: number | null;
    cycle_length_weeks?: number | null;
    start_date?: string | null;
  };
  let existingProgram: ExistingProgramRow | null = null;

  if (existingProgramId) {
    let fields = 'id, owner_user_id, team_id, visibility, weeks, cycle_length_weeks, start_date';
    let existing: ExistingProgramRow | null = null;
    let existingError: { message?: string } | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      const result = await supabase.from('st_programs').select(fields).eq('id', existingProgramId).maybeSingle();
      existingError = result.error;
      if (!result.error) {
        existing = result.data as unknown as ExistingProgramRow | null;
        break;
      }
      const col = missingProgramColumnFromError(result.error);
      if (col && fields.split(',').some((f) => f.trim() === col)) {
        fields = fields
          .split(',')
          .map((f) => f.trim())
          .filter((f) => f !== col)
          .join(', ');
        continue;
      }
      break;
    }
    if (existingError || !existing) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }
    existingProgram = existing;
    const owns = existingProgram.owner_user_id === user.id;
    if (!owns && existingProgram.visibility === 'team' && existingProgram.team_id) {
      const { data: membership } = await supabase
        .from('st_team_members')
        .select('role')
        .eq('team_id', existingProgram.team_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership || !['owner', 'editor', 'manager'].includes(membership.role)) {
        return NextResponse.json({ error: 'You cannot edit this program' }, { status: 403 });
      }
    } else if (!owns) {
      return NextResponse.json({ error: 'You cannot edit this program' }, { status: 403 });
    }
    if (existingProgram.visibility === 'team' && existingProgram.team_id) {
      mode = 'team';
      teamId = String(existingProgram.team_id);
    }
  }

  type TargetWorkoutRow = { id: string; program_id: string; day_label: string; week: number | null; workout_type: string | null };
  let targetWorkout: TargetWorkoutRow | null = null;
  if (targetWorkoutId) {
    const { data: workoutRow, error: workoutError } = await supabase
      .from('st_workouts')
      .select('id, program_id, day_label, week, workout_type')
      .eq('id', targetWorkoutId)
      .maybeSingle();
    if (workoutError || !workoutRow) {
      return NextResponse.json({ error: 'Workout not found' }, { status: 404 });
    }
    targetWorkout = workoutRow as TargetWorkoutRow;
    if (!existingProgram || existingProgram.id !== targetWorkout.program_id) {
      const { data: workoutProgram, error: workoutProgramError } = await supabase
        .from('st_programs')
        .select('id, owner_user_id, team_id, visibility')
        .eq('id', targetWorkout.program_id)
        .maybeSingle();
      if (workoutProgramError || !workoutProgram) {
        return NextResponse.json({ error: 'Program not found' }, { status: 404 });
      }
      const owns = workoutProgram.owner_user_id === user.id;
      if (!owns && workoutProgram.visibility === 'team' && workoutProgram.team_id) {
        const { data: membership } = await supabase
          .from('st_team_members')
          .select('role')
          .eq('team_id', workoutProgram.team_id)
          .eq('user_id', user.id)
          .eq('status', 'active')
          .maybeSingle();
        if (!membership || !['owner', 'editor', 'manager'].includes(membership.role)) {
          return NextResponse.json({ error: 'You cannot edit this workout' }, { status: 403 });
        }
      } else if (!owns) {
        return NextResponse.json({ error: 'You cannot edit this workout' }, { status: 403 });
      }
    }
    const dayLabel = String(targetWorkout.day_label || days[0] || 'Mon');
    days = normalizeDays([dayLabel]);
    const inferredType = inferSingleDayTypeFromPrompt(prompt);
    if (inferredType !== 'Full Body') {
      dayTypes[dayLabel] = inferredType;
    } else if (!dayTypes[dayLabel]) {
      dayTypes[dayLabel] = String(targetWorkout.workout_type || 'Full Body');
    }
    if (!focusMuscles.length) {
      focusMuscles = focusMusclesForSingleDayType(dayTypes[dayLabel] || inferredType);
    }
  }

  // Prefer the program's saved cycle length so Custom weeks (e.g. 1) are not replaced by the old 6-week default.
  // Single-workout generate stays one day and does not rewrite the parent program.
  let weeks = targetWorkout ? 1 : generationWeeksOf(existingProgram, body?.weeks);

  if (mode === 'team') {
    if (!teamId) return NextResponse.json({ error: 'teamId required for team programs' }, { status: 400 });
    const { data: membership } = await supabase
      .from('st_team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership || !['owner', 'editor', 'manager'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only group owners and managers can create group programs' }, { status: 403 });
    }
  }

  const [{ data: profile }, catalogResult, trainingProfileResult] = await Promise.all([
    supabase.from('st_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    fetchAllExerciseCatalog(supabase),
    supabase.from('st_training_profiles').select('*').eq('user_id', user.id).maybeSingle(),
  ]);

  if (catalogResult.error) {
    return NextResponse.json({ error: `Failed to load exercise catalog: ${catalogResult.error}` }, { status: 500 });
  }

  const trainingProfileRow = trainingProfileResult.error ? null : trainingProfileResult.data;
  const catalog = catalogResult.data;
  const scienceProfile = trainingProfileFromSources({
    profile,
    trainingProfile: trainingProfileRow,
    config: {
      days,
      dayTypes,
      focusMuscles,
      availableEquipment: Array.isArray(body?.availableEquipment)
        ? body.availableEquipment.map(String)
        : normalizeEquipmentList(profile?.available_equipment),
      includeCooldown,
      weeks,
      sessionMinutes: inferSessionMinutesFromPrompt(prompt) || body?.sessionMinutes,
      primaryGoal: body?.primaryGoal,
      experienceLevel: body?.experienceLevel,
      excludedExercises: Array.isArray(body?.limitations)
        ? limitationExclusions(body.limitations)
        : undefined,
      injuryLimitations: Array.isArray(body?.limitations) ? limitationNotesFromIds(body.limitations) : undefined,
      supersetPreference: body?.supersetPreference,
      varietyPreference: body?.varietyPreference,
      trainingFeel: Array.isArray(body?.trainingFeel) ? body.trainingFeel.map(String) : undefined,
      trainingSplit: body?.trainingSplit,
      intakeNotes: [body?.notes, prompt].filter((s) => String(s || '').trim()).join('\n'),
    },
  });

  const apiKey = process.env.OPENAI_API_KEY;
  const canCallAi = Boolean(apiKey) && (structuredIntake || prompt.length >= 8 || Boolean(targetWorkout));
  let pipeline;
  try {
    pipeline = await runGenerationPipeline({
      profile: scienceProfile,
      catalog: adaptGenerationCatalog(catalog),
      userPrompt: prompt || scienceProfile.intakeNotes || 'Build a training week from the athlete constraints.',
      programName: programName || defaultProgramName,
      mode: targetWorkout ? 'single_session' : 'full_program',
      recentTraining: await fetchRecentTrainingSummary(supabase, user.id),
      apiKey: canCallAi ? apiKey : null,
      supabase,
      userId: user.id,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Science engine failed to generate a program' }, { status: 500 });
  }

  const scienceProgram = pipeline.program;
  const persistMethod = persistableGenerationMethod(pipeline.method);
  const qualityWarnings = pipeline.qualityWarnings;
  const aiError = pipeline.aiError;
  const replacedDays = pipeline.replacedDays;

  const config: GenerationConfig = {
    prompt: prompt || scienceProgram.summary,
    weeks,
    days,
    dayTypes,
    focusMuscles,
    programName: programName || scienceProgram.name || defaultProgramName,
    mode,
    teamId,
    includeCooldown,
    availableEquipment: scienceProfile.availableEquipment,
    startDate: startDateRaw || undefined,
    generationMethod: persistMethod,
    scienceVersion: SCIENCE_ENGINE_VERSION,
  };

  let plan = scienceProgramToAiPlan(scienceProgram, config);
  if (pipeline.run.program?.summary) plan.program_summary = String(pipeline.run.program.summary);
  if (pipeline.run.program?.coaching_notes) plan.coaching_notes = String(pipeline.run.program.coaching_notes);
  const builtinCatalog = builtinCatalogItems(catalog || []);

  let programId: string | null = null;
  let persistError: string | null = null;

  if (targetWorkout) {
    const persist = await persistExercisesOntoWorkout(
      supabase,
      targetWorkout.id,
      plan,
      builtinCatalog,
      targetWorkout.day_label
    );
    programId = targetWorkout.program_id;
    persistError = persist.error;
  } else if (existingProgramId && existingProgram) {
    const { data: existingWorkouts } = await supabase
      .from('st_workouts')
      .select('id')
      .eq('program_id', existingProgramId);
    const existingWorkoutIds = (existingWorkouts || []).map((w: { id: string }) => w.id);
    if (existingWorkoutIds.length) {
      const { data: existingExercises } = await supabase
        .from('st_exercises')
        .select('id')
        .in('workout_id', existingWorkoutIds);
      if (existingExercises?.length) {
        const canReplace = structuredIntake && (await programHasNoSetLogs(supabase, existingExercises.map((row: { id: string }) => row.id)));
        if (!canReplace) {
          return NextResponse.json(
            { error: 'This program already has workouts. Open it in Programs to view or edit them, or create a new program.' },
            { status: 409 }
          );
        }
      }
      await supabase.from('st_workouts').delete().eq('program_id', existingProgramId);
    }
    await supabase.from('st_program_activities').delete().eq('program_id', existingProgramId);

    // Never persist more weeks than the program cycle length.
    plan = {
      ...plan,
      workouts: (plan.workouts || []).filter((w) => Number(w.week) >= 1 && Number(w.week) <= weeks),
    };

    const persist = await persistWorkoutsOntoProgram(supabase, existingProgramId, plan, config, builtinCatalog);
    programId = persist.programId;
    persistError = persist.error;
    if (programId) {
      const startMonday = snapStartToMonday(
        String(existingProgram.start_date || startDateRaw || new Date().toISOString().slice(0, 10)).slice(0, 10)
      ).startDate;
      await updateDesignProgram(supabase, programId, {
        generation_method: persistMethod,
        science_version: SCIENCE_ENGINE_VERSION,
        program_summary: plan.program_summary,
        coaching_notes: plan.coaching_notes || null,
        program_style: plan.program_style || null,
        status: 'active',
        weeks,
        cycle_length_weeks: weeks,
        end_date: cycleEndDate(startMonday, weeks),
      });
      const { data: workouts } = await supabase
        .from('st_workouts')
        .select('id, week, day_label, workout_type, day_order')
        .eq('program_id', programId);
      await createActivitiesFromWorkouts(supabase, programId, workouts || []);
    }
  } else {
    const persist = await persistAiProgramPlan(supabase, user.id, plan, config, builtinCatalog);
    programId = persist.programId;
    persistError = persist.error;
  }

  if (persistError || !programId) {
    return NextResponse.json({ error: persistError || 'Failed to save program' }, { status: 500 });
  }
  await attachGenerationRunProgram(supabase, pipeline.generationRunId, programId);

  try {
    await supabase.from('st_muscle_weekly_targets').insert(
      scienceProgram.volumeTargets.map((t) => ({
        program_id: programId,
        week_number: 1,
        muscle_group: t.muscle,
        target_sets: t.targetSets,
        priority: t.priority,
      }))
    );
  } catch {
    /* table may not exist until migration 044 */
  }

  return NextResponse.json({
    programId,
    workoutId: targetWorkout?.id || null,
    program_summary: plan.program_summary,
    coaching_notes: plan.coaching_notes || '',
    program_name: programName || plan.program_name || defaultProgramName,
    workout_count: targetWorkout ? 1 : plan.workouts.length,
    generation_method: pipeline.method,
    generation_run_id: pipeline.generationRunId,
    science_version: SCIENCE_ENGINE_VERSION,
    volume_targets: scienceProgram.volumeTargets,
    validation_warnings: qualityWarnings,
    ai_error: aiError,
    replaced_days: replacedDays,
  });
}

function persistableGenerationMethod(method: string): GenerationConfig['generationMethod'] {
  if (method === 'science_fallback') return 'template';
  return 'ai';
}

async function programHasNoSetLogs(supabase: any, exerciseIds: string[]): Promise<boolean> {
  if (!exerciseIds.length) return true;
  const { data: planned } = await supabase.from('st_planned_sets').select('id').in('exercise_id', exerciseIds);
  const plannedIds = (planned || []).map((row: { id: string }) => row.id);
  if (plannedIds.length) {
    const { count } = await supabase.from('st_set_logs').select('id', { count: 'exact', head: true }).in('planned_set_id', plannedIds);
    if (count) return false;
  }
  const { count: extraCount, error: extraErr } = await supabase
    .from('st_set_logs')
    .select('id', { count: 'exact', head: true })
    .in('exercise_id', exerciseIds)
    .eq('is_extra_set', true);
  if (extraErr && /is_extra_set|does not exist/i.test(extraErr.message || '')) return true;
  return !extraCount;
}

async function fetchRecentTrainingSummary(supabase: any, userId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 56);
  try {
    const { data, error } = await supabase
      .from('st_set_logs')
      .select('snapshot_exercise_name, actual_weight, log_date, completed')
      .eq('user_id', userId)
      .eq('completed', true)
      .gte('log_date', since.toISOString().slice(0, 10))
      .order('log_date', { ascending: false })
      .limit(120);
    if (error) return [];
    return summarizeRecentLogs(data);
  } catch {
    return [];
  }
}
