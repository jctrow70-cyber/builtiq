/**
 * BIQ-0249 program criteria snapshot.
 * Imported from lib/scienceEngine/acceptanceCheck.ts
 */
import { FALLBACK_CATALOG } from '../scienceEngine/catalogAdapter';
import { generateProgram } from '../scienceEngine/generateProgram';
import { trainingProfileFromSources } from '../scienceEngine/profile';
import type { ScienceProgram } from '../scienceEngine/types';
import {
  buildGenerationCriteria,
  describeGenerationCriteria,
  readGenerationCriteria,
} from './generationCriteria';

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

export function runGenerationCriteriaChecks() {
  const profile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'athletic_performance', birth_year: 1990 },
    trainingProfile: {
      warmup_style: 'dynamic',
      warmup_duration: 'standard',
      potentiation_preference: 'automatic',
      preferred_session_minutes: 60,
    },
    config: {
      days: ['Mon', 'Fri'],
      dayTypes: { Mon: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 60,
      primaryGoal: 'athletic_performance',
      trainingSplit: 'hybrid',
      experienceLevel: 'intermediate',
      intakeNotes: 'Both workouts must be exactly the same. Upper-body push emphasis. Lower-body pull emphasis.',
    },
  });
  const program = generateProgram(profile, FALLBACK_CATALOG);
  const snapshot = buildGenerationCriteria({
    method: 'science_fallback',
    program,
    requirements: profile.hardRequirements!,
    savedAt: '2026-10-07T00:00:00.000Z',
    request: {
      goal: 'athletic_performance',
      split: 'hybrid',
      experience: 'intermediate',
      days: ['Mon', 'Fri'],
      sessionMinutes: 60,
      notes: 'Baseball training.',
      focusMuscles: ['Chest'],
    },
  });

  assert(snapshot.status === 'science_template', `Fallback should record the science template, got ${snapshot.status}`);
  assert(snapshot.identical_days && snapshot.upper_push && snapshot.lower_pull, 'Hard requirements must be stored on the snapshot');
  assert(snapshot.kept.some((line) => /same workout/i.test(line)), `Identical days should be kept: ${snapshot.kept.join(' | ')}`);
  assert(snapshot.kept.some((line) => /upper-body push/i.test(line)), `Push emphasis should be kept: ${snapshot.kept.join(' | ')}`);
  assert(snapshot.kept.some((line) => /lower-body pull/i.test(line)), `Lower pull should be kept: ${snapshot.kept.join(' | ')}`);
  assert(snapshot.unmet.length === 0, `A matching science week should not list unmet requirements: ${snapshot.unmet.join(' | ')}`);
  assert(!JSON.stringify(snapshot).includes('VOLUME_OFF'), 'The snapshot must not store validation codes');
  assert(!('repairs' in snapshot), 'The snapshot must not store the repair list');

  const view = describeGenerationCriteria(snapshot);
  assert(view.statusLabel === 'Built from the science template', `Unexpected status label: ${view.statusLabel}`);
  assert(view.requestLines.some((line) => line.includes('Mon, Fri')), 'The details view should show the requested days');
  assert(view.requestLines.some((line) => line.includes('Athletic Performance')), 'The details view should show the goal');
  assert(view.requirementLines.some((line) => /de-emphasized/i.test(line)), 'Waived muscles should be visible as de-emphasized');

  const roundTrip = readGenerationCriteria(JSON.parse(JSON.stringify(snapshot)));
  assert(roundTrip?.notes === 'Baseball training.', 'Saved criteria should round-trip');
  assert(readGenerationCriteria({ version: 2, status: 'ai' }) == null, 'Unknown snapshot versions should stay hidden');

  const different = {
    workouts: [
      {
        week: 1,
        workoutType: 'Full Body',
        exercises: [{ name: 'Bench', sets: 3, repMin: 6, repMax: 8, movementPattern: 'horizontal_push' }],
        warmup: [{ name: 'Inchworm' }, { name: 'Band Row' }],
      },
      {
        week: 1,
        workoutType: 'Full Body',
        exercises: [{ name: 'Squat', sets: 3, repMin: 6, repMax: 8, movementPattern: 'squat' }],
        warmup: [{ name: 'Inchworm' }, { name: 'Band Row' }],
      },
    ],
  } as ScienceProgram;
  const missed = buildGenerationCriteria({
    method: 'ai',
    program: different,
    requirements: profile.hardRequirements!,
    request: { days: ['Mon', 'Fri'], sessionMinutes: 60 },
  });
  assert(missed.status === 'ai', 'An AI week should say it was built with AI');
  assert(describeGenerationCriteria(missed).statusLabel === 'Built with AI', 'AI status label should stay short');
  assert(missed.unmet.some((line) => /not the same workout/i.test(line)), 'Different days must be recorded as unmet');
  assert(missed.unmet.some((line) => /lower-body pull/i.test(line)), 'A missing hinge must be recorded as unmet');

  const variedProfile = trainingProfileFromSources({
    profile: { experience_level: 'intermediate', primary_goal: 'hypertrophy' },
    config: {
      days: ['Mon', 'Wed', 'Fri'],
      dayTypes: { Mon: 'Full Body', Wed: 'Full Body', Fri: 'Full Body' },
      weeks: 1,
      sessionMinutes: 60,
      intakeNotes: 'Normal full body week.',
    },
  });
  const varied = generateProgram(variedProfile, FALLBACK_CATALOG);
  const plain = buildGenerationCriteria({
    method: 'ai_repaired',
    program: varied,
    requirements: variedProfile.hardRequirements!,
    request: { days: ['Mon', 'Wed', 'Fri'], sessionMinutes: 60 },
  });
  assert(plain.status === 'ai_repaired', 'Repaired AI should keep its own status');
  assert(!plain.identical_days, 'A normal week must not be stored as identical days');
  assert(describeGenerationCriteria(plain).statusLabel.includes('adjusted'), 'Repaired status should say the week was adjusted');
  assert(
    describeGenerationCriteria(plain).requirementLines.some((line) => /no identical-day/i.test(line)),
    'A normal week should say no identical-day requirement was set'
  );
}
