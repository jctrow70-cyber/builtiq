import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { buildFoodEstimatePrompt, parseAndValidateFoodEstimate } from '../../../../lib/nutrition/aiFoodEstimate';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

  const description = String(body?.description || '').trim();
  if (description.length < 4) {
    return NextResponse.json({ error: 'Describe your food in a few words (at least 4 characters).' }, { status: 400 });
  }
  if (description.length > 500) {
    return NextResponse.json({ error: 'Description is too long (max 500 characters).' }, { status: 400 });
  }

  const mealType = String(body?.meal_type || '').trim() || undefined;
  const { system, user: userContent } = buildFoodEstimatePrompt(description, mealType);

  const openai = new OpenAI({ apiKey });
  let rawContent = '';

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.25,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
    });
    rawContent = completion.choices[0]?.message?.content || '';
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'OpenAI request failed' }, { status: 502 });
  }

  if (!rawContent) {
    return NextResponse.json({ error: 'Empty response from AI' }, { status: 502 });
  }

  const { result, error } = parseAndValidateFoodEstimate(rawContent);
  if (error || !result) {
    return NextResponse.json({ error: error || 'Invalid AI estimate' }, { status: 422 });
  }

  return NextResponse.json(result);
}
