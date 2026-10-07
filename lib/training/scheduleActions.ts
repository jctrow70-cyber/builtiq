import type { SupabaseClient } from '@supabase/supabase-js';
import { todayYmd } from './programCalendar';

export function scheduleSetupMissing(message: string | undefined): boolean {
  return /does not exist|could not find|schema cache|st_training_expectations|st_training_enrollments|st_repair_followed_training_schedule|st_group_schedule_adherence/i.test(
    message || ''
  );
}

export async function repairFollowedTrainingSchedule(supabase: SupabaseClient, localToday = todayYmd()) {
  const { error } = await supabase.rpc('st_repair_followed_training_schedule', { p_local_today: localToday });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}

export async function activateFollowedProgram(supabase: SupabaseClient, programId: string, localToday = todayYmd()) {
  const { error } = await supabase.rpc('st_activate_followed_program', {
    p_program_id: programId,
    p_effective_on: localToday,
  });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}

export async function refreshProgramExpectations(supabase: SupabaseClient, programId: string, localToday = todayYmd()) {
  const { error } = await supabase.rpc('st_refresh_program_expectations', {
    p_program_id: programId,
    p_effective_on: localToday,
  });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}

export async function setEnrollmentScheduleVisible(supabase: SupabaseClient, enrollmentId: string, visible: boolean) {
  const { error } = await supabase.rpc('st_set_enrollment_schedule_visible', {
    p_enrollment_id: enrollmentId,
    p_visible: visible,
  });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}

export async function setEnrollmentExpectation(
  supabase: SupabaseClient,
  enrollmentId: string,
  enabled: boolean,
  localToday = todayYmd()
) {
  const { error } = await supabase.rpc('st_set_enrollment_expectation', {
    p_enrollment_id: enrollmentId,
    p_enabled: enabled,
    p_effective_on: localToday,
  });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}

export async function withdrawAssignmentExpectation(
  supabase: SupabaseClient,
  recipientId: string,
  localToday = todayYmd()
) {
  const { error } = await supabase.rpc('st_withdraw_assignment_expectation', {
    p_recipient_id: recipientId,
    p_effective_on: localToday,
  });
  return { error: error?.message || null, pending: scheduleSetupMissing(error?.message) };
}
