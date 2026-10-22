/**
 * BIQ-0263 Phase 3C database checks.
 * Applies 068, 069, 070, and 071 to a disposable local Postgres 16.
 * Does not connect to Supabase and does not read .env.local.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/verify-group-activity-stage3c-sql.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pgQuery } from './sql/pgSimpleClient';

const root = process.cwd();
const migration068 = path.join(root, 'supabase/migrations/20261018_068_group_activity_series.sql');
const migration069 = path.join(root, 'supabase/migrations/20261021_069_group_activity_recurrence.sql');
const migration070 = path.join(root, 'supabase/migrations/20261021_070_group_strength_shelf.sql');
const migration071 = path.join(root, 'supabase/migrations/20261022_071_group_strength_logging.sql');
const binaryCache = path.join(tmpdir(), 'biq0263-pg16-binaries');
const port = 55434;

let localDataDir = '';
let localPgCtl = '';
let localEnv: NodeJS.ProcessEnv | undefined;

function fail(message: string): never {
  throw new Error(message);
}

function staticChecks() {
  const previous = [migration068, migration069, migration070].map((file) => readFileSync(file, 'utf8'));
  const next = readFileSync(migration071, 'utf8');
  if (previous.some((sql) => sql.includes('st_group_extra_occupies_date') || sql.includes('st_set_logs_shelf_recipient_write'))) {
    fail('STATIC FAIL migration 068, 069, or 070 was modified');
  }
  if (!next.includes('begin;') || !next.includes('commit;')) fail('STATIC FAIL migration 071 is not one transaction');
  for (const name of [
    'st_group_extra_occupies_date',
    'st_reject_group_program_extra_overlap',
    'st_guard_workout_session_context',
    'st_user_can_log_group_strength_workout_date',
    'st_pin_group_strength_history',
    'st_edit_group_strength_occurrence',
    'st_complete_group_activity_occurrence',
  ]) {
    if (!next.includes(`function public.${name}`)) fail(`STATIC FAIL missing ${name}`);
  }
  if (next.includes('insert into public.st_training_expectations')) fail('STATIC FAIL migration inserts an expectation');
  if (!next.includes("not like 'group-activity:%'")) fail('STATIC FAIL fulfillment still counts group activity sessions');
  console.log('STATIC migration 071 checks passed');
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
  localDataDir = path.join(tmpdir(), `biq0263c-pgdata-${process.pid}`);
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
  await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'postgres', sql: 'create database biq0263c' });
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
    await pgQuery({ host: '127.0.0.1', port, user: 'postgres', database: 'biq0263c', sql, timeoutMs: 120000 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`EXECUTED FAIL ${path.basename(file)}\n${message}`);
  }
}

async function main() {
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
      path.join(root, 'scripts/sql/biq0263-stage3-prelude.sql'),
      migration070,
      migration071,
      path.join(root, 'scripts/sql/biq0263-071-tests.sql'),
    ];
    for (const file of files) {
      console.log(`APPLY ${path.basename(file)}`);
      await applyFile(file);
      console.log(`APPLIED ${path.basename(file)}`);
    }
    console.log('EXECUTED biq0263 phase 3C database checks passed');
  } finally {
    stopLocalPostgres();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  stopLocalPostgres();
  process.exit(1);
});
