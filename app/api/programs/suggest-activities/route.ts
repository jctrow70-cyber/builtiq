import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';

export const runtime = 'nodejs';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

type SuggestedActivity = {
  day: string;
  activity_type: string;
  title: string;
  duration_minutes: number | null;
  notes: string;
  details: Record<string, unknown>;
};

type SuggestActivitiesResponse = {
  activities: SuggestedActivity[];
  coach_message: string;
};

function buildPrompt(description: string, profile: any): { system: string; user: string } {
  const system = `You are BuildIQ Health's program planning assistant. The user will describe what activities they want to do each week in natural language. Parse their description and return a structured weekly activity schedule.

Rules:
1. Output ONLY valid JSON — no markdown fences, no extra text.
2. Map user descriptions to activities on specific days (Mon–Sun).
3. Valid activity_type values: "strength", "cardio", "mobility", "stretching", "recovery", "sport", "rest".
4. When the user says "strength training 3 days a week" without specifying days, pick well-spaced days (e.g. Mon/Wed/Fri).
5. When the user names specific days like "Tuesday Thursday", use those exact days.
6. Give each activity a descriptive title (not just the type). E.g. "Upper Body Strength", "HIIT Cardio", "Full Body Stretch".
7. Assign reasonable durations: strength 45-60 min, cardio 30-45 min, stretching 20-30 min, mobility 20-30 min, sport 60 min.
8. Days with no planned activity should get a "rest" activity.
9. If multiple activities land on the same day, return separate entries for each (they'll stack).
10. coach_message: 2-3 sentences confirming what you understood and any suggestions.
11. Frame as general wellness guidance — not medical advice.

JSON schema:
{
  "coach_message": "string",
  "activities": [
    {
      "day": "Mon",
      "activity_type": "strength",
      "title": "Upper Body Strength",
      "duration_minutes": 45,
      "notes": "",
      "details": {}
    }
  ]
}`;

  const userContent = JSON.stringify({
    description: description.trim(),
    athlete_profile: {
      experience_level: profile?.experience_level || 'beginner',
      primary_goal: profile?.primary_goal || 'general_health',
    },
  });

  return { system, user: userContent };
}

function validateResponse(raw: string): { data: SuggestActivitiesResponse | null; error: string | null } {
  let parsed: any;
  try {
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    parsed = JSON.parse(cleaned);
  } catch {
    return { data: null, error: 'AI response was not valid JSON' };
  }

  if (!parsed?.activities || !Array.isArray(parsed.activities)) {
    return { data: null, error: 'Missing activities array' };
  }

  const dayAliases: Record<string, string> = {
    monday: 'Mon', mon: 'Mon',
    tuesday: 'Tue', tue: 'Tue', tues: 'Tue',
    wednesday: 'Wed', wed: 'Wed',
    thursday: 'Thu', thu: 'Thu', thur: 'Thu', thurs: 'Thu',
    friday: 'Fri', fri: 'Fri',
    saturday: 'Sat', sat: 'Sat',
    sunday: 'Sun', sun: 'Sun',
  };

  const validTypes = new Set(['strength', 'cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest']);

  const activities: SuggestedActivity[] = [];
  for (const row of parsed.activities) {
    const rawDay = String(row?.day || '').trim();
    const day = DAY_LABELS.includes(rawDay as any) ? rawDay : dayAliases[rawDay.toLowerCase()] || null;
    if (!day) continue;

    const actType = String(row?.activity_type || 'strength').toLowerCase();
    const activity_type = validTypes.has(actType) ? actType : 'strength';

    activities.push({
      day,
      activity_type,
      title: String(row?.title || activity_type).trim(),
      duration_minutes: row?.duration_minutes != null ? Number(row.duration_minutes) || null : null,
      notes: String(row?.notes || ''),
      details: row?.details && typeof row.details === 'object' ? row.details : {},
    });
  }

  if (!activities.length) {
    return { data: null, error: 'No valid activities parsed' };
  }

  return {
    data: {
      activities,
      coach_message: String(parsed.coach_message || '').trim(),
    },
    error: null,
  };
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

  const description = String(body?.description || '').trim();
  if (!description || description.length < 8) {
    return NextResponse.json({ error: 'Describe your weekly activities (at least 8 characters)' }, { status: 400 });
  }
  if (description.length > 4000) {
    return NextResponse.json({ error: 'Description is too long (max 4000 characters)' }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from('st_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const { system, user: userContent } = buildPrompt(description, profile);
  const openai = new OpenAI({ apiKey });

  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: attempt === 0 ? 0.5 : 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          {
            role: 'user',
            content: attempt === 0
              ? userContent
              : `${userContent}\n\nPrevious response failed: ${lastError}. Return corrected JSON.`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content || '';
      const { data, error: valError } = validateResponse(raw);
      if (data) {
        return NextResponse.json(data);
      }
      lastError = valError || 'Invalid response';
    } catch (err: any) {
      return NextResponse.json({ error: err?.message || 'OpenAI request failed' }, { status: 502 });
    }
  }

  return NextResponse.json({ error: lastError || 'Could not parse activity suggestions' }, { status: 422 });
}
