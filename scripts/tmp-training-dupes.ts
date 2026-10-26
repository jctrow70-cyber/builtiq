import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.log('missing supabase env');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });

async function main() {

const today = new Date();
const monday = new Date(today);
const day = monday.getDay();
const delta = day === 0 ? -6 : 1 - day;
monday.setDate(monday.getDate() + delta);
const from = monday.toISOString().slice(0, 10);
const toDate = new Date(monday);
toDate.setDate(toDate.getDate() + 27);
const to = toDate.toISOString().slice(0, 10);

const expectations = await admin
  .from('st_training_expectations')
  .select('id, user_id, source_key, program_id, workout_id, scheduled_date, title, origin, excused')
  .gte('scheduled_date', from)
  .lte('scheduled_date', to)
  .limit(2000);
if (expectations.error) {
  console.log('expectations error', expectations.error.message);
  process.exit(1);
}
const rows = expectations.data || [];
const byDay = new Map<string, typeof rows>();
for (const row of rows) {
  const key = `${row.user_id}|${row.scheduled_date}`;
  const list = byDay.get(key) || [];
  list.push(row);
  byDay.set(key, list);
}
const dupes = [...byDay.entries()].filter(([, list]) => {
  const titles = list.map((row) => String(row.title || '').trim().toLowerCase());
  return titles.some((title, index) => titles.indexOf(title) !== index);
});
console.log(JSON.stringify({
  range: { from, to },
  expectationRows: rows.length,
  daysWithSameTitle: dupes.length,
  samples: dupes.slice(0, 12).map(([key, list]) => ({
    key: key.slice(0, 8) + '…|' + key.split('|')[1],
    items: list.map((row) => ({
      title: row.title,
      source: row.source_key,
      origin: row.origin,
      workout: row.workout_id ? String(row.workout_id).slice(0, 8) : null,
      program: row.program_id ? String(row.program_id).slice(0, 8) : null,
    })),
  })),
}, null, 2));

const profiles = await admin.from('st_profiles').select('user_id, display_name, followed_program_id').limit(50);
const names = new Map((profiles.data || []).map((row) => [row.user_id, row.display_name || '']));
const followed = (profiles.data || []).filter((row) => row.followed_program_id);
console.log('profiles', (profiles.data || []).length, 'followed', followed.length);
const jesse = (profiles.data || []).find((row) => row.display_name === 'Jesse Trowbridge');
if (jesse) {
  const programs = await admin.from('st_programs').select('id, name, weeks, start_date, visibility, owner_user_id, source_program_id, status, team_id').in('id', [jesse.followed_program_id, '370fe416-1f1e-4314-a79f-0f209b260b4c']);
  const ids = (programs.data || []).map((row) => row.id);
  const workouts = await admin.from('st_workouts').select('id, program_id, week, day_label, day_order, workout_type').in('program_id', ids);
  const expectationsForJesse = await admin.from('st_training_expectations').select('scheduled_date, title, workout_id, program_id, source_key, origin').eq('user_id', jesse.user_id).gte('scheduled_date', '2026-10-19').lte('scheduled_date', '2026-11-02').order('scheduled_date');
  console.log(JSON.stringify({
    jessePrograms: programs.data,
    jesseWorkouts: (workouts.data || []).map((row) => ({ program: String(row.program_id).slice(0, 8), week: row.week, day: row.day_label, title: row.workout_type })),
    jesseExpectations: expectationsForJesse.data,
  }, null, 2));
}

for (const profile of followed.slice(0, 15)) {
  const program = await admin.from('st_programs').select('id, name, weeks, cycle_length_weeks, start_date, visibility').eq('id', profile.followed_program_id).maybeSingle();
  const activities = await admin.from('st_program_activities').select('id, week_number, day_of_week, title, workout_id, activity_type').eq('program_id', profile.followed_program_id);
  const workouts = await admin.from('st_workouts').select('id, week, day_label, workout_type').eq('program_id', profile.followed_program_id);
  const enrollments = await admin.from('st_training_enrollments').select('id, source_key, program_id, status, schedule_visible, expectation_enabled, starts_on').eq('user_id', profile.user_id).neq('status', 'ended');
  const acts = activities.data || [];
  const works = workouts.data || [];
  const linked = new Set(acts.map((row) => row.workout_id).filter(Boolean));
  const unlinkedWorkouts = works.filter((row) => !linked.has(row.id));
  const dayKeys = new Map<string, number>();
  for (const row of acts) {
    const key = `${row.week_number}|${row.day_of_week}|${String(row.title || '').trim().toLowerCase()}`;
    dayKeys.set(key, (dayKeys.get(key) || 0) + 1);
  }
  const repeatedActivities = [...dayKeys.entries()].filter(([, count]) => count > 1);
  console.log(JSON.stringify({
    name: names.get(profile.user_id) || 'user',
    program: program.data,
    activities: acts.length,
    workouts: works.length,
    unlinkedWorkouts: unlinkedWorkouts.length,
    repeatedActivityTitles: repeatedActivities.slice(0, 6),
    enrollments: enrollments.data,
  }));
}
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
