/**
 * BIQ-0263 Phase 3A database checks.
 * Applies 068, 069, and 070 to a disposable local Postgres 16.
 * Does not connect to Supabase and does not read .env.local.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/verify-group-activity-stage3-sql.ts
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pgQuery } from './sql/pgSimpleClient';

const root = process.cwd();
const migration068 = path.join(root, 'supabase/migrations/20261018_068_group_activity_series.sql');
const migration069 = path.join(root, 'supabase/migrations/20261021_069_group_activity_recurrence.sql');
const migration070 = path.join(root, 'supabase/migrations/20261021_070_group_strength_shelf.sql');
const binaryCache = path.join(tmpdir(), 'biq0263-pg16-binaries');
const port = 55433;

let localDataDir = '';
let localPgCtl = '';
let localEnv: NodeJS.ProcessEnv | undefined;
const progressFile = path.join(tmpdir(), 'biq0263-stage3-progress.txt');

function mark(message: string) {
  appendFileSync(progressFile, `${new Date().toISOString()} ${message}\n`);
  console.log(message);
}

function fail(message: string): never {
  throw new Error(message);
}

function staticChecks() {
  const previous = readFileSync(migration068, 'utf8');
  const stage2 = readFileSync(migration069, 'utf8');
  const next = readFileSync(migration070, 'utf8');
  if (previous.includes('program_use') || previous.includes('group_strength_shelf')) {
    fail('STATIC FAIL migration 068 was modified');
  }
  if (stage2.includes('program_use') || stage2.includes('group_strength_shelf') || stage2.includes('removed_on')) {
    fail('STATIC FAIL migration 069 was modified');
  }
  if (!next.includes('begin;') || !next.includes('commit;')) fail('STATIC FAIL migration 070 is not one transaction');
  for (const name of [
    'st_ensure_group_strength_shelf',
    'st_save_group_strength_workout',
    'st_clone_group_strength_workout',
    'st_pin_group_strength_history',
    'st_edit_group_strength_occurrence',
    'st_edit_group_strength_future',
    'st_edit_group_strength_series',
    'st_user_can_read_group_strength_workout',
    'st_reject_group_strength_shelf_program',
  ]) {
    if (!next.includes(`function public.${name}`)) fail(`STATIC FAIL missing ${name}`);
  }
  if (!next.includes('set search_path = public')) fail('STATIC FAIL a security-definer function is missing search_path');
  if (next.includes('st_training_expectations') && next.includes('insert into public.st_training_expectations')) {
    fail('STATIC FAIL migration inserts an expectation');
  }
  mark('STATIC migration 070 checks passed');
}

function run(command: string, args: string[], env?: NodeJS.ProcessEnv, cwd = root, timeout?: number) {
  return spawnSync(command, args, { encoding: 'utf8', cwd, env, timeout });
}

function findFile(directory: string, name: string): string {
  if (!existsSync(directory)) return '';
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(full, name);
      if (found) return found;
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full;
    }
  }
  return '';
}

function sleep(ms: number) {
  spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], { encoding: 'utf8', stdio: 'ignore' });
}

async function startLocalPostgres(binDir: string) {
  localDataDir = path.join(tmpdir(), `biq0263-stage3-pgdata-${process.pid}`);
  rmSync(localDataDir, { recursive: true, force: true });
  mkdirSync(localDataDir, { recursive: true });
  const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows';
  localEnv = {
    PATH: `${binDir};${systemRoot}\\System32`,
    SYSTEMROOT: systemRoot,
    WINDIR: process.env.WINDIR || systemRoot,
    TEMP: process.env.TEMP || tmpdir(),
    TMP: process.env.TMP || tmpdir(),
    COMSPEC: process.env.COMSPEC || `${systemRoot}\\System32\\cmd.exe`,
    PATHEXT: '.COM;.EXE;.BAT',
    PGHOST: '127.0.0.1',
    PGPORT: String(port),
    PGUSER: 'postgres',
  };
  const init = run(path.join(binDir, 'initdb.exe'), [
    '-D', localDataDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--locale=C',
  ], localEnv, binDir);
  if (init.status !== 0) fail(`EXECUTED FAIL initdb\n${init.stderr || ''}`);
  localPgCtl = path.join(binDir, 'pg_ctl.exe');
  run(localPgCtl, [
    '-D', localDataDir, '-l', path.join(localDataDir, 'server.log'), '-w', '-t', '20',
    '-o', `-p ${port} -h 127.0.0.1`, 'start',
  ], localEnv, binDir, 25000);
  const startedAt = Date.now();
  let connected = false;
  while (Date.now() - startedAt < 20000) {
    try {
      await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', sql: 'select 1', timeoutMs: 3000 });
      connected = true;
      break;
    } catch {
      sleep(500);
    }
  }
  if (!connected) fail('EXECUTED FAIL disposable Postgres did not accept connections');
  await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', sql: 'create database biq0263' });
}

function stopLocalPostgres() {
  if (!localPgCtl || !localDataDir) return;
  run(localPgCtl, ['-D', localDataDir, 'stop', '-m', 'fast'], localEnv, path.dirname(localPgCtl), 10000);
  rmSync(localDataDir, { recursive: true, force: true });
  localDataDir = '';
}

async function applyFile(file: string) {
  const sql = readFileSync(file, 'utf8');
  try {
    await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'biq0263', sql, timeoutMs: 120000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`EXECUTED FAIL ${path.basename(file)}\n${message}`);
  }
}

async function concurrency() {
  const workout = await pgQuery({
    host: '127.0.0.1', port, user: 'postgres', database: 'biq0263',
    sql: `select workout_id::text from public.st_group_activity_series where title = 'Shared day'`,
  });
  const workoutId = workout.rows[0]?.[0];
  if (!workoutId) fail('EXECUTED FAIL concurrency workout was not created');
  const first = `
    begin;
    select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
    select public.st_group_activity_lock('10000000-0000-4000-8000-000000000001', '${workoutId}'::uuid, null);
    select pg_sleep(3);
    select public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Concurrent shelf', '2026-10-21',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'stage3-concurrent-a',
      null, null, '{}'::jsonb, '${workoutId}'::uuid, null, false, 'none', '{}', null
    );
    commit;
  `;
  const second = `
    select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
    select public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Concurrent shelf other', '2026-10-21',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'stage3-concurrent-b',
      null, null, '{}'::jsonb, '${workoutId}'::uuid, null, false, 'none', '{}', null
    );
  `;
  const holder = pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'biq0263', sql: first, timeoutMs: 20000 }).then(
    () => ({ ok: true, text: '' }),
    (error: unknown) => ({ ok: false, text: error instanceof Error ? error.message : String(error) })
  );
  await new Promise((resolve) => setTimeout(resolve, 800));
  const waiterStarted = Date.now();
  let waiterText = '';
  try {
    const result = await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'biq0263', sql: second, timeoutMs: 20000 });
    waiterText = `unexpected success ${JSON.stringify(result.rows)}`;
  } catch (error) {
    waiterText = error instanceof Error ? error.message : String(error);
  }
  const waiterMs = Date.now() - waiterStarted;
  const holderResult = await holder;
  if (!holderResult.ok) fail(`EXECUTED FAIL concurrency holder\n${holderResult.text}`);
  if (!/already on this date/i.test(waiterText)) fail(`EXECUTED FAIL concurrent save did not collide\n${waiterText}`);
  if (waiterMs < 1500) fail(`EXECUTED FAIL concurrent save did not wait (${waiterMs}ms)`);
  mark(`EXECUTED concurrent shelf duplicate waited ${waiterMs}ms`);
}

async function main() {
  writeFileSync(progressFile, '');
  staticChecks();
  const serverPath = findFile(binaryCache, 'postgres.exe');
  if (!serverPath) fail('EXECUTED FAIL disposable Postgres binaries are not cached');
  await startLocalPostgres(path.dirname(serverPath));
  try {
    const files = [
      path.join(root, 'scripts/sql/biq0263-stage2-bootstrap.sql'),
      migration068,
      path.join(root, 'scripts/sql/biq0263-stage2-seed-before-069.sql'),
      migration069,
      path.join(root, 'scripts/sql/biq0263-stage2-tests.sql'),
      path.join(root, 'scripts/sql/biq0263-stage3-prelude.sql'),
      migration070,
      path.join(root, 'scripts/sql/biq0263-stage3-tests.sql'),
    ];
    for (const file of files) {
      mark(`APPLY ${path.basename(file)}`);
      await applyFile(file);
      mark(`APPLIED ${path.basename(file)}`);
    }
    await concurrency();
    mark('EXECUTED biq0263 stage 3 database checks passed');
  } finally {
    stopLocalPostgres();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  stopLocalPostgres();
  process.exit(1);
});
