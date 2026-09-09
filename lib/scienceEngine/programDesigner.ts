import { SCIENCE_ENGINE_VERSION } from './version';
import { designerExercisePool } from './designerCatalog';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from './types';

export function buildProgramDesignerPrompt(
  program: ScienceProgram,
  profile: TrainingProfile,
  userPrompt: string,
  catalog: CatalogExercise[] = []
) {
  const week1 = program.workouts.filter((w) => w.week === 1);
  const library = designerExercisePool(catalog, profile);

  const system = `You are a strength-and-conditioning program designer for BuiltIQ Health (science engine ${SCIENCE_ENGINE_VERSION}).

Design ONE training WEEK as a PROGRAM, not isolated workouts. Sessions must complement each other.

Hard constraints you may not break:
- Keep the supplied days and day types.
- Stay within ${profile.preferredSessionMinutes} minutes.
- Do not use excluded exercises: ${(profile.excludedExercises || []).join(', ') || 'none'}.
- Do not diagnose injury. Respect pain areas: ${(profile.painAreas || []).join(', ') || 'none'}.
- Primary lifts stay as straight sets (no heavy squat/deadlift/bench supersetted with another heavy compound).
- Choose exercises from the approved library names. Prefer common, proven lifts over obscure variations.
- Keep week-to-week consistency: this week is the template copied across the cycle.
- RIR 0-4. Typical primary 1-3 RIR.

Programming judgment (you decide):
- Session emphasis for each day so the week is balanced.
- Exercise selection, order, and accessories.
- Warm-up that prepares THAT day's lifts (do not copy the same warm-up to every day).
- Optional low-volume potentiation only when it fits the user and session.
- Optional supersets only when they help density, hypertrophy, or complementary pairing. Not every workout. Never on the main heavy lift.
- Purposeful variety across days. Do not rotate randomly. Primaries should be distinct across similar days (e.g. Full Body A vs B) but repeatable across weeks.

Internally review before you answer:
1) Are similar days meaningfully different?
2) Is movement-pattern coverage reasonable across the week?
3) Is duplication unnecessary?
4) Does each warm-up match that day's lifts?
5) Are supersets intentional?
6) Can it fit the time cap?
7) Does it support the stated goal?

Return JSON only:
{
  "summary": "string",
  "coaching_notes": "string",
  "quality_review": { "passed": true, "notes": "string" },
  "workouts": [
    {
      "day_label": "Mon",
      "name": "Full Body A",
      "emphasis": "Squat / horizontal push",
      "warmup": [{ "name": "Goblet Squat", "sets": 1, "reps": "8" }],
      "potentiation": { "name": "Vertical Jump", "sets": 2, "reps": "3" },
      "strength": [
        { "name": "Back Squat", "sets": 3, "reps": "5-6", "target_rir": 2, "role": "primary" },
        { "superset": [
          { "name": "Barbell Bench Press", "sets": 3, "reps": "6-8", "target_rir": 2, "role": "secondary" },
          { "name": "Dumbbell Row", "sets": 3, "reps": "8-10", "target_rir": 2, "role": "secondary" }
        ]}
      ],
      "cooldown": [{ "name": "Doorway Pec Stretch", "sets": 1, "reps": "30 sec/side" }]
    }
  ]
}
Use null for potentiation when it is not appropriate.`;

  const user = JSON.stringify({
    user_request: userPrompt,
    athlete: {
      goal: profile.primaryGoal,
      experience: profile.experienceLevel,
      days_per_week: profile.trainingDaysPerWeek,
      session_minutes: profile.preferredSessionMinutes,
      equipment: profile.availableEquipment,
      preferred_exercises: profile.preferredExercises,
      excluded_exercises: profile.excludedExercises,
      pain_areas: profile.painAreas,
      limitations: profile.injuryLimitations,
    },
    week_skeleton: week1.map((w) => ({
      day_label: w.dayLabel,
      workout_type: w.workoutType,
      suggested_name: w.name,
      suggested_emphasis: w.emphasis || '',
      science_seed_exercises: w.exercises.map((ex) => ex.name),
    })),
    weekly_muscle_targets: program.volumeTargets.map((t) => ({
      muscle: t.muscle,
      target_sets: t.targetSets,
      priority: t.priority,
    })),
    approved_library: library,
  });

  return { system, user };
}
