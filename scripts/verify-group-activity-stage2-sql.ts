/**
 * BIQ-0263 Stage 2 database checks.
 * Applies migrations 068 and 069 to a disposable local Postgres 16.
 * Uses Docker when it is available. Otherwise downloads PostgreSQL 16
 * binaries into the temp directory, starts them on localhost, and deletes
 * the data directory afterward.
 * Does not connect to Supabase and does not read .env.local.
 *
 * Run: node node_modules/tsx/dist/cli.mjs scripts/verify-group-activity-stage2-sql.ts
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import https from 'node:https';
import { pgQuery } from './sql/pgSimpleClient';

const root = process.cwd();
const migration068 = path.join(root, 'supabase/migrations/20261018_068_group_activity_series.sql');
const migration069 = path.join(root, 'supabase/migrations/20261021_069_group_activity_recurrence.sql');
const container = 'biq0263-stage2-pg';
const image = 'postgres:16-alpine';
const binaryVersion = '16.6.0';
const binaryCache = path.join(tmpdir(), 'biq0263-pg16-binaries');

const requiredFunctions = [
  'st_save_group_activity',
  'st_list_group_activities',
  'st_complete_group_activity_occurrence',
  'st_edit_group_activity_occurrence',
  'st_edit_group_activity_future',
  'st_edit_group_activity_series',
  'st_skip_group_activity_occurrence',
  'st_restore_group_activity_occurrence',
  'st_end_group_activity_series',
  'st_group_activity_date_taken',
  'st_group_activity_rule_overlaps',
  'st_group_activity_assert_clear',
  'st_group_activity_freeze_completed',
];

type Target = {
  label: string;
  mode: 'docker' | 'tcp';
  port?: number;
};

let localDataDir = '';
let localPgCtl = '';
let localEnv: NodeJS.ProcessEnv | undefined;
const progressFile = path.join(tmpdir(), 'biq0263-progress.txt');

function mark(message: string) {
  appendFileSync(progressFile, `${new Date().toISOString()} ${message}\n`);
  console.log(message);
}

function fail(message: string): never {
  throw new Error(message);
}

function staticChecks() {
  const previous = readFileSync(migration068, 'utf8');
  const next = readFileSync(migration069, 'utf8');
  if (previous.includes('st_group_weekdays_valid') || previous.includes('original_date')) {
    fail('STATIC FAIL migration 068 was modified');
  }
  if (!next.includes('begin;') || !next.includes('commit;')) fail('STATIC FAIL migration 069 is not one transaction');
  if (/raise exception 'TODO'|placeholder function|not implemented/i.test(next)) {
    fail('STATIC FAIL migration 069 still has a placeholder');
  }
  for (const name of requiredFunctions) {
    if (!next.includes(`function public.${name}`)) fail(`STATIC FAIL missing ${name}`);
  }
  for (const forbidden of [
    'st_training_expectations',
    'st_training_enrollments',
    'st_workout_sessions',
    'st_set_logs',
    'st_user_calendar_activities',
    'st_program_assignments',
  ]) {
    if (next.includes(forbidden)) fail(`STATIC FAIL migration mentions ${forbidden}`);
  }
  if (!next.includes('drop function public.st_save_group_activity(uuid, text, text, date, uuid[], text, int, text, jsonb, uuid, uuid, boolean)')) {
    fail('STATIC FAIL migration does not drop the Stage 1 signature');
  }
  mark('STATIC migration 069 checks passed');
}

function run(command: string, args: string[], input?: string, env?: NodeJS.ProcessEnv, cwd = root, timeout?: number) {
  return spawnSync(command, args, {
    input,
    encoding: 'utf8',
    cwd,
    env,
    timeout,
  });
}

function download(url: string, destination: string) {
  return new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed ${response.statusCode} ${url}`));
        return;
      }
      const file = createWriteStream(destination);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    });
    request.on('error', reject);
  });
}

function findFile(directory: string, name: string): string {
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

async function ensureLocalBinaries() {
  mkdirSync(binaryCache, { recursive: true });
  const cachedServer = path.join(binaryCache, 'bin', 'postgres.exe');
  if (existsSync(cachedServer)) return path.dirname(cachedServer);
  const jar = path.join(binaryCache, `postgres-${binaryVersion}.jar`);
  const url = `https://repo1.maven.org/maven2/io/zonky/test/postgres/embedded-postgres-binaries-windows-amd64/${binaryVersion}/embedded-postgres-binaries-windows-amd64-${binaryVersion}.jar`;
  console.log(`Downloading disposable PostgreSQL ${binaryVersion} binaries`);
  await download(url, jar);
  const extracted = run('tar', ['-xf', jar, '-C', binaryCache]);
  if (extracted.status !== 0) fail(`EXECUTED FAIL could not extract Postgres binaries\n${extracted.stderr}`);
  const packed = findFile(binaryCache, 'postgres-windows-x86_64.txz') || findFile(binaryCache, 'postgres-windows-amd64.txz');
  if (packed) {
    const unpacked = run('tar', ['-xf', packed, '-C', binaryCache]);
    if (unpacked.status !== 0) fail(`EXECUTED FAIL could not unpack Postgres\n${unpacked.stderr}`);
  }
  const serverPath = findFile(binaryCache, 'postgres.exe');
  if (!serverPath) fail('EXECUTED FAIL postgres.exe was not in the Postgres binaries');
  return path.dirname(serverPath);
}

async function startLocalPostgres(binDir: string) {
  localDataDir = path.join(tmpdir(), `biq0263-pgdata-${process.pid}`);
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
    PGPORT: '55432',
    PGUSER: 'postgres',
  };
  mark('initdb');
  const init = run(path.join(binDir, 'initdb.exe'), [
    '-D', localDataDir,
    '-U', 'postgres',
    '--auth-local=trust',
    '--auth-host=trust',
    '--encoding=UTF8',
    '--locale=C',
  ], undefined, localEnv, binDir);
  if (init.status !== 0) {
    console.error(init.error || '');
    console.error(init.stdout);
    console.error(init.stderr);
    console.error(`initdb status ${init.status}`);
    fail('EXECUTED FAIL initdb');
  }
  mark('initdb done');
  localPgCtl = path.join(binDir, 'pg_ctl.exe');
  const port = '55432';
  mark('pg_ctl start');
  const started = run(localPgCtl, [
    '-D', localDataDir,
    '-l', path.join(localDataDir, 'server.log'),
    '-w', '-t', '15',
    '-o', `-p ${port} -h 127.0.0.1`,
    'start',
  ], undefined, localEnv, binDir, 20000);
  mark(`pg_ctl returned status ${started.status} signal ${started.signal || ''}`);
  if (started.status !== 0 && started.signal !== 'SIGTERM') {
    console.error(started.stdout || '');
    console.error(started.stderr || '');
  }
  const target: Target = {
    label: `disposable PostgreSQL ${binaryVersion} on 127.0.0.1:${port}`,
    mode: 'tcp',
    port: Number(port),
  };
  const startedAt = Date.now();
  let connected = false;
  while (Date.now() - startedAt < 20000) {
    try {
      await pgQuery({
        host: '127.0.0.1',
        port: target.port,
        user: 'postgres',
        database: 'postgres',
        sql: 'select 1',
        timeoutMs: 3000,
      });
      connected = true;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      mark(`waiting for disposable Postgres: ${message}`);
      sleep(500);
    }
  }
  if (!connected) fail('EXECUTED FAIL disposable Postgres did not accept connections');
  const directory = await pgQuery({
    host: '127.0.0.1',
    port: target.port,
    user: 'postgres',
    database: 'postgres',
    sql: 'show data_directory',
    timeoutMs: 3000,
  });
  const actual = (directory.rows[0]?.[0] || '').replaceAll('\\', '/').toLowerCase();
  if (!actual.endsWith(`/biq0263-pgdata-${process.pid}`)) {
    fail(`EXECUTED FAIL connected to ${actual || 'an unknown data directory'} instead of the disposable cluster`);
  }
  try {
    await pgQuery({ host: '127.0.0.1', port: target.port, user: 'postgres', database: 'postgres', sql: 'create database biq0263' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) fail(`EXECUTED FAIL could not create the disposable database: ${message}`);
  }
  return target;
}

function stopLocalPostgres() {
  if (!localPgCtl || !localDataDir) return;
  run(localPgCtl, ['-D', localDataDir, 'stop', '-m', 'fast'], undefined, localEnv, path.dirname(localPgCtl), 10000);
  rmSync(localDataDir, { recursive: true, force: true });
  localDataDir = '';
}

function dockerAvailable() {
  return run('docker', ['version', '--format', '{{.Server.Version}}']).status === 0;
}

function removeContainer() {
  run('docker', ['rm', '-f', container]);
}

function sleep(ms: number) {
  spawnSync(process.execPath, ['-e', `setTimeout(() => {}, ${ms})`], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
}

function waitForDocker() {
  const started = Date.now();
  while (Date.now() - started < 60000) {
    const ready = run('docker', ['exec', container, 'pg_isready', '-U', 'postgres', '-d', 'biq0263']);
    if (ready.status === 0) return;
    sleep(1000);
  }
  fail('EXECUTED FAIL disposable Postgres did not become ready');
}

function psql(target: Target, args: string[], input?: string) {
  if (target.mode === 'docker') {
    return run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'biq0263', '-v', 'ON_ERROR_STOP=1', ...args], input);
  }
  throw new Error('Local Postgres uses the TCP client');
}

async function querySql(target: Target, sql: string) {
  if (target.mode === 'docker') {
    const applied = psql(target, ['-f', '-'], sql);
    if (applied.status !== 0) throw new Error(`${applied.stdout || ''}\n${applied.stderr || ''}`);
    const noise = `${applied.stdout || ''}\n${applied.stderr || ''}`;
    if (/ERROR:|FATAL:/.test(noise)) throw new Error(noise);
    return noise;
  }
  const result = await pgQuery({
    host: '127.0.0.1',
    port: target.port || 55432,
    user: 'postgres',
    database: 'biq0263',
    sql,
  });
  return result.rows.map((row) => row.join('\t')).join('\n');
}

function applyFile(target: Target, file: string) {
  const sql = readFileSync(file, 'utf8');
  return querySql(target, sql).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    fail(`EXECUTED FAIL ${path.basename(file)}`);
  });
}

async function concurrency(target: Target) {
  let day = '';
  try {
    day = (await querySql(target, `
      select to_char(min(d)::date, 'YYYY-MM-DD')
      from generate_series(date '2028-02-01', date '2028-02-07', interval '1 day') as d
      where public.st_group_weekday_index(d::date) = 1
    `)).trim();
  } catch (error) {
    console.error(error);
    fail('EXECUTED FAIL could not choose a concurrency date');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(`EXECUTED FAIL concurrency date ${day}`);
  const first = `
    begin;
    select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
    select public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Concurrent', '${day}',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'concurrent-a',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000099', null, false,
      'weekly', array[1]::smallint[], null
    );
    select pg_sleep(4);
    commit;
  `;
  const second = `
    select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
    select public.st_save_group_activity(
      '10000000-0000-4000-8000-000000000001', 'strength', 'Concurrent other', '${day}',
      array['00000000-0000-4000-8000-000000000003']::uuid[], 'concurrent-b',
      null, null, '{}'::jsonb, '20000000-0000-4000-8000-000000000099', null, false,
      'weekly', array[1]::smallint[], null
    );
  `;
  const holder = querySql(target, first).then(
    () => ({ ok: true, text: '' }),
    (error: unknown) => ({ ok: false, text: error instanceof Error ? error.message : String(error) })
  );
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const waiterStarted = Date.now();
  let waiterText = '';
  try {
    waiterText = await querySql(target, second);
    waiterText = `unexpected success ${waiterText}`;
  } catch (error) {
    waiterText = error instanceof Error ? error.message : String(error);
  }
  const waiterMs = Date.now() - waiterStarted;
  const holderResult = await holder;
  if (!holderResult.ok) {
    console.error(holderResult.text);
    fail('EXECUTED FAIL concurrency holder');
  }
  if (!/already on this date/i.test(waiterText)) {
    console.error(waiterText);
    fail('EXECUTED FAIL concurrent request did not see the virtual series');
  }
  if (waiterMs < 2000) fail(`EXECUTED FAIL concurrent request did not wait (${waiterMs}ms)`);
  const count = (await querySql(target, `
    select count(*)
    from public.st_group_activity_series
    where workout_id = '20000000-0000-4000-8000-000000000099'
  `)).trim();
  if (count !== '1') fail(`EXECUTED FAIL concurrent series count ${count}`);
  console.log(`EXECUTED concurrent virtual duplicate waited ${waiterMs}ms and kept one series`);
}

async function runSuite(target: Target) {
  const files = [
    path.join(root, 'scripts/sql/biq0263-stage2-bootstrap.sql'),
    migration068,
    path.join(root, 'scripts/sql/biq0263-stage2-seed-before-069.sql'),
    migration069,
    path.join(root, 'scripts/sql/biq0263-stage2-tests.sql'),
  ];
  for (const file of files) {
    mark(`APPLY ${path.basename(file)}`);
    await applyFile(target, file);
    mark(`APPLIED ${path.basename(file)}`);
  }
  console.log('APPLY concurrency');
  await concurrency(target);
  console.log(`EXECUTED biq0263 stage 2 database checks passed on ${target.label}`);
}

async function main() {
  writeFileSync(progressFile, '');
  staticChecks();
  if (dockerAvailable()) {
    removeContainer();
    const started = run('docker', [
      'run', '-d', '--name', container,
      '-e', 'POSTGRES_PASSWORD=postgres',
      '-e', 'POSTGRES_DB=biq0263',
      '-p', '127.0.0.1::5432',
      image,
    ]);
    if (started.status !== 0) {
      console.error(started.stderr);
      fail('EXECUTED FAIL could not start disposable Postgres');
    }
    try {
      waitForDocker();
      await runSuite({ label: 'disposable Docker Postgres 16', mode: 'docker' });
    } finally {
      removeContainer();
    }
    return;
  }

  const binDir = await ensureLocalBinaries();
  const target = await startLocalPostgres(binDir);
  try {
    await runSuite(target);
  } finally {
    stopLocalPostgres();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  removeContainer();
  stopLocalPostgres();
  process.exit(1);
});
