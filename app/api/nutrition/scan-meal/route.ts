import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  buildMealPhotoPrompt,
  parseMealPhotoResponse,
  validateMealPhotoImage,
} from '../../../../lib/nutrition/mealPhotoEstimate';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';
export const maxDuration = 45;

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

  const mimeType = String(body?.mime_type || 'image/jpeg').toLowerCase();
  const imageBase64 = String(body?.image_base64 || '').replace(/^data:[^;]+;base64,/, '').trim();
  const mealType = String(body?.meal_type || '').trim() || undefined;

  if (!imageBase64) {
    return NextResponse.json({ error: 'Upload a photo of your meal.' }, { status: 400 });
  }

  let byteLength: number;
  try {
    byteLength = Buffer.from(imageBase64, 'base64').byteLength;
  } catch {
    return NextResponse.json({ error: 'Invalid image data.' }, { status: 400 });
  }

  const imageError = validateMealPhotoImage(mimeType, byteLength);
  if (imageError) {
    return NextResponse.json({ error: imageError }, { status: 400 });
  }

  const { system, user: userContent } = buildMealPhotoPrompt(mealType);
  const openai = new OpenAI({ apiKey });
  let rawContent = '';

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 900,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: userContent },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' },
            },
          ],
        },
      ],
    });
    rawContent = completion.choices[0]?.message?.content || '';
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Vision request failed' }, { status: 502 });
  }

  if (!rawContent) {
    return NextResponse.json({ error: 'Empty response from vision model' }, { status: 502 });
  }

  const { result, error } = parseMealPhotoResponse(rawContent);
  if (error || !result) {
    return NextResponse.json({ error: error || 'Could not estimate meal from photo' }, { status: 422 });
  }

  return NextResponse.json(result);
}
