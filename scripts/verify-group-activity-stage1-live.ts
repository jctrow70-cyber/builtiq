/**
 * BIQ-0263 Stage 1 live authorization checks.
 * Creates disposable users, calls st_save_group_activity as each role, then deletes them.
 * Does not apply SQL. Does not change existing enrollments, expectations, sessions, or set logs.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/verify-group-activity-stage1-live.ts
 * Keep the fixture for browser QA: add --keep
 * Remove a kept fixture: add --cleanup
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { fetchGroupExtras } from '../lib/groups/groupActivities';
import { buildGroupCalendar } from '../lib/groups/groupCalendar';
import { buildGroupTrainingBoard, extraActivityLabel, requiredExtraStanding } from '../lib/groups/trainingWorkspace';
import { mondayOfWeek, todayYmd } from '../lib/training/programCalendar';

const FIXTURE = path.join(os.tmpdir(), 'biq0263-stage1-qa.json');
const TABLES = [
  'st_training_expectations',
  'st_training_enrollments',
  'st_workout_sessions',
  'st_set_logs',
  'st_program_assignments',
  'st_workout_assignments',
  'st_user_calendar_activities',
] as const;

type RoleName = 'owner' | 'manager' | 'member' | 'assigner' | 'outsider';
type Check = { name: string; ok: boolean; detail?: string };

function loadEnvLocal() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function client(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function countRows(admin: SupabaseClient, table: string) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
  if (error) throw new Error(`${table} count: ${error.message}`);
  return count || 0;
}

async function snapshot(admin: SupabaseClient) {
  const rows: Record<string, number> = {};
  for (const table of TABLES) rows[table] = await countRows(admin, table);
  return rows;
}

async function sweepQaUsers(admin: SupabaseClient) {
  for (let page = 1; page <= 5; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (listed.error) return;
    const stale = (listed.data.users || []).filter((user) => /^biq0263\.[a-z]+\.\d+@builtiq\.test$/i.test(user.email || ''));
    for (const user of stale) await admin.auth.admin.deleteUser(user.id);
    if ((listed.data.users || []).length < 200) break;
  }
}

async function insertTeam(
  admin: SupabaseClient,
  input: { name: string; inviteCode: string; ownerId: string; membersCanAssign: boolean }
) {
  const inserted = await admin.from('st_teams').insert({
    name: input.name,
    invite_code: input.inviteCode,
    owner_user_id: input.ownerId,
    members_can_assign_workouts: input.membersCanAssign,
  }).select('id').single();
  if (!inserted.error && inserted.data?.id) return inserted.data.id as string;
  const message = inserted.error?.message || 'team insert failed';
  if (/st_group_quick_join_team_id_fkey/i.test(message)) {
    throw new Error('Could not create a disposable group. The Quick Join trigger writes its row before the team exists, so the foreign key rejects the insert.');
  }
  throw new Error(message);
}

async function seriesCount(admin: SupabaseClient, teamId: string) {
  const { count, error } = await admin.from('st_group_activity_series').select('*', { count: 'exact', head: true }).eq('team_id', teamId);
  if (error) throw new Error(error.message);
  return count || 0;
}

async function save(actor: SupabaseClient, input: Record<string, unknown>) {
  const { data, error } = await actor.rpc('st_save_group_activity', input);
  return { data: data as { series_id?: string } | null, error: error?.message || null };
}

async function main() {
  loadEnvLocal();
  const cleanupOnly = process.argv.includes('--cleanup');
  const keep = process.argv.includes('--keep');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) throw new Error('Supabase URL and keys are missing from .env.local');
  const admin = client(url, serviceKey);

  if (cleanupOnly) {
    if (!fs.existsSync(FIXTURE)) throw new Error('No kept Stage 1 fixture to clean up.');
    const saved = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) as { teamIds: string[]; userIds: string[]; baseline: Record<string, number> };
    await removeFixture(admin, saved.teamIds, saved.userIds);
    const after = await snapshot(admin);
    const drifted = TABLES.filter((table) => after[table] !== saved.baseline[table]);
    if (drifted.length) {
      console.error(JSON.stringify({ status: 'cleanup-drift', drifted, baseline: saved.baseline, after }));
      process.exit(1);
    }
    fs.unlinkSync(FIXTURE);
    console.log(JSON.stringify({ status: 'cleaned', countsMatchBaseline: true }));
    return;
  }

  const checks: Check[] = [];
  const fail = (name: string, detail?: string) => checks.push({ name, ok: false, detail });
  const pass = (name: string, detail?: string) => checks.push({ name, ok: true, detail });
  const expect = (name: string, ok: boolean, detail?: string) => (ok ? pass(name, detail) : fail(name, detail));

  await sweepQaUsers(admin);
  const baseline = await snapshot(admin);
  const stamp = Date.now();
  const password = `Biq0263!${stamp}`;
  const today = todayYmd();
  const past = mondayOfWeek(today);
  const names: RoleName[] = ['owner', 'manager', 'member', 'assigner', 'outsider'];
  const emails = Object.fromEntries(names.map((role) => [role, `biq0263.${role}.${stamp}@builtiq.test`])) as Record<RoleName, string>;
  const userIds: Partial<Record<RoleName, string>> = {};
  const actors: Partial<Record<RoleName, SupabaseClient>> = {};
  const teamIds: string[] = [];
  let retain = false;

  try {
    for (const role of names) {
      const created = await admin.auth.admin.createUser({ email: emails[role], password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error(created.error?.message || `Could not create ${role}`);
      userIds[role] = created.data.user.id;
      const profile = await admin.from('st_profiles').upsert({
        user_id: created.data.user.id,
        display_name: `QA ${role}`,
        profile_completed: true,
        height_inches: 70,
        weight_lbs: 180,
      }, { onConflict: 'user_id' });
      if (profile.error) throw new Error(profile.error.message);
      const actor = client(url, anonKey);
      const signed = await actor.auth.signInWithPassword({ email: emails[role], password });
      if (signed.error) throw new Error(`${role} sign-in: ${signed.error.message}`);
      actors[role] = actor;
    }

    const ownerId = userIds.owner as string;
    const managerId = userIds.manager as string;
    const memberId = userIds.member as string;
    const assignerId = userIds.assigner as string;
    const outsiderId = userIds.outsider as string;
    const owner = actors.owner as SupabaseClient;
    const manager = actors.manager as SupabaseClient;
    const member = actors.member as SupabaseClient;
    const assigner = actors.assigner as SupabaseClient;
    const outsider = actors.outsider as SupabaseClient;

    const teamId = await insertTeam(admin, {
      name: `BIQ-0263 QA ${stamp}`,
      inviteCode: `Q${stamp}`.slice(0, 16),
      ownerId,
      membersCanAssign: false,
    });
    teamIds.push(teamId);
    const assignTeamId = await insertTeam(admin, {
      name: `BIQ-0263 QA assign ${stamp}`,
      inviteCode: `A${stamp}`.slice(0, 16),
      ownerId,
      membersCanAssign: true,
    });
    teamIds.push(assignTeamId);

    const members = await admin.from('st_team_members').insert([
      { team_id: teamId, user_id: ownerId, display_name: 'QA owner', role: 'owner', status: 'active' },
      { team_id: teamId, user_id: managerId, display_name: 'QA manager', role: 'manager', status: 'active' },
      { team_id: teamId, user_id: memberId, display_name: 'QA member', role: 'member', status: 'active' },
      { team_id: assignTeamId, user_id: ownerId, display_name: 'QA owner', role: 'owner', status: 'active' },
      { team_id: assignTeamId, user_id: assignerId, display_name: 'QA assigner', role: 'member', status: 'active' },
    ]);
    if (members.error) throw new Error(members.error.message);

    const program = await admin.from('st_programs').insert({
      owner_user_id: ownerId,
      team_id: teamId,
      visibility: 'team',
      name: `BIQ-0263 QA program ${stamp}`,
      weeks: 1,
      status: 'published',
      record_kind: 'template',
    }).select('id').single();
    if (program.error || !program.data) throw new Error(program.error?.message || 'program insert failed');
    const programId = program.data.id as string;
    const workout = await admin.from('st_workouts').insert({
      program_id: programId,
      week: 1,
      day_order: 1,
      day_label: 'Mon',
      workout_type: 'QA Full Body',
    }).select('id').single();
    if (workout.error || !workout.data) throw new Error(workout.error?.message || 'workout insert failed');
    const workoutId = workout.data.id as string;
    const teamUpdate = await admin.from('st_teams').update({ default_program_id: programId }).eq('id', teamId);
    if (teamUpdate.error) throw new Error(teamUpdate.error.message);

    const baseSave = {
      p_duration_minutes: 30,
      p_notes: 'QA',
      p_details: {},
      p_workout_id: null,
      p_program_id: null,
      p_required: false,
    };

    const beforeRejects = await seriesCount(admin, teamId);
    const memberOther = await save(member, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'cardio',
      p_title: 'Other member cardio',
      p_occurrence_date: today,
      p_recipient_user_ids: [managerId],
      p_request_key: `member-other-${stamp}`,
    });
    expect('ordinary member cannot assign to another member', !!memberOther.error && /not authorized/i.test(memberOther.error), memberOther.error || 'saved');
    const memberRequired = await save(member, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'mobility',
      p_title: 'Self required',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `member-required-${stamp}`,
      p_required: true,
    });
    expect('ordinary member cannot mark an extra required', !!memberRequired.error && /required/i.test(memberRequired.error), memberRequired.error || 'saved');
    const outsiderSave = await save(outsider, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'rest',
      p_title: 'Outsider rest',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `outsider-${stamp}`,
    });
    expect('nonmember cannot create a group activity', !!outsiderSave.error && /not authorized/i.test(outsiderSave.error), outsiderSave.error || 'saved');
    const strengthMissing = await save(owner, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'strength',
      p_title: 'Missing workout',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `strength-missing-${stamp}`,
    });
    expect('strength without a program workout is rejected', !!strengthMissing.error, strengthMissing.error || 'saved');
    expect('rejected saves leave no series', (await seriesCount(admin, teamId)) === beforeRejects, `before ${beforeRejects}`);

    const direct = await member.from('st_group_activity_series').insert({
      team_id: teamId,
      activity_type: 'rest',
      title: 'Direct insert',
      start_date: today,
    });
    expect('authenticated clients cannot insert series directly', !!direct.error, direct.error?.message || 'insert succeeded');

    const createdIds: string[] = [];
    for (const activityType of ['cardio', 'mobility', 'stretching', 'recovery', 'sport', 'rest'] as const) {
      const result = await save(member, {
        ...baseSave,
        p_team_id: teamId,
        p_activity_type: activityType,
        p_title: `QA ${activityType}`,
        p_occurrence_date: today,
        p_recipient_user_ids: [memberId],
        p_request_key: `type-${activityType}-${stamp}`,
        p_duration_minutes: activityType === 'rest' ? null : 30,
      });
      expect(`member can add optional ${activityType}`, !result.error && !!result.data?.series_id, result.error || 'missing id');
      if (result.data?.series_id) createdIds.push(result.data.series_id);
    }

    const repeatKey = `repeat-${stamp}`;
    const first = await save(owner, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'cardio',
      p_title: 'QA repeat cardio',
      p_occurrence_date: past,
      p_recipient_user_ids: [memberId],
      p_request_key: repeatKey,
    });
    const second = await save(owner, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'cardio',
      p_title: 'QA repeat cardio changed',
      p_occurrence_date: past,
      p_recipient_user_ids: [memberId],
      p_request_key: repeatKey,
    });
    expect('same request key returns the original series', !!first.data?.series_id && first.data.series_id === second.data?.series_id, second.error || 'ids differ');

    const workoutSave = await save(manager, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'strength',
      p_title: 'QA Full Body',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `workout-${stamp}`,
      p_workout_id: workoutId,
      p_program_id: programId,
    });
    expect('manager can add a team program workout', !workoutSave.error, workoutSave.error || undefined);
    const workoutAgain = await save(manager, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'strength',
      p_title: 'QA Full Body again',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `workout-again-${stamp}`,
      p_workout_id: workoutId,
      p_program_id: programId,
    });
    expect('same program workout cannot be added twice on that date', !!workoutAgain.error && /already on this date/i.test(workoutAgain.error), workoutAgain.error || 'saved');

    const required = await save(manager, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'mobility',
      p_title: 'QA required mobility',
      p_occurrence_date: today,
      p_recipient_user_ids: [memberId],
      p_request_key: `required-open-${stamp}`,
      p_required: true,
    });
    expect('manager can mark an extra required', !required.error, required.error || undefined);
    const requiredPast = await save(owner, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'recovery',
      p_title: 'QA required recovery',
      p_occurrence_date: past === today ? '2026-10-01' : past,
      p_recipient_user_ids: [memberId],
      p_request_key: `required-past-${stamp}`,
      p_required: true,
    });
    expect('owner can add a past required extra', !requiredPast.error, requiredPast.error || undefined);
    if (requiredPast.data?.series_id) {
      const marked = await member.rpc('st_complete_group_activity_occurrence', {
        p_series_id: requiredPast.data.series_id,
        p_user_id: memberId,
        p_original_date: past === today ? '2026-10-01' : past,
      });
      expect('member can complete their own required extra', !marked.error, marked.error?.message);
      const reverted = await admin.from('st_group_activity_occurrences').update({ completed: false }).eq('series_id', requiredPast.data.series_id);
      expect('completed history stays stored', !!reverted.error, 'completed flag was cleared');
    }

    const assignRequired = await save(assigner, {
      ...baseSave,
      p_team_id: assignTeamId,
      p_activity_type: 'sport',
      p_title: 'QA assigned sport',
      p_occurrence_date: today,
      p_recipient_user_ids: [ownerId],
      p_request_key: `assigner-${stamp}`,
      p_required: true,
    });
    expect('member with assign permission can assign a required extra', !assignRequired.error, assignRequired.error || undefined);

    const privateRow = await member.from('st_user_calendar_activities').insert({
      user_id: memberId,
      activity_date: today,
      activity_type: 'cardio',
      title: `QA private ${stamp}`,
    }).select('id').single();
    expect('member can write a personal calendar row', !privateRow.error && !!privateRow.data?.id, privateRow.error?.message);
    const managerReadPrivate = await manager.from('st_user_calendar_activities').select('id, title').eq('user_id', memberId);
    expect('manager cannot read another user personal calendar', !managerReadPrivate.error && (managerReadPrivate.data || []).length === 0, managerReadPrivate.error?.message || `rows ${(managerReadPrivate.data || []).length}`);
    const outsiderReadGroup = await outsider.from('st_group_activity_occurrences').select('id, user_id').eq('user_id', memberId);
    expect('nonmember cannot read group occurrences', !outsiderReadGroup.error && (outsiderReadGroup.data || []).length === 0, outsiderReadGroup.error?.message || `rows ${(outsiderReadGroup.data || []).length}`);

    const memberExtras = await fetchGroupExtras(member, { teamId, from: '2026-01-01', to: '2026-12-31', userId: memberId });
    const ownerExtras = await fetchGroupExtras(owner, { teamId, from: '2026-01-01', to: '2026-12-31' });
    expect('member sees their own extras', memberExtras.length >= 6, String(memberExtras.length));
    expect('owner sees the member extras', ownerExtras.length >= memberExtras.length, `${ownerExtras.length} vs ${memberExtras.length}`);
    const hidden = ownerExtras.find((row) => row.userId === managerId);
    const managerOnly = await save(manager, {
      ...baseSave,
      p_team_id: teamId,
      p_activity_type: 'rest',
      p_title: 'QA manager rest',
      p_occurrence_date: today,
      p_recipient_user_ids: [managerId],
      p_request_key: `manager-rest-${stamp}`,
    });
    expect('manager can add an extra for themselves', !managerOnly.error, managerOnly.error || undefined);
    const memberAfter = await fetchGroupExtras(member, { teamId, from: '2026-01-01', to: '2026-12-31' });
    expect('ordinary member cannot read another member extra', !memberAfter.some((row) => row.title === 'QA manager rest'), hidden ? 'unexpected' : 'hidden');
    expect('different activities share one date', memberExtras.filter((row) => row.date === today).length >= 6, String(memberExtras.filter((row) => row.date === today).length));

    const pastDate = past === today ? '2026-10-01' : past;
    const standingRows = ownerExtras.filter((row) => row.userId === memberId);
    const openRow = standingRows.find((row) => row.title === 'QA required mobility');
    const pastRow = standingRows.find((row) => row.title === 'QA required recovery');
    expect('required extra standing is open', !!openRow && requiredExtraStanding(openRow, today) === 'open', openRow ? requiredExtraStanding(openRow, today) : 'missing');
    expect('required extra standing is not_completed', !!pastRow && requiredExtraStanding({ ...pastRow, date: pastDate, completed: false }, today) === 'not_completed', pastRow ? pastDate : 'missing');
    expect('required extra standing is completed', !!pastRow && requiredExtraStanding({ ...pastRow, completed: true }, today) === 'completed');

    const board = buildGroupTrainingBoard({
      teamId,
      today,
      canManage: true,
      viewerUserId: ownerId,
      members: [{ userId: memberId, name: 'QA member', trainingSource: 'team', isActiveParticipant: true, enrollment: { programId, status: 'active', startsOn: past, expectationEnabled: true } }],
      programs: [{ id: programId, name: 'QA', startDate: past, weeks: 1, visibility: 'team', workouts: [{ id: workoutId, week: 1, dayLabel: 'Mon', dayOrder: 1, title: 'QA Full Body' }] }],
      expectations: [{ userId: memberId, sourceKey: `group:${teamId}`, teamId, origin: 'program', scheduledDate: pastDate, title: 'Existing program workout', dayLabel: 'Mon', workoutId, authoritativeStatus: 'missed' }],
      expectationsAvailable: true,
      completionKnown: true,
      extras: ownerExtras.filter((row) => row.userId === memberId),
    });
    expect('optional and required extras leave program missedCount unchanged', board.members[0].missedCount === 1, String(board.members[0].missedCount));
    const sameDay = board.members[0].weekItems.filter((item) => item.date === today);
    expect('program workout extra and other extras share the member date', sameDay.some((item) => item.workoutId === workoutId) && sameDay.filter((item) => item.origin === 'extra').length >= 2, String(sameDay.length));
    expect('required label is Extra · required', extraActivityLabel(!!sameDay.find((item) => item.title === 'QA required mobility')?.required) === 'Extra · required');

    const calendar = buildGroupCalendar({
      weekStart: mondayOfWeek(today),
      today,
      teamId,
      expectations: [],
      members: [{ userId: memberId, name: 'QA member' }, { userId: managerId, name: 'QA manager' }],
      visibleUserIds: [memberId, managerId],
      completionKnown: true,
      extras: ownerExtras,
    });
    const cards = calendar.days.find((day) => day.date === today)?.workouts || [];
    expect('group calendar places extras on the saved date', cards.some((card) => card.title === 'QA cardio' && card.sourceLabel === 'Extra' && card.memberName === 'QA member'), cards.map((card) => card.title).join(', '));

    const personalAfter = await countRows(admin, 'st_user_calendar_activities');
    expect('group saves did not add personal calendar rows beyond the privacy fixture', personalAfter === baseline.st_user_calendar_activities + (privateRow.data?.id ? 1 : 0), `${baseline.st_user_calendar_activities} -> ${personalAfter}`);
    if (privateRow.data?.id) await admin.from('st_user_calendar_activities').delete().eq('id', privateRow.data.id);

    const mid = await snapshot(admin);
    for (const table of TABLES) {
      if (table === 'st_user_calendar_activities') continue;
      expect(`${table} count is unchanged`, mid[table] === baseline[table], `${baseline[table]} -> ${mid[table]}`);
    }

    const enrollment = await admin.from('st_training_enrollments').insert({
      user_id: memberId,
      source_kind: 'group',
      source_key: `group:${teamId}`,
      team_id: teamId,
      program_id: programId,
      status: 'active',
      starts_on: past,
      expectation_enabled: true,
    }).select('id').single();
    expect('test enrollment can be created for the browser fixture', !enrollment.error && !!enrollment.data?.id, enrollment.error?.message);
    if (enrollment.data?.id) {
      const expectation = await admin.from('st_training_expectations').insert({
        user_id: memberId,
        source_key: `group:${teamId}`,
        team_id: teamId,
        enrollment_id: enrollment.data.id,
        program_id: programId,
        workout_id: workoutId,
        scheduled_date: today,
        title: 'QA Full Body',
        day_label: 'Mon',
        origin: 'program',
        excused: false,
      });
      expect('test expectation can be created for the browser logger', !expectation.error, expectation.error?.message);
    }

    retain = keep && checks.every((check) => check.ok);
    if (retain) {
      fs.writeFileSync(FIXTURE, JSON.stringify({
        email: emails.owner,
        emails,
        password,
        teamName: `BIQ-0263 QA ${stamp}`,
        memberName: 'QA member',
        teamIds,
        userIds: names.map((role) => userIds[role]),
        baseline,
        today,
      }));
    }
  } finally {
    if (!retain) await removeFixture(admin, teamIds, Object.values(userIds).filter((id): id is string => !!id));
  }

  if (!retain) {
    const after = await snapshot(admin);
    for (const table of TABLES) {
      expect(`${table} matches the baseline after cleanup`, after[table] === baseline[table], `${baseline[table]} -> ${after[table]}`);
    }
  }

  const failed = checks.filter((check) => !check.ok);
  console.log(JSON.stringify({ status: failed.length ? 'failed' : 'passed', failed: failed.length, checks }, null, 2));
  if (failed.length) process.exit(1);
}

async function removeFixture(admin: SupabaseClient, teamIds: string[], userIds: string[]) {
  if (userIds.length) {
    const enrollments = await admin.from('st_training_enrollments').select('id').in('user_id', userIds);
    if (enrollments.error) throw new Error(enrollments.error.message);
    for (const enrollment of enrollments.data || []) {
      const withdrawn = await admin.rpc('st_withdraw_future_program_expectations', {
        p_enrollment_id: enrollment.id,
        p_effective_on: '2000-01-01',
      });
      if (withdrawn.error) throw new Error(withdrawn.error.message);
    }
    const expectations = await admin.from('st_training_expectations').delete().in('user_id', userIds);
    if (expectations.error) throw new Error(expectations.error.message);
    const enrollmentDelete = await admin.from('st_training_enrollments').delete().in('user_id', userIds);
    if (enrollmentDelete.error) throw new Error(enrollmentDelete.error.message);
    const calendar = await admin.from('st_user_calendar_activities').delete().in('user_id', userIds);
    if (calendar.error) throw new Error(calendar.error.message);
  }
  if (teamIds.length) {
    const series = await admin.from('st_group_activity_series').delete().in('team_id', teamIds);
    if (series.error) throw new Error(series.error.message);
    const programs = await admin.from('st_programs').delete().in('team_id', teamIds);
    if (programs.error) throw new Error(programs.error.message);
    const members = await admin.from('st_team_members').delete().in('team_id', teamIds);
    if (members.error) throw new Error(members.error.message);
    const teams = await admin.from('st_teams').delete().in('id', teamIds);
    if (teams.error) throw new Error(teams.error.message);
  }
  for (const userId of userIds) {
    const removed = await admin.auth.admin.deleteUser(userId);
    if (removed.error) throw new Error(removed.error.message);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
