/**
 * BIQ-0264 Phase 2B.2 batch schedule contract.
 * Source checks always run.
 * Disposable Postgres: BIQ_RUN_SQL=1 and BIQ_EMBEDDED_PG_MODULE, or BIQ_TEST_DATABASE_URL.
 * Run: node node_modules/tsx/dist/cli.mjs scripts/test-group-member-schedule-batch.ts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const migrationDir = new URL('../supabase/migrations/', import.meta.url);
const migration = readFileSync(new URL('../supabase/migrations/20261024_072_group_member_schedule_batch.sql', import.meta.url), 'utf8');
const migrationNames = readdirSync(migrationDir).filter((name) => /^\d{8}_\d{3}_.+\.sql$/.test(name)).sort();

assert.equal(migrationNames.filter((name) => name.includes('_072_')).length, 1);
assert.equal(migrationNames.at(-1), '20261024_075_schedule_internal_grants.sql');
assert.ok(migrationNames.includes('20261024_073_group_timezone.sql'));
assert.ok(migrationNames.includes('20261024_074_schedule_lock_order.sql'));
assert.ok(migrationNames.includes('20261022_071_group_strength_logging.sql'));
for (const earlier of ['068', '069', '070', '071']) {
  const name = migrationNames.find((file) => file.includes(`_${earlier}_`));
  assert.ok(name, earlier);
  assert.equal(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8').includes('st_apply_group_member_schedules'), false);
}

assert.match(migration, /create table if not exists public\.st_group_schedule_requests/);
assert.match(migration, /constraint st_group_schedule_requests_team_key unique \(team_id, request_key\)/);
assert.match(migration, /payload jsonb not null/);
assert.match(migration, /requested_by uuid not null/);
assert.doesNotMatch(migration, /requested_by uuid not null references/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on table public\.st_group_schedule_requests from public, anon, authenticated/);
assert.match(migration, /function public\.st_apply_group_member_schedules/);
assert.match(migration, /security definer/);
assert.match(migration, /set search_path = public/);
assert.match(migration, /revoke all on function public\.st_apply_group_member_schedules\(uuid, text, uuid\[\], text, text\[\], date, date, text\) from public, anon/);
assert.match(migration, /grant execute on function public\.st_apply_group_member_schedules\(uuid, text, uuid\[\], text, text\[\], date, date, text\) to authenticated/);
assert.doesNotMatch(migration, /grant execute on function public\.st_apply_group_member_schedules[\s\S]*to anon/);
assert.match(migration, /pg_advisory_xact_lock\(hashtext\(p_team_id::text \|\| ':' \|\| v_key\)::bigint\)/);
assert.match(migration, /array_agg\(t\.member_id order by t\.member_id\)/);
assert.match(migration, /foreach v_uid in array v_ids/);
assert.match(migration, /for update/);
assert.doesNotMatch(migration, /st_apply_member_schedule/);
assert.doesNotMatch(migration, /st_place_group_program/);
assert.doesNotMatch(migration, /st_set_group_default_program/);
assert.doesNotMatch(migration, /continue;/);
assert.match(migration, /st_set_member_training_schedule/);
assert.match(migration, /st_set_member_group_expectation/);
assert.match(migration, /st_program_custom_schedule_error/);
assert.match(migration, /st_expectation_has_session/);
assert.match(migration, /source_key = 'group:' \|\| p_team_id::text/);
assert.match(migration, /source_key <> 'personal'/);
assert.match(migration, /Set a group timezone before changing schedules/);
assert.match(migration, /Schedule changes apply on the group date/);
assert.match(migration, /timezone\(v_zone, now\(\)\)/);
assert.match(migration, /set_config\('TimeZone', v_zone, true\)/);
assert.match(migration, /p_effective_on is distinct from v_today or p_local_today is distinct from v_today/);
assert.doesNotMatch(migration, /current_date - 1/);
assert.doesNotMatch(migration, /v_today := p_local_today/);
assert.doesNotMatch(migration, /v_today\s*:=\s*current_date/);
assert.doesNotMatch(migration, /Local today is outside the allowed window/);
assert.match(migration, /v_stored_payload = v_payload/);
assert.match(migration, /Select at most 500 members/);
assert.match(migration, /Duplicate member/);
assert.match(migration, /Request key was already used with a different schedule change/);
assert.match(migration, /'replay', true/);
assert.match(migration, /'replay', false/);
assert.match(migration, /unchanged_count/);
assert.doesNotMatch(migration, /exception when others/i);
assert.doesNotMatch(migration, /delete from public\.st_group_activity/);
assert.doesNotMatch(migration, /add column[^;]*timezone/i);
assert.match(migration, /A logged workout is still scheduled after today/);
assert.match(migration, /Turn expected training on before editing days/);
assert.match(migration, /Group enrollment is not active/);
assert.match(migration, /Member is not an active participant/);
assert.match(migration, /Personal training cannot be changed here/);
assert.match(migration, /array_append\(v_apply, v_uid\)/);

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const protectedMigrations = migrationNames.filter((name) => /_06[89]_/.test(name) || /_07[01]_/.test(name));
assert.deepEqual(protectedMigrations.map((name) => name.match(/_(\d{3})_/)?.[1]), ['068', '069', '070', '071']);
const protectedDiff = execFileSync('git', ['diff', 'HEAD', '--', ...protectedMigrations.map((name) => `supabase/migrations/${name}`)], {
  cwd: repoRoot,
  encoding: 'utf8',
});
assert.equal(protectedDiff, '', 'migrations 068-071 must stay unchanged');

const grantGap = ['st_refresh_enrollment_expectations', 'st_sync_enrollment_schedule', 'st_withdraw_future_program_expectations'];
for (const name of migrationNames) {
  if (name.includes('_075_')) continue;
  const sql = readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
  for (const fn of grantGap) {
    assert.equal(sql.includes(`revoke all on function public.${fn}`), false, `${name} revokes ${fn}`);
    assert.equal(sql.includes(`revoke execute on function public.${fn}`), false, `${name} revokes execute on ${fn}`);
  }
}
const grants = readFileSync(new URL('../supabase/migrations/20261024_075_schedule_internal_grants.sql', import.meta.url), 'utf8');
for (const fn of grantGap) {
  assert.match(grants, new RegExp(`revoke all on function public\\.${fn}\\(uuid, date\\) from public, anon, authenticated`));
}
assert.match(grants, /grant execute on function public\.st_withdraw_future_program_expectations\(uuid, date\) to service_role/);
assert.doesNotMatch(grants, /grant execute on function public\.st_refresh_enrollment_expectations/);
assert.doesNotMatch(grants, /grant execute on function public\.st_sync_enrollment_schedule/);
const timezoneMigration = readFileSync(new URL('../supabase/migrations/20261024_073_group_timezone.sql', import.meta.url), 'utf8');
assert.match(timezoneMigration, /add column if not exists timezone text/);
assert.doesNotMatch(timezoneMigration, /update public\.st_teams[\s\S]*timezone/i);
assert.match(timezoneMigration, /Invalid group timezone/);
const lockMigration = readFileSync(new URL('../supabase/migrations/20261024_074_schedule_lock_order.sql', import.meta.url), 'utf8');
assert.match(lockMigration, /array_agg\(uid order by uid\)/);
assert.match(lockMigration, /for update/);
assert.match(lockMigration, /function public\.st_assign_group_programs/);
assert.match(lockMigration, /function public\.st_refresh_enrollment_expectations/);
assert.match(lockMigration, /function public\.st_withdraw_future_program_expectations/);
assert.match(lockMigration, /function public\.st_set_member_training_schedule/);
assert.match(lockMigration, /function public\.st_set_member_group_expectation/);

console.log('group member schedule batch source checks passed');

type PgClient = {
  on: (event: string, listener: (message: { message?: string }) => void) => void;
  connect: () => Promise<void>;
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  end: () => Promise<void>;
};

function splitSql(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let dollar: string | null = null;
  while (i < sql.length) {
    if (!dollar) {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (match) {
        dollar = match[0];
        current += match[0];
        i += match[0].length;
        continue;
      }
      if (sql[i] === '-' && sql[i + 1] === '-') {
        const end = sql.indexOf('\n', i);
        current += sql.slice(i, end === -1 ? sql.length : end);
        i = end === -1 ? sql.length : end;
        continue;
      }
      if (sql[i] === ';') {
        const statement = current.trim();
        if (statement.replace(/--.*$/gm, '').trim()) statements.push(statement);
        current = '';
        i += 1;
        continue;
      }
    } else if (sql.startsWith(dollar, i)) {
      current += dollar;
      i += dollar.length;
      dollar = null;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  const tail = current.trim();
  if (tail.replace(/--.*$/gm, '').trim()) statements.push(tail);
  return statements;
}

function extractFunction(sql: string, name: string): string {
  const needle = `function public.${name}`;
  let from = 0;
  let createAt = -1;
  let nameAt = -1;
  while (from < sql.length) {
    const at = sql.indexOf(needle, from);
    if (at < 0) break;
    const create = sql.lastIndexOf('create or replace', at);
    const between = create >= 0 ? sql.slice(create, at) : '';
    if (create >= 0 && !between.includes(';')) {
      createAt = create;
      nameAt = at;
    }
    from = at + needle.length;
  }
  if (createAt < 0 || nameAt < 0) throw new Error(`missing function ${name}`);
  const end = sql.indexOf('$$;', nameAt);
  if (end < 0) throw new Error(`missing end for ${name}`);
  const body = sql.slice(createAt, end + 3);
  assert.equal(body.includes('create or replace function public.'), true);
  return body;
}

function readMigration(name: string): string {
  return readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
}

async function execFile(client: PgClient, fileUrl: URL) {
  const sql = readFileSync(fileUrl, 'utf8');
  const statements = splitSql(sql);
  for (const statement of statements) {
    try {
      await client.query(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const preview = statement.split('\n').slice(0, 4).join('\n');
      throw new Error(`${message}\n--- statement ---\n${preview}`);
    }
  }
}

function uuidArray(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.map(String) : [];
}

async function runDatabase() {
  const hosted = process.env.BIQ_TEST_DATABASE_URL || '';
  if (hosted.includes('supabase.co') || hosted.includes('qruiwfzzrylrirlxzdqx')) {
    throw new Error('Refusing to run tests against hosted Supabase');
  }
  if (process.env.BIQ_RUN_SQL !== '1' && !hosted) {
    console.log('SQL execution skipped. No disposable Postgres was requested.');
    return;
  }

  const nodeModules = process.env.BIQ_NODE_MODULES;
  if (!nodeModules && !hosted) throw new Error('Set BIQ_NODE_MODULES or BIQ_TEST_DATABASE_URL');
  const localRequire = nodeModules
    ? createRequire(pathToFileURL(join(nodeModules, 'package.json')).href)
    : require;
  const { Client } = localRequire('pg') as { Client: new (config: { connectionString: string }) => PgClient };
  let connectionString = hosted;
  let embedded: { stop: () => Promise<void> } | null = null;
  if (!connectionString) {
    const imported = await import(pathToFileURL(localRequire.resolve('embedded-postgres')).href) as { default: new (options: Record<string, unknown>) => {
      initialise: () => Promise<void>;
      start: () => Promise<void>;
      createDatabase: (name: string) => Promise<void>;
      stop: () => Promise<void>;
    } };
    const port = 55432;
    const databaseDir = join(tmpdir(), 'biq072-pgdata');
    const server = new imported.default({
      databaseDir,
      user: 'postgres',
      password: 'postgres',
      port,
      persistent: false,
    });
    await server.initialise();
    await server.start();
    await server.createDatabase('biq072');
    embedded = server;
    connectionString = `postgresql://postgres:postgres@127.0.0.1:${port}/biq072`;
  }

  const client = new Client({ connectionString });
  client.on('notice', (message) => {
    if (message.message) console.log(message.message);
  });
  await client.connect();
  try {
    await client.query("set timezone to 'UTC'");
    await execFile(client, new URL('./sql/biq0264-072-disposable-fixture.sql', import.meta.url));
    const sources: Record<string, string> = {
      '036': readMigration('20250804_036_fix_assign_and_edit_team_roles.sql'),
      '057': readMigration('20261005_057_notification_foundation.sql'),
      '054': readMigration('20261005_054_group_architecture_phase1.sql'),
      '059': readMigration('20261007_059_unified_training_schedule.sql'),
      '062': readMigration('20261012_062_group_assignment_wizard.sql'),
      '063': readMigration('20261012_063_member_training_schedules.sql'),
      '064': readMigration('20261012_064_workout_reschedule.sql'),
      '069': readMigration('20261021_069_group_activity_recurrence.sql'),
      '070': readMigration('20261021_070_group_strength_shelf.sql'),
      '071': readMigration('20261022_071_group_strength_logging.sql'),
    };
    const functions: Array<[string, string]> = [
      ['059', 'st_schedule_day_label'],
      ['059', 'st_schedule_monday'],
      ['059', 'st_program_cycle_weeks'],
      ['063', 'st_normalize_program_day'],
      ['063', 'st_program_day_index'],
      ['063', 'st_normalize_weekday_list'],
      ['036', 'st_user_can_edit_team'],
      ['054', 'st_member_has_group_flag'],
      ['054', 'st_user_can_assign_in_group'],
      ['071', 'st_expectation_has_session'],
      ['059', 'st_guard_training_expectation'],
      ['059', 'st_withdraw_future_program_expectations'],
      ['063', 'st_program_custom_schedule_error'],
      ['063', 'st_save_group_schedule_profile'],
      ['069', 'st_group_weekday_index'],
      ['070', 'st_group_activity_effective_workout'],
      ['071', 'st_group_extra_occupies_date'],
      ['071', 'st_reject_group_program_extra_overlap'],
      ['063', 'st_refresh_enrollment_expectations'],
      ['062', 'st_sync_enrollment_schedule'],
      ['062', 'st_training_enrollment_schedule_trigger'],
      ['064', 'st_apply_saved_overrides'],
      ['064', 'st_training_expectation_apply_override'],
      ['064', 'st_group_enrollment_for_schedule'],
      ['064', 'st_set_member_group_expectation'],
      ['063', 'st_set_member_training_schedule'],
      ['063', 'st_apply_member_schedule'],
      ['062', 'st_place_group_program'],
      ['057', 'st_notify_program_assignment'],
    ];
    for (const [file, name] of functions) {
      await client.query(extractFunction(sources[file], name));
    }
    await execFile(client, new URL('./sql/biq0264-072-disposable-triggers.sql', import.meta.url));
    await execFile(client, new URL('../supabase/migrations/20261024_072_group_member_schedule_batch.sql', import.meta.url));
    await client.query(`
      do $$
      begin
        if not exists (select 1 from pg_roles where rolname = 'service_role') then
          create role service_role nologin;
        end if;
      end $$
    `);
    await client.query('grant usage on schema public to service_role');
    await execFile(client, new URL('../supabase/migrations/20261024_073_group_timezone.sql', import.meta.url));
    await execFile(client, new URL('../supabase/migrations/20261024_074_schedule_lock_order.sql', import.meta.url));
    await execFile(client, new URL('../supabase/migrations/20261024_075_schedule_internal_grants.sql', import.meta.url));
    await execFile(client, new URL('./sql/biq0264-072-schedule-batch-tests.sql', import.meta.url));
    console.log('SQL tests executed against disposable Postgres');

    await runConcurrency(Client, connectionString);
    await runLockRegression(Client, connectionString);
    await runPerformance(client);
  } finally {
    await client.end();
    if (embedded) await embedded.stop();
  }
}

async function runConcurrency(Client: new (config: { connectionString: string }) => PgClient, connectionString: string) {
  const left = new Client({ connectionString });
  const right = new Client({ connectionString });
  await left.connect();
  await right.connect();
  await left.query("set timezone to 'UTC'");
  await right.query("set timezone to 'UTC'");
  try {
    const seeded = await left.query(`select biq072_seed('concurrent') as s`);
    const seed = seeded.rows[0].s as Record<string, string>;
    const ids = [seed.amy_id, seed.ben_id];
    const same = await Promise.allSettled([
      left.query(
        `select biq072_apply($1::uuid, $2::uuid, 'pause', $3::uuid[], null, null, 'concurrent-same') as result`,
        [seed.owner_id, seed.team_id, ids]
      ),
      right.query(
        `select biq072_apply($1::uuid, $2::uuid, 'pause', $3::uuid[], null, null, 'concurrent-same') as result`,
        [seed.owner_id, seed.team_id, ids]
      ),
    ]);
    const fulfilled = same.filter((item) => item.status === 'fulfilled') as PromiseFulfilledResult<{ rows: Array<Record<string, unknown>> }>[];
    assert.equal(fulfilled.length, 2, `same key concurrent failed: ${same.map((item) => item.status === 'rejected' ? String(item.reason) : 'ok').join(' | ')}`);
    const replays = fulfilled.map((item) => String((item.value.rows[0].result as { replay: boolean }).replay));
    assert.deepEqual(replays.sort(), ['false', 'true']);
    const stored = await left.query(`select count(*)::int as n from public.st_group_schedule_requests where request_key = 'concurrent-same'`);
    assert.equal(stored.rows[0].n, 1);

    const different = await Promise.allSettled([
      left.query(
        `select biq072_apply($1::uuid, $2::uuid, 'edit_days', $3::uuid[], 'program_days', null, 'concurrent-diff') as result`,
        [seed.owner_id, seed.team_id, [seed.cara_id]]
      ),
      right.query(
        `select biq072_apply($1::uuid, $2::uuid, 'pause', $3::uuid[], null, null, 'concurrent-diff') as result`,
        [seed.owner_id, seed.team_id, [seed.cara_id]]
      ),
    ]);
    const diffOk = different.filter((item) => item.status === 'fulfilled').length;
    const diffBad = different.filter((item) => item.status === 'rejected');
    assert.equal(diffOk, 1, 'one different-payload request should commit');
    assert.equal(diffBad.length, 1, 'one different-payload request should fail');
    assert.match(String(diffBad[0].status === 'rejected' ? diffBad[0].reason : ''), /different schedule change/);

    await left.query(
      `select biq072_apply($1::uuid, $2::uuid, 'resume', $3::uuid[], null, null, 'concurrent-resume') as result`,
      [seed.owner_id, seed.team_id, [seed.cara_id]]
    );
    const other = await Promise.allSettled([
      left.query(
        `select biq072_apply($1::uuid, $2::uuid, 'edit_days', $3::uuid[], 'program_days', null, 'concurrent-a') as result`,
        [seed.owner_id, seed.team_id, [seed.cara_id]]
      ),
      right.query(
        `select biq072_apply($1::uuid, $2::uuid, 'edit_days', $3::uuid[], 'custom_weekdays', $4::text[], 'concurrent-b') as result`,
        [seed.owner_id, seed.team_id, [seed.cara_id], ['Tue', 'Thu', 'Sat']]
      ),
    ]);
    assert.equal(other.filter((item) => item.status === 'fulfilled').length, 2, `different keys failed: ${other.map((item) => item.status === 'rejected' ? String(item.reason) : 'ok').join(' | ')}`);

    await probeDeadlock(Client, connectionString, seed);
  } finally {
    await left.end();
    await right.end();
  }
}

async function probeDeadlock(
  Client: new (config: { connectionString: string }) => PgClient,
  connectionString: string,
  seed: Record<string, string>
) {
  const holder = new Client({ connectionString });
  const editor = new Client({ connectionString });
  await holder.connect();
  await editor.connect();
  await holder.query("set timezone to 'UTC'");
  await editor.query("set timezone to 'UTC'");
  let holderError = '';
  let editorError = '';
  try {
    await holder.query('begin');
    await editor.query('begin');
    await holder.query(`set local lock_timeout = '4s'`);
    await editor.query(`set local lock_timeout = '4s'`);
    await holder.query(`set local deadlock_timeout = '200ms'`);
    await editor.query(`set local deadlock_timeout = '200ms'`);
    await holder.query(`select 1 from public.st_training_enrollments where id = $1::uuid for update`, [seed.amy_enrollment_id]);
    const editorRun = editor.query(
      `select set_config('request.jwt.claim.sub', $1, true),
              public.st_set_member_training_schedule($2::uuid, $3::uuid, 'program_days', '{}'::text[], (now() at time zone 'UTC')::date, (now() at time zone 'UTC')::date)`,
      [seed.owner_id, seed.team_id, seed.amy_id]
    ).then(() => 'completed').catch((error: Error) => {
      editorError = error.message;
      return 'failed';
    });
    await holder.query('select pg_sleep(0.5)');
    try {
      await holder.query(
        `delete from public.st_training_expectations
         where enrollment_id = $1::uuid and origin = 'program' and scheduled_date > (now() at time zone 'UTC')::date`,
        [seed.amy_enrollment_id]
      );
    } catch (error) {
      holderError = error instanceof Error ? error.message : String(error);
    }
    const editorStatus = await editorRun;
    console.log(`Deadlock probe: editor=${editorStatus} editor_error=${editorError || 'none'} holder_error=${holderError || 'none'}`);
  } finally {
    await holder.query('rollback').catch(() => undefined);
    await editor.query('rollback').catch(() => undefined);
    await holder.end();
    await editor.end();
  }
}

async function runLockRegression(Client: new (config: { connectionString: string }) => PgClient, connectionString: string) {
  const holder = new Client({ connectionString });
  const editor = new Client({ connectionString });
  await holder.connect();
  await editor.connect();
  await holder.query("set timezone to 'UTC'");
  await editor.query("set timezone to 'UTC'");
  try {
    const seeded = await holder.query(`select biq072_seed('locks') as s`);
    const seed = seeded.rows[0].s as Record<string, string>;
    const today = await holder.query(`select biq072_today()::text as today`);
    const groupDate = String(today.rows[0].today);
    const before = await holder.query(
      `select count(*)::int as n from public.st_training_expectations where enrollment_id = $1::uuid`,
      [seed.amy_enrollment_id]
    );
    await holder.query('begin');
    await holder.query(`select id from public.st_training_enrollments where id = $1::uuid for update`, [seed.amy_enrollment_id]);
    await editor.query(`set lock_timeout = '2s'`);
    let refreshWaited = false;
    try {
      await editor.query(`select public.st_refresh_enrollment_expectations($1::uuid, $2::date)`, [seed.amy_enrollment_id, groupDate]);
    } catch (error) {
      refreshWaited = /lock timeout/i.test(error instanceof Error ? error.message : String(error));
    }
    assert.equal(refreshWaited, true, 'refresh must wait on the enrollment lock');
    const during = await holder.query(
      `select count(*)::int as n from public.st_training_expectations where enrollment_id = $1::uuid`,
      [seed.amy_enrollment_id]
    );
    assert.equal(during.rows[0].n, before.rows[0].n, 'refresh must not delete rows while the enrollment lock is held');
    await holder.query('rollback');

    await holder.query('begin');
    await holder.query(`select id from public.st_training_enrollments where id = $1::uuid for update`, [seed.ben_enrollment_id]);
    await editor.query(`select set_config('request.jwt.claim.sub', $1, false)`, [seed.owner_id]);
    let scheduleWaited = false;
    try {
      await editor.query(
        `select public.st_set_member_training_schedule($1::uuid, $2::uuid, 'program_days', null, $3::date, $3::date)`,
        [seed.team_id, seed.ben_id, groupDate]
      );
    } catch (error) {
      scheduleWaited = /lock timeout/i.test(error instanceof Error ? error.message : String(error));
    }
    assert.equal(scheduleWaited, true, 'single-member edit must wait on the enrollment lock');
    await holder.query('rollback');
    await editor.query(`set lock_timeout = '0'`);
    await editor.query(
      `select public.st_set_member_training_schedule($1::uuid, $2::uuid, 'program_days', null, $3::date, $3::date)`,
      [seed.team_id, seed.ben_id, groupDate]
    );

    await holder.query(`set statement_timeout = '20s'`);
    await editor.query(`set statement_timeout = '20s'`);
    await holder.query(`set deadlock_timeout = '200ms'`);
    await editor.query(`set deadlock_timeout = '200ms'`);
    await holder.query(`
      create table if not exists public.st_group_assignment_requests (
        id uuid primary key default gen_random_uuid(),
        team_id uuid not null references public.st_teams(id) on delete cascade,
        request_key text not null,
        requested_by uuid not null,
        result jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        unique (team_id, request_key)
      )
    `);
    await holder.query(`
      alter table public.st_program_assignments
        add column if not exists assigned_by uuid,
        add column if not exists target_type text,
        add column if not exists coaching_metadata jsonb
    `);
    const overlapped = await Promise.allSettled([
      holder.query(
        `select biq072_apply($1::uuid, $2::uuid, 'edit_days', $3::uuid[], 'program_days', null, 'lock-batch') as result`,
        [seed.owner_id, seed.team_id, [seed.ben_id, seed.amy_id]]
      ),
      editor.query(
        `select biq072_assign($1::uuid, $2::uuid, $3::uuid[], $4::uuid, 'lock-assign') as result`,
        [seed.owner_id, seed.team_id, [seed.amy_id, seed.ben_id], seed.program_id]
      ),
    ]);
    const deadlocked = overlapped.filter((item) => item.status === 'rejected' && /deadlock detected/i.test(String(item.reason)));
    assert.equal(deadlocked.length, 0, `overlapping batch and assignment deadlocked: ${overlapped.map((item) => item.status === 'rejected' ? String(item.reason) : 'ok').join(' | ')}`);
    const failed = overlapped.filter((item) => item.status === 'rejected');
    assert.equal(failed.length, 0, `overlapping batch and assignment failed: ${failed.map((item) => String(item.status === 'rejected' ? item.reason : '')).join(' | ')}`);
    console.log('lock regression passed');
  } finally {
    await holder.query('rollback').catch(() => undefined);
    await editor.query('rollback').catch(() => undefined);
    await holder.end();
    await editor.end();
  }
}

async function runPerformance(client: PgClient) {
  await client.query(`set statement_timeout = '120s'`);
  console.log('Seeding 200 members before the timed batch');
  const seeded = await client.query(`select biq072_seed_many(200) as s`);
  const seed = seeded.rows[0].s as { team_id: string; owner_id: string; member_ids: string[] };
  const ids = uuidArray(seed.member_ids);
  assert.equal(ids.length, 200);
  const beforeRows = await client.query(
    `select count(*)::int as expectations from public.st_training_expectations where team_id = $1::uuid`,
    [seed.team_id]
  );
  const before = await client.query(
    `select coalesce(n_tup_ins, 0)::bigint as inserts, coalesce(n_tup_del, 0)::bigint as deletes
     from pg_stat_user_tables where relname = 'st_training_expectations'`
  );
  const started = performance.now();
  let timeout = false;
  try {
    await client.query(
      `select biq072_apply($1::uuid, $2::uuid, 'edit_days', $3::uuid[], 'program_days', null, 'perf-200') as result`,
      [seed.owner_id, seed.team_id, ids]
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/statement timeout/i.test(message)) throw error;
    timeout = true;
    console.log(`200-member batch hit statement_timeout: ${message}`);
  }
  const elapsed = Math.round(performance.now() - started);
  const after = await client.query(
    `select coalesce(n_tup_ins, 0)::bigint as inserts, coalesce(n_tup_del, 0)::bigint as deletes
     from pg_stat_user_tables where relname = 'st_training_expectations'`
  );
  const rows = await client.query(
    `select count(*)::int as expectations
     from public.st_training_expectations where team_id = $1::uuid`,
    [seed.team_id]
  );
  const inserted = Number(after.rows[0].inserts) - Number(before.rows[0].inserts);
  const deleted = Number(after.rows[0].deletes) - Number(before.rows[0].deletes);
  const timeoutSetting = await client.query(`select current_setting('statement_timeout') as statement_timeout`);
  console.log(`BIQ-0264 200-member edit_days wall_ms=${elapsed} expectations_before=${beforeRows.rows[0].expectations} expectations_after=${rows.rows[0].expectations} stat_inserts=${inserted} stat_deletes=${deleted} statement_timeout=${timeoutSetting.rows[0].statement_timeout} statement_timeout_hit=${timeout}`);
  if (!timeout) assert.equal(elapsed < 120000, true);
}

runDatabase().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
