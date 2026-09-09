import type { AiExercise, AiProgramPlan, AiWorkout, GenerationConfig } from '../training/aiProgramPlan';
import { rirToRpe } from './prescription';
import type { ExercisePrescription, ScienceProgram, ScienceWorkout, WarmupItem } from './types';

export function scienceProgramToAiPlan(program: ScienceProgram, config?: Partial<GenerationConfig>): AiProgramPlan {
  return {
    program_name: config?.programName || program.name,
    program_summary: program.summary,
    coaching_notes: program.explanations.join(' '),
    program_style: styleFromName(program.name),
    workouts: program.workouts.map(toAiWorkout),
  };
}

function toAiWorkout(workout: ScienceWorkout): AiWorkout {
  const warmup: AiExercise[] = [
    ...workout.warmup.map((item) => warmupToAi(item, 'Dynamic warm-up')),
    ...workout.potentiation.map((item) => prescriptionToAi(item, 'POWER PRIMER')),
  ];
  const strength = strengthItems(workout);
  const cooldown = workout.cooldown.map((item) => warmupToAi(item, 'Cooldown'));
  return {
    week: workout.week,
    day_label: workout.dayLabel,
    workout_type: workout.name || workout.workoutType,
    warmup,
    strength: strength as any,
    cooldown,
  };
}

function strengthItems(workout: ScienceWorkout) {
  const out: Array<AiExercise | { superset: AiExercise[] }> = [];
  const seen = new Set<string>();
  workout.exercises.forEach((ex) => {
    if (ex.supersetGroupId) {
      if (seen.has(ex.supersetGroupId)) return;
      seen.add(ex.supersetGroupId);
      const group = workout.exercises
        .filter((row) => row.supersetGroupId === ex.supersetGroupId)
        .sort((a, b) => (a.supersetOrder || 0) - (b.supersetOrder || 0))
        .map((row) => withRamp(workout, row));
      if (group.length >= 2) out.push({ superset: group });
      else out.push(...group);
      return;
    }
    out.push(withRamp(workout, ex));
  });
  return out;
}

function withRamp(workout: ScienceWorkout, ex: ExercisePrescription): AiExercise {
  const item = prescriptionToAi(ex);
  if (workout.rampFor && ex.name === workout.rampFor && workout.rampSets.length) {
    item.set_details = [
      ...workout.rampSets.map((ramp) => ({
        set_type: 'warmup',
        weight: ramp.weight || '',
        reps: String(ramp.reps),
      })),
      ...Array.from({ length: ex.sets }, () => ({
        set_type: 'working',
        reps: `${ex.repMin}-${ex.repMax}`,
        rir: ex.targetRir,
      })),
    ];
  }
  return item;
}

function warmupToAi(item: WarmupItem, note: string): AiExercise {
  return {
    name: item.name,
    muscle_group: item.muscleGroup,
    sets: item.sets,
    reps: item.reps,
    rpe: '4-5',
    notes: note,
  };
}

function prescriptionToAi(ex: ExercisePrescription, note?: string): AiExercise {
  return {
    name: ex.name,
    muscle_group: ex.muscleGroup,
    sets: ex.sets,
    reps: `${ex.repMin}-${ex.repMax}`,
    rpe: rirToRpe(ex.targetRir),
    target_rir: ex.targetRir,
    rest_seconds: ex.restSeconds,
    notes: note || ex.coachingNote || ex.why,
  };
}

function styleFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('hypertrophy')) return 'hypertrophy';
  if (n.includes('strength')) return 'strength';
  if (n.includes('athletic')) return 'athletic_performance';
  return 'general';
}
