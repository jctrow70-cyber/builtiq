import { catalogMatchesFocus, FOCUS_WEEKLY_SETS, pickCatalogForFocus } from './focusMuscles';

type ExerciseTuple = [string, string, number, string, string, string];
type TemplateSection = { warmup: any[]; strength: any[] };

function exerciseTupleFromCatalog(item: any, sets = 3): ExerciseTuple {
  return [item.name, item.muscle_group || 'Muscle', sets, '8-12', '7-8', ''];
}

function cloneTemplate(tpl: TemplateSection): TemplateSection {
  return {
    warmup: [...(tpl.warmup || [])],
    strength: [...(tpl.strength || [])],
  };
}

function nameInTemplate(list: any[], name: string): boolean {
  const lower = name.toLowerCase();
  return list.some((item) => {
    if (Array.isArray(item)) return String(item[0]).toLowerCase() === lower;
    if (item?.superset) return item.superset.some((s: any[]) => String(s[0]).toLowerCase() === lower);
    return false;
  });
}

/**
 * Adds focus-muscle volume to a workout template using catalog exercises.
 * Targets ~3 extra working sets per focus muscle per session when matched.
 */
export function applyFocusToWorkoutTemplate(
  baseTpl: TemplateSection,
  focusMuscles: string[],
  catalog: any[]
): TemplateSection {
  if (!focusMuscles?.length) return baseTpl;

  const tpl = cloneTemplate(baseTpl);
  const extra: ExerciseTuple[] = [];

  focusMuscles.forEach((focus) => {
    const picks = pickCatalogForFocus(catalog, focus, 1);
    picks.forEach((item) => {
      if (nameInTemplate(tpl.strength, item.name)) return;
      extra.push(exerciseTupleFromCatalog(item, FOCUS_WEEKLY_SETS.perSession));
    });
  });

  if (extra.length) tpl.strength = [...tpl.strength, ...extra];
  return tpl;
}

export function estimateWeeklyFocusSets(
  focusMuscles: string[],
  dayTypes: Record<string, string>,
  days: string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  focusMuscles.forEach((f) => {
    counts[f] = 0;
  });

  days.forEach((day) => {
    const type = dayTypes[day] || 'Full Body';
    focusMuscles.forEach((focus) => {
      if (type === 'Lower Body' && ['Hamstrings', 'Quads', 'Glutes'].includes(focus)) {
        counts[focus] += FOCUS_WEEKLY_SETS.perSession;
      } else if (type === 'Upper Body' && ['Chest', 'Lats', 'Traps', 'Shoulders', 'Arms'].includes(focus)) {
        counts[focus] += FOCUS_WEEKLY_SETS.perSession;
      } else if (type === 'Full Body') {
        counts[focus] += FOCUS_WEEKLY_SETS.perSession;
      }
    });
  });

  return counts;
}
