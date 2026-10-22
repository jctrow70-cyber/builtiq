const fs = require('fs');
function envValue(name) {
  const line = fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).find((row) => row.startsWith(name + '='));
  if (!line) throw new Error('missing ' + name);
  return line.slice(name.length + 1).trim();
}
const base = envValue('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const key = envValue('SUPABASE_SERVICE_ROLE_KEY');
const names = [
  'st_save_group_strength_workout',
  'st_pin_group_strength_history',
  'st_complete_group_activity_occurrence',
  'st_group_schedule_adherence',
  'st_group_extra_occupies_date',
  'st_program_expectation_occupies_date',
  'st_group_series_conflicts_with_program',
  'st_reject_group_program_extra_overlap',
  'st_guard_workout_session_context',
  'st_user_can_log_group_strength_workout_date',
  'st_planned_set_on_strength_shelf',
  'st_exercise_on_strength_shelf',
  'st_user_can_log_group_strength_set',
];
fetch(base + '/rest/v1/', {
  headers: { apikey: key, Authorization: 'Bearer ' + key, Accept: 'application/openapi+json' },
})
  .then(async (response) => {
    const body = await response.json();
    const paths = Object.keys(body.paths || {});
    const found = {};
    for (const name of names) found[name] = paths.includes('/rpc/' + name);
    const rpcCount = paths.filter((path) => path.startsWith('/rpc/')).length;
    fs.writeFileSync('scripts/_tmp-071-openapi-now.json', JSON.stringify({
      status: response.status,
      rpcCount,
      found,
    }, null, 2));
  })
  .catch((error) => {
    fs.writeFileSync('scripts/_tmp-071-openapi-now.json', JSON.stringify({ fatal: error.message }));
    process.exit(1);
  });
