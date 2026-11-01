/**
 * BIQ-0285: time the before/after navigation critical paths.
 * Each step waits for a real round trip to this project's Supabase, or for 150ms
 * when that host cannot be reached. No user data is read.
 * Run: npx tsx scripts/measure-nav-performance.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { measureIdle, navigationForecast, type NavLoadPhase } from '../lib/performance/navLoadPlan';

function envValue(name: string): string | null {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0 || trimmed.slice(0, eq).trim() !== name) continue;
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (value) return value;
    }
  }
  return process.env[name] || null;
}

async function measureRoundTrip(): Promise<{ rttMs: number; source: string }> {
  const url = envValue('NEXT_PUBLIC_SUPABASE_URL');
  if (!url) return { rttMs: 150, source: 'no Supabase URL; used 150ms' };
  const samples: number[] = [];
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    try {
      await fetch(`${url.replace(/\/$/, '')}/auth/v1/health`);
    } catch {
      return { rttMs: 150, source: 'Supabase health check failed; used 150ms' };
    }
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return { rttMs: Math.round(samples[1]), source: 'median of 3 auth health checks' };
}

const screens = ['Nutrition', 'Training', 'Dashboard', 'Progress'] as const;

async function main() {
  const { rttMs, source } = await measureRoundTrip();
  console.log(`round trip ${rttMs}ms (${source})`);
  console.log('screen\tbefore requests\tafter requests\tbefore idle ms\tafter idle ms');
  for (const screen of screens) {
    const from = screen === 'Dashboard' ? 'Training' : 'Dashboard';
    const input = { from, groupMember: true, manager: true };
    const before = navigationForecast({ ...input, phase: 'legacy' satisfies NavLoadPhase, to: screen });
    const after = navigationForecast({ ...input, phase: 'a' satisfies NavLoadPhase, to: screen });
    const beforeMs = await measureIdle(before.networkIdleSteps, rttMs);
    const afterMs = await measureIdle(after.networkIdleSteps, rttMs);
    console.log(`${screen}\t${before.requests}\t${after.requests}\t${beforeMs}\t${afterMs}`);
  }
}

main();
