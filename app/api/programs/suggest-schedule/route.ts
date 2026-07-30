import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import {
  buildScheduleSuggestionPrompt,
  parseScheduleSuggestion,
} from '../../../../lib/training/scheduleSuggestion';
import { normalizeEquipmentList } from '../../../../lib/training/equipmentFilter';

export const runtime = 'nodejs';

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

  const goalsPrompt = String(body?.goalsPrompt || '').trim();
  if (!goalsPrompt || goalsPrompt.length < 8) {
    return NextResponse.json({ error: 'Provide your goals (at least 8 characters)' }, { status: 400 });
  }
  if (goalsPrompt.length > 6000) {
    return NextResponse.json({ error: 'Goals text is too long (max 6000 characters)' }, { status: 400 });
  }

  let includeCardio: boolean | null = null;
  if (body?.includeCardio === true) includeCardio = true;
  else if (body?.includeCardio === false) includeCardio = false;

  let includeMobility: boolean | null = null;
  if (body?.includeMobility === true) includeMobility = true;
  else if (body?.includeMobility === false) includeMobility = false;

  const { data: profile } = await supabase
    .from('st_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const availableEquipment = Array.isArray(body?.availableEquipment)
    ? body.availableEquipment.map(String)
    : normalizeEquipmentList(profile?.available_equipment);

  const { system, user: userContent } = buildScheduleSuggestionPrompt(
    goalsPrompt,
    profile,
    includeCardio,
    includeMobility,
    availableEquipment
  );
  const openai = new OpenAI({ apiKey });

  let rawContent = '';
  let lastValidateError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: attempt === 0 ? 0.6 : 0.35,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content:
              attempt === 0
                ? userContent
                : `${userContent}\n\nYour previous JSON failed validation (${lastValidateError}). Return corrected JSON only. Use exact day labels Mon–Sun and day_types Lower Body, Upper Body, Full Body, Cardio, or Mobility.`,
          },
        ],
      });
      rawContent = completion.choices[0]?.message?.content || '';
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'OpenAI request failed' }, { status: 502 });
    }

    if (!rawContent) {
      lastValidateError = 'Empty response from AI';
      continue;
    }

    const { suggestion, error: validateError } = parseScheduleSuggestion(rawContent);
    if (!validateError && suggestion) {
      return NextResponse.json(suggestion);
    }
    lastValidateError = validateError || 'Invalid schedule suggestion';
  }

  return NextResponse.json(
    { error: lastValidateError || 'Invalid schedule suggestion' },
    { status: 422 },
  );
}
