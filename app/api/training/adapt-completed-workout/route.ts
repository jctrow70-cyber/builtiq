import { NextResponse } from 'next/server';
import { createSupabaseFromRequest, requireAuthUser } from '../../../../lib/supabaseServer';
import { runCompletedWorkoutAdaptation } from '../../../../lib/training/adaptationOrchestration';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const { supabase, token } = createSupabaseFromRequest(request);
    const { user, error: authError } = await requireAuthUser(supabase, token);
    if (!user) {
      return NextResponse.json({ error: authError || 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const workoutId = String(body?.workout_id || '').trim();
    const logDate = String(body?.log_date || '').trim();
    // Ownership comes from the JWT only. Ignore any client-supplied user_id.
    if (!workoutId || !/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
      return NextResponse.json({ error: 'workout_id and log_date (YYYY-MM-DD) are required' }, { status: 400 });
    }
    const result = await runCompletedWorkoutAdaptation({
      supabase,
      userId: user.id,
      workoutId,
      logDate,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      {
        triggered: true,
        pending_retry: true,
        error: err?.message || 'Adaptation failed',
        summary: 'Workout complete. Adaptation could not finish and can retry safely.',
        evaluated: 0,
        updated: 0,
        held: 0,
        review: 0,
        failed: 1,
        mutations: [],
        results: [],
      },
      { status: 200 }
    );
  }
}
