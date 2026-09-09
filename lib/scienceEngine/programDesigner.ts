import { SCIENCE_ENGINE_VERSION } from './version';
import { designerExercisePool } from './designerCatalog';
import type { RecentLiftSummary } from './recentTraining';
import type { CatalogExercise, ScienceProgram, TrainingProfile } from './types';

export function buildProgramDesignerPrompt(
  program: ScienceProgram,
  profile: TrainingProfile,
  userPrompt: string,
  catalog: CatalogExercise[] = [],
  recentTraining: RecentLiftSummary[] = []
) {
  const week1 = program.workouts.filter((w) => w.week === 1);
  const library = designerExercisePool(catalog, profile);
  const fullBodyDays = week1.filter((w) => w.workoutType === 'Full Body').length;

  const system = `You are a strength-and-conditioning program designer for BuiltIQ Health (science engine ${SCIENCE_ENGINE_VERSION}).

Design ONE training WEEK as a PROGRAM. Sessions must complement each other. Do not treat days as unrelated workouts.

Hard constraints (do not break):
- Keep the supplied days, day labels, and day types.
- Stay within ${profile.preferredSessionMinutes} minutes per session. A 30-minute session is concise (fewer accessories, strategic supersets). A ~60-minute full-body session often has about 6-8 meaningful strength movements, not three compounds. Do not ignore duration.
- Do not use excluded exercises: ${(profile.excludedExercises || []).join(', ') || 'none'}.
- Do not diagnose injury. Respect pain areas: ${(profile.painAreas || []).join(', ') || 'none'}.
- Limitations: ${(profile.injuryLimitations || []).join(' ') || 'none'}.
- Choose strength exercises from approved_library names (exact names). Prefer common proven lifts. Novelty is not a reason by itself.
- Primary heavy compounds stay as straight_sets. Never superset a heavy squat, deadlift, or bench with another heavy compound.
- This week is the cycle template. Primaries should persist across weeks so the user can progress. Do not invent a different workout for each week.
- RIR 0-4. Typical primary 1-3 RIR.
- Superset preference: ${profile.supersetPreference || 'sometimes'}. Even if frequently, do not turn every lift into a superset. Protect primary recovery.
- Variety preference: ${profile.varietyPreference || 'balanced'}. Consistent keeps primaries stable. High variety still needs progression. Never random rotation.

Programming judgment (you own this — do not fill predetermined slots):
- Session emphasis so similar days are intentionally different.
- Movement-pattern balance across the WEEK, not equally in every session.
- Exercise selection, order, accessories, and whether a finisher/core/carry belongs.
- Warm-up AFTER you choose that day's strength work, so it prepares those lifts, joints, and planes. Do not copy the same warm-up to every day.
- Optional low-volume potentiation only when it fits the user, goal, and session. Not every day.
- Optional supersets only when they help density, hypertrophy, complementary pairing, or a short session. A day may have zero, one, or several. Never a rigid Main-Lift + superset + superset pattern.
- Purposeful variety. Do not rotate exercises just to look different.

Full-body guidance when ${fullBodyDays || 'multiple'} full-body sessions exist:
- Make A/B/C meaningfully different (example thinking, NOT a template: squat/horizontal-push vs hinge/vertical-push vs unilateral/athletic).
- Cover squat, hinge, horizontal push/pull, and vertical push or pull across the week.
- A full-body session is not three compounds. Aim for meaningful whole-body exposure (knee-dominant, hip-dominant, chest, back, shoulders and/or vertical push, lats and/or vertical pull, core; arms when appropriate).
- Unilateral, core/carry, and rotation work can appear without being cloned every day.

Superset frequency by goal (${profile.primaryGoal}):
- strength: few supersets, more recovery on primaries.
- hypertrophy: intelligent accessory supersets are welcome.
- general_fitness / fat_loss_support: moderate supersets for efficiency.
- athletic_performance: use supersets carefully; do not blunt power or primary quality.
- short sessions: supersets may help fit volume.

Avoid: heavy squat + heavy RDL; heavy deadlift + bent-over row; two chest presses; two high lower-back-fatigue compounds.

Session structure is flexible. A day may include some of: dynamic warm-up, potentiation, primary, secondary, accessories, optional supersets, core/carries, optional finisher, cooldown. Not every section every day.

Primary-lift ramp-up sets are separate from the dynamic warm-up. For a heavy squat/deadlift/bench you MAY include set_details warmup sets then working sets. Keep ramp volume modest. If omitted, the system will add ramps.

Internally review, then revise before you answer:
1) Are similar days meaningfully different?
2) Is weekly movement-pattern coverage reasonable?
3) Is duplication unnecessary?
4) Are primaries distributed (not the same heavy lift every full-body day)?
5) Is cumulative fatigue reasonable?
6) Does each warm-up prepare THAT day's lifts?
7) Are warm-ups unnecessarily identical?
8) Is potentiation appropriate (or correctly omitted)?
9) Are supersets intentional, not automatic?
10) Could any superset compromise an important lift?
11) Are choices common and appropriate, not obscure?
12) Does exercise order make sense (hardest / most technical first)?
13) Can it fit the time cap?
14) Does it support the stated goal?
15) Is there enough consistency for progressive overload?
16) Is variation purposeful rather than random?

Return JSON only. Use blocks. Reuse existing grouping (straight_sets, superset, tri_set). Circuit is allowed as a 3-move tri_set. Do not require every block type.
{
  "summary": "string",
  "coaching_notes": "string",
  "quality_review": { "passed": true, "notes": "string" },
  "workouts": [
    {
      "day_label": "Mon",
      "name": "Full Body A",
      "emphasis": "session emphasis in your words",
      "warmup": [{ "name": "library or simple prep name", "sets": 1, "reps": "8" }],
      "potentiation": null,
      "strength": [
        { "type": "straight_sets", "exercises": [{ "name": "Back Squat", "sets": 3, "reps": "5-6", "target_rir": 2, "role": "primary" }] },
        { "type": "superset", "exercises": [
          { "name": "Barbell Bench Press", "sets": 3, "reps": "6-8", "target_rir": 2, "role": "secondary" },
          { "name": "Dumbbell Row", "sets": 3, "reps": "8-10", "target_rir": 2 }
        ]}
      ],
      "cooldown": [{ "name": "Doorway Pec Stretch", "sets": 1, "reps": "30 sec/side" }]
    }
  ]
}
The JSON shape above is a format example, not a workout to copy. Use null for potentiation when it is not appropriate. The { "name", "sets" } and { "superset": [...] } shapes are also accepted.`;

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
      training_split: profile.trainingSplit || '',
      priority_areas: profile.focusLabels || [],
      superset_preference: profile.supersetPreference || 'sometimes',
      variety_preference: profile.varietyPreference || 'balanced',
      training_feel: profile.trainingFeel || [],
      notes: profile.intakeNotes || '',
    },
    week_to_design: week1.map((w) => ({
      day_label: w.dayLabel,
      workout_type: w.workoutType,
      suggested_name: w.name,
      suggested_emphasis: w.emphasis || '',
    })),
    weekly_muscle_targets: program.volumeTargets.map((t) => ({
      muscle: t.muscle,
      target_sets: t.targetSets,
      priority: t.priority,
    })),
    recent_training: recentTraining,
    programming_note:
      'recent_training is for consistency and progression later. Keep important primaries if they still fit. Do not randomly replace lifts the athlete has been practicing. This week will be copied across the program cycle.',
    approved_library: library,
  });

  return { system, user };
}
