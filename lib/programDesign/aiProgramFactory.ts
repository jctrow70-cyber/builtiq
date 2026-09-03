import type { SupabaseClient } from '@supabase/supabase-js';
import { createDesignProgram, createProgramActivity } from './programDesignApi';
import type { ActivityDraft, ActivityType, ProgramDesignRecord, ProgramScope } from './types';

/** Same object shape the manual Program Builder creates — AI can emit this later. */
export type AiProgramPlan = {
  name: string;
  startDate: string;
  cycleWeeks: number;
  scope?: ProgramScope;
  teamId?: string | null;
  weeks: Array<{
    weekNumber: number;
    days: Array<{
      dayOfWeek: number;
      activities: Array<{
        activity_type: ActivityType;
        title: string;
        duration_minutes?: number | null;
        notes?: string;
        details?: ActivityDraft['details'];
      }>;
    }>;
  }>;
};

export async function createProgramFromPlan(
  supabase: SupabaseClient,
  ownerUserId: string,
  plan: AiProgramPlan
): Promise<{ data: ProgramDesignRecord | null; error: string | null }> {
  const { data, error } = await createDesignProgram(supabase, {
    ownerUserId,
    name: plan.name,
    startDate: plan.startDate,
    cycleWeeks: plan.cycleWeeks,
    scope: plan.scope || 'personal',
    teamId: plan.teamId,
  });
  if (error || !data) return { data: null, error: error || 'Could not create program from plan' };

  for (const week of plan.weeks || []) {
    for (const day of week.days || []) {
      let sort = 0;
      for (const activity of day.activities || []) {
        const { error: actError } = await createProgramActivity(
          supabase,
          data.id,
          week.weekNumber,
          day.dayOfWeek,
          {
            activity_type: activity.activity_type,
            title: activity.title,
            duration_minutes: activity.duration_minutes ?? null,
            notes: activity.notes || '',
            details: activity.details || {},
          },
          sort
        );
        if (actError) return { data, error: actError };
        sort += 1;
      }
    }
  }

  return { data, error: null };
}
