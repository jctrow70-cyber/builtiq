import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { persistAiProgramPlan, persistWorkoutsOntoProgram, type GenerationConfig } from '../../../../lib/training/aiProgramPlan';
import { inferScheduleFromPrompt } from '../../../../lib/programDesign/inferSchedule';
import { createActivitiesFromWorkouts, updateDesignProgram } from '../../../../lib/programDesign/programDesignApi';
import { fetchAllExerciseCatalog } from '../../../../lib/training/catalogFetch';
import { builtinCatalogItems } from '../../../../lib/training/catalogSearch';
import { normalizeEquipmentList } from '../../../../lib/training/equipmentFilter';
import {
  SCIENCE_ENGINE_VERSION,
  buildScienceCoachPrompt,
  generateProgram,
  scienceProgramToAiPlan,
  trainingProfileFromSources,
  validateProgram,
} from '../../../../lib/scienceEngine';

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

  const weeks = Math.max(1, Math.min(12, Number(body?.weeks) || 6));
  const promptSchedule = inferScheduleFromPrompt(prompt);
  const dayTypes: Record<string, string> =
    promptSchedule.named && Object.keys(promptSchedule.dayTypes).length
      ? promptSchedule.dayTypes
      : body?.dayTypes && typeof body.dayTypes === 'object'
        ? body.dayTypes
        : {};
  const days = promptSchedule.named ? normalizeDays(promptSchedule.days) : normalizeDays(body?.days);
  const mode = body?.mode === 'team' ? 'team' : 'personal';
  const teamId = body?.teamId ? String(body.teamId) : null;
  const focusMuscles = Array.isArray(body?.focusMuscles) ? body.focusMuscles.map(String) : [];
  const programName = body?.programName ? String(body.programName).trim() : '';
  const defaultProgramName = 'BuiltIQ Training Program';
  const includeCooldown = body?.includeCooldown !== false;
  const startDateRaw = body?.startDate ? String(body.startDate).slice(0, 10) : null;

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
      sessionMinutes: body?.sessionMinutes,
      primaryGoal: body?.primaryGoal,
      experienceLevel: body?.experienceLevel,
    },
  });

  let scienceProgram;
  try {
    scienceProgram = generateProgram(scienceProfile, catalog || []);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Science engine failed to generate a program' }, { status: 500 });
  }

  const validation = validateProgram(scienceProgram, scienceProfile);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: 'Science engine validation failed',
        issues: validation.issues,
      },
      { status: 422 }
    );
  }

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
    generationMethod: 'science',
    scienceVersion: SCIENCE_ENGINE_VERSION,
  };

  let plan = scienceProgramToAiPlan(scienceProgram, config);
  let generationMethod: 'science' | 'science_ai' = 'science';

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey && prompt.length >= 8) {
    try {
      const { system, user: userContent } = buildScienceCoachPrompt(scienceProgram, scienceProfile, prompt);
      const openai = new OpenAI({ apiKey, timeout: 20_000 });
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 1200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
      });
      const raw = completion.choices[0]?.message?.content || '';
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.summary) plan.program_summary = String(parsed.summary);
      if (parsed?.coaching_notes || parsed?.explanation) {
        plan.coaching_notes = String(parsed.coaching_notes || parsed.explanation);
      }
      generationMethod = 'science_ai';
    } catch {
      generationMethod = 'science';
    }
  }

  config.generationMethod = generationMethod;
  const builtinCatalog = builtinCatalogItems(catalog || []);
  const existingProgramId = body?.existingProgramId ? String(body.existingProgramId) : '';

  let programId: string | null = null;
  let persistError: string | null = null;

  if (existingProgramId) {
    const { data: existing, error: existingError } = await supabase
      .from('st_programs')
      .select('id, owner_user_id, team_id, visibility')
      .eq('id', existingProgramId)
      .maybeSingle();
    if (existingError || !existing) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }
    const owns = existing.owner_user_id === user.id;
    if (!owns && existing.visibility === 'team' && existing.team_id) {
      const { data: membership } = await supabase
        .from('st_team_members')
        .select('role')
        .eq('team_id', existing.team_id)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (!membership || !['owner', 'editor', 'manager'].includes(membership.role)) {
        return NextResponse.json({ error: 'You cannot edit this program' }, { status: 403 });
      }
    } else if (!owns) {
      return NextResponse.json({ error: 'You cannot edit this program' }, { status: 403 });
    }

    const { data: existingWorkouts } = await supabase
      .from('st_workouts')
      .select('id')
      .eq('program_id', existingProgramId);
    const existingWorkoutIds = (existingWorkouts || []).map((w: { id: string }) => w.id);
    if (existingWorkoutIds.length) {
      const { data: existingExercises } = await supabase
        .from('st_exercises')
        .select('id')
        .in('workout_id', existingWorkoutIds)
        .limit(1);
      if (existingExercises?.length) {
        return NextResponse.json(
          { error: 'This program already has workouts. Open it in Programs to view or edit them, or create a new program.' },
          { status: 409 }
        );
      }
      await supabase.from('st_workouts').delete().eq('program_id', existingProgramId);
    }
    await supabase.from('st_program_activities').delete().eq('program_id', existingProgramId);

    const persist = await persistWorkoutsOntoProgram(supabase, existingProgramId, plan, config, builtinCatalog);
    programId = persist.programId;
    persistError = persist.error;
    if (programId) {
      await updateDesignProgram(supabase, programId, {
        generation_method: generationMethod,
        science_version: SCIENCE_ENGINE_VERSION,
        program_summary: plan.program_summary,
        coaching_notes: plan.coaching_notes || null,
        program_style: plan.program_style || null,
        status: 'active',
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
    program_summary: plan.program_summary,
    coaching_notes: plan.coaching_notes || '',
    program_name: programName || plan.program_name || defaultProgramName,
    workout_count: plan.workouts.length,
    generation_method: generationMethod,
    science_version: SCIENCE_ENGINE_VERSION,
    volume_targets: scienceProgram.volumeTargets,
    validation_warnings: validation.issues.filter((i) => i.severity === 'warning'),
  });
}
