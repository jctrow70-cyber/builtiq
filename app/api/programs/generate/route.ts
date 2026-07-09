import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import {
  buildProgramGenerationPrompt,
  isRetryablePlanError,
  parseAndValidateAiPlan,
  persistAiProgramPlan,
  type GenerationConfig,
} from '../../../../lib/training/aiProgramPlan';
import { builtinCatalogItems } from '../../../../lib/training/catalogSearch';

export const runtime = 'nodejs';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function normalizeDays(days: unknown, dayTypes: Record<string, string>): string[] {
  if (!Array.isArray(days) || !days.length) return ['Mon', 'Tue', 'Fri'];
  return days
    .map((d) => String(d))
    .filter((d) => DAY_LABELS.includes(d))
    .sort((a, b) => DAY_LABELS.indexOf(a) - DAY_LABELS.indexOf(b));
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY is not configured on the server' }, { status: 503 });
  }

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
  if (!prompt || prompt.length < 8) {
    return NextResponse.json({ error: 'Provide a program prompt (at least 8 characters)' }, { status: 400 });
  }
  if (prompt.length > 4000) {
    return NextResponse.json({ error: 'Prompt is too long (max 4000 characters)' }, { status: 400 });
  }

  const weeks = Math.max(1, Math.min(12, Number(body?.weeks) || 6));
  const dayTypes: Record<string, string> = body?.dayTypes && typeof body.dayTypes === 'object' ? body.dayTypes : {};
  const days = normalizeDays(body?.days, dayTypes);
  const mode = body?.mode === 'team' ? 'team' : 'personal';
  const teamId = body?.teamId ? String(body.teamId) : null;
  const focusMuscles = Array.isArray(body?.focusMuscles) ? body.focusMuscles.map(String) : [];
  const programName = body?.programName ? String(body.programName) : 'AI Strength Program';
  const includeCooldown = body?.includeCooldown !== false;

  if (mode === 'team') {
    if (!teamId) return NextResponse.json({ error: 'teamId required for team programs' }, { status: 400 });
    const { data: membership } = await supabase
      .from('st_team_members')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (!membership || !['owner', 'editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Only team owners/editors can create team programs' }, { status: 403 });
    }
  }

  const [{ data: profile }, { data: catalog, error: catErr }] = await Promise.all([
    supabase.from('st_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('st_exercise_catalog').select('*').order('name'),
  ]);

  if (catErr) {
    return NextResponse.json({ error: `Failed to load exercise catalog: ${catErr.message}` }, { status: 500 });
  }

  const config: GenerationConfig = {
    prompt,
    weeks,
    days,
    dayTypes,
    focusMuscles,
    programName,
    mode,
    teamId,
    includeCooldown,
  };

  const { system, user: userContent } = buildProgramGenerationPrompt(prompt, profile, catalog || [], config);
  const builtinCatalog = builtinCatalogItems(catalog || []);

  const openai = new OpenAI({ apiKey });
  let rawContent = '';

  const callAi = async (extraSystem?: string) => {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: system },
      { role: 'user', content: userContent },
    ];
    if (extraSystem) messages.push({ role: 'system', content: extraSystem });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.5,
      response_format: { type: 'json_object' },
      messages,
    });
    return completion.choices[0]?.message?.content || '';
  };

  try {
    rawContent = await callAi();
  } catch (err: any) {
    const msg = err?.message || 'OpenAI request failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!rawContent) {
    return NextResponse.json({ error: 'Empty response from AI' }, { status: 502 });
  }

  let { plan, error: validateError } = parseAndValidateAiPlan(rawContent, config, catalog || []);

  if ((validateError || !plan) && isRetryablePlanError(validateError)) {
    try {
      const retryContent = await callAi(
        'Previous plan failed validation. Ensure strength days have warmup with at least 3 items including 2 mobility stretches, cooldown with at least 2 stretches when enabled, at least 6-8 strength exercises per session, and Mobility days have 6+ mobility exercises in strength section.'
      );
      if (retryContent) {
        rawContent = retryContent;
        const retryResult = parseAndValidateAiPlan(rawContent, config, catalog || []);
        if (retryResult.plan) {
          plan = retryResult.plan;
          validateError = null;
        } else {
          validateError = retryResult.error;
        }
      }
    } catch {
      /* keep original validation error */
    }
  }

  if (validateError || !plan) {
    return NextResponse.json({ error: validateError || 'Invalid AI plan' }, { status: 422 });
  }

  const { programId, error: persistError } = await persistAiProgramPlan(supabase, user.id, plan, config, builtinCatalog);
  if (persistError || !programId) {
    return NextResponse.json({ error: persistError || 'Failed to save program' }, { status: 500 });
  }

  return NextResponse.json({
    programId,
    program_summary: plan.program_summary,
    program_name: plan.program_name || programName,
    workout_count: plan.workouts.length,
    generation_method: 'ai',
  });
}
