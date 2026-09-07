import { SCIENCE_ENGINE_VERSION } from './version';
import type { ScienceProgram, TrainingProfile } from './types';

export function buildScienceCoachPrompt(program: ScienceProgram, profile: TrainingProfile, userPrompt: string): {
  system: string;
  user: string;
} {
  const approved = program.workouts
    .filter((w) => w.week === 1)
    .flatMap((w) =>
      w.exercises.map((ex) => ({
        exercise_id: ex.exerciseId || ex.name,
        name: ex.name,
        sets: ex.sets,
        rep_min: ex.repMin,
        rep_max: ex.repMax,
        target_rir: ex.targetRir,
        rest_seconds: ex.restSeconds,
        role: ex.role,
      }))
    );

  const system = `You are the coaching layer for BuiltIQ Health.

BuiltIQ uses a deterministic evidence-informed training engine (version ${SCIENCE_ENGINE_VERSION}).

You MUST follow all programming constraints supplied by the BuiltIQ Science Engine.

You MAY:
- choose among approved exercises
- organize approved options
- explain programming decisions
- personalize coaching
- explain progression
- suggest approved equivalent substitutions
- provide natural-language feedback

You MAY NOT independently change:
- weekly muscle-volume targets
- progression decisions
- RIR limits
- pain restrictions
- recovery decisions
- deload decisions
- warm-up fatigue limits
- Power Primer fatigue limits
- maximum workout duration
- hard exercise restrictions

Never invent workout history.
Never claim that a user progressed unless performance data demonstrates it.
Never diagnose an injury or medical condition.
If required data is missing, identify missing data rather than inventing it.
Return structured JSON only.

JSON schema:
{
  "summary": "string",
  "explanation": "string",
  "coaching_notes": "string",
  "workouts": [
    {
      "name": "string",
      "day_label": "Mon",
      "exercises": [
        {
          "exercise_id": "string",
          "sets": 3,
          "rep_min": 6,
          "rep_max": 8,
          "target_rir": 2,
          "rest_seconds": 180,
          "coaching_note": "string"
        }
      ]
    }
  ]
}`;

  const user = JSON.stringify({
    user_request: userPrompt,
    science_engine_version: SCIENCE_ENGINE_VERSION,
    athlete: {
      goal: profile.primaryGoal,
      experience: profile.experienceLevel,
      training_days: profile.trainingDaysPerWeek,
      session_minutes: profile.preferredSessionMinutes,
      pain_areas: profile.painAreas,
      excluded_exercises: profile.excludedExercises,
    },
    weekly_muscle_targets: program.volumeTargets.map((t) => ({
      muscle: t.muscle,
      target_sets: t.targetSets,
      priority: t.priority,
    })),
    approved_exercises: approved,
    program_summary: program.summary,
    hard_rules: {
      progression_method: 'double_progression',
      warmup_required: true,
      power_primer_mode: profile.potentiationPreference,
      max_session_minutes: profile.preferredSessionMinutes,
    },
  });

  return { system, user };
}
