export type ShellProgramLoad = 'training' | 'setup';

const SHELL_PROGRAM_SKIP = new Set(['Nutrition', 'Progress', 'Settings', 'AI Coach']);

/**
 * Shell program tree for this tab.
 * Nutrition, Progress, Settings, and AI Coach do not render it.
 * Groups uses the setup list. Training, Dashboard, and Programs keep the training load.
 */
export function shellProgramLoadForNav(appNav: string): ShellProgramLoad | null {
  if (SHELL_PROGRAM_SKIP.has(appNav)) return null;
  if (appNav === 'Groups') return 'setup';
  return 'training';
}

/** Manager assign-program list is only read on the Groups screen. */
export function groupAssignLoadForNav(appNav: string): boolean {
  return appNav === 'Groups';
}

export function assignmentLoadKey(
  map: Record<string, { program_id?: string | null; assignment_type?: string | null }> | null | undefined
): string {
  if (!map) return '';
  return Object.keys(map)
    .sort()
    .map((id) => {
      const row = map[id] || {};
      return `${id}:${row.program_id || ''}:${row.assignment_type || ''}`;
    })
    .join(',');
}

export function programLoadKey(input: {
  context: ShellProgramLoad;
  userId: string;
  teamId: string | null;
  mode: string;
  followedProgramId: string | null;
  editProgramId: string | null;
  preserveWorkoutId: string | null;
  assignmentKey: string;
}): string {
  return [
    input.context,
    input.userId,
    input.teamId || '',
    input.mode,
    input.followedProgramId || '',
    input.editProgramId || '',
    input.preserveWorkoutId || '',
    input.assignmentKey,
  ].join('\n');
}

type Flight = {
  key: string;
  generation: number;
  promise: Promise<void>;
};

/**
 * One in-flight program load per key.
 * A newer key invalidates older responses so they cannot overwrite the screen.
 */
export function createProgramLoadGate() {
  let generation = 0;
  let flight: Flight | null = null;

  return {
    isCurrent(gen: number) {
      return gen === generation;
    },
    begin(key: string, run: (generation: number) => Promise<void>) {
      if (flight && flight.key === key) return flight.promise;
      const gen = ++generation;
      const promise = Promise.resolve()
        .then(() => run(gen))
        .finally(() => {
          if (flight && flight.generation === gen) flight = null;
        });
      flight = { key, generation: gen, promise };
      return promise;
    },
  };
}
