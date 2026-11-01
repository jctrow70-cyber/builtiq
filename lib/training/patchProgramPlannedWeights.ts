export function patchProgramPlannedWeights(program: any, mutations: Array<{ planned_set_id: string; to: string }>) {
  if (!program) return program;
  const next = { ...program, st_workouts: (program.st_workouts || []).map((w: any) => ({
    ...w,
    st_exercises: (w.st_exercises || []).map((ex: any) => ({
      ...ex,
      st_planned_sets: (ex.st_planned_sets || []).map((s: any) => {
        const hit = mutations.find((m) => m.planned_set_id === s.id);
        return hit ? { ...s, target_weight: hit.to } : s;
      }),
    })),
  })) };
  return next;
}
