import masterFile from './data/builtiq-master-catalog.json';
import { inferExerciseType } from './exerciseTypes';
import type { MovementPattern } from './exerciseIntelligence';
import type { MappedCatalogRow } from './catalogImportTypes';

export const MASTER_CATALOG_SOURCE = 'builtiq_master';

export type MasterLibraryRecord = {
  id: string;
  name: string;
  aliases?: string;
  primary_muscle?: string;
  secondary_muscles?: string;
  movement_pattern?: string;
  category?: string;
  default_equipment?: string;
  compatible_equipment?: string;
  setup?: string;
  execution?: string;
  form_cues?: string;
  design_notes?: string;
  active?: string;
};

const ADD_ON_ROWS: MasterLibraryRecord[] = [
  {
    id: '249',
    name: 'Power Clean',
    aliases: 'Clean; DB Clean; Dumbbell Clean',
    primary_muscle: 'Full Body',
    secondary_muscles: 'Glutes; Quads; Hamstrings; Traps; Shoulders',
    movement_pattern: 'Hinge/Power',
    category: 'Power',
    default_equipment: 'Barbell',
    compatible_equipment: 'Barbell; Dumbbell; Kettlebell',
    setup: 'Stand over the bar or bells with a hip-width stance and a flat back.',
    execution: 'Extend hips and knees explosively and catch the load on the shoulders.',
    form_cues: 'Jump the weight; Fast elbows; Soft catch',
    design_notes: 'One clean card. Keep Kettlebell Clean (174) for the KB rack path.',
    active: 'Yes',
  },
  {
    id: '250',
    name: 'Windmill',
    aliases: 'KB Windmill; Advanced Kettlebell Windmill',
    primary_muscle: 'Obliques',
    secondary_muscles: 'Shoulders; Hamstrings',
    movement_pattern: 'Rotation',
    category: 'Core',
    default_equipment: 'Kettlebell',
    compatible_equipment: 'Kettlebell; Dumbbell',
    setup: 'Press one bell overhead and turn the feet about 45 degrees toward the free hand.',
    execution: 'Hinge and rotate to the free-hand side, then stand back up with the overhead arm locked.',
    form_cues: 'Eyes on the bell; Long overhead arm; Hinge do not just side-bend',
    design_notes: 'Advanced is a difficulty label, not a separate exercise.',
    active: 'Yes',
  },
  {
    id: '251',
    name: 'Side Bend',
    aliases: '45° Side Bend; Roman Chair Side Bend',
    primary_muscle: 'Obliques',
    secondary_muscles: 'QL',
    movement_pattern: 'Lateral Flexion',
    category: 'Core',
    default_equipment: 'Bodyweight',
    compatible_equipment: 'Bodyweight; Dumbbell; Kettlebell; 45° Back Extension',
    setup: 'Stand tall or brace on a 45° back-extension pad with the downside hip supported.',
    execution: 'Lower sideways through the waist, then lift back to a tall torso.',
    form_cues: 'Move at the waist; Do not twist; Controlled range',
    design_notes: 'Lateral flexion. Do not merge with Back Extension (80).',
    active: 'Yes',
  },
  {
    id: '252',
    name: 'Pull-Up Work',
    aliases: 'Pull up work',
    primary_muscle: 'Lats',
    secondary_muscles: 'Biceps; Upper Back',
    movement_pattern: 'Vertical Pull',
    category: 'Compound',
    default_equipment: 'Bodyweight',
    compatible_equipment: 'Bodyweight; Band',
    setup: 'Hang from a bar with the grip you are working that day.',
    execution: 'Pull the chest toward the bar, or accumulate assisted / partial reps as written.',
    form_cues: 'Ribs down; Full hang if able; Own the last inch',
    design_notes: 'Household logged this as its own card, separate from Pull-Up and Chin-Up.',
    active: 'Yes',
  },
  {
    id: '253',
    name: 'Trunk Rotation',
    aliases: 'Cable Trunk Rotation',
    primary_muscle: 'Obliques',
    secondary_muscles: 'Abs',
    movement_pattern: 'Rotation',
    category: 'Core',
    default_equipment: 'Cable',
    compatible_equipment: 'Cable; Band; Landmine',
    setup: 'Stand side-on to a cable or band at chest height, arms extended.',
    execution: 'Rotate the trunk against the line of pull, then return with control.',
    form_cues: 'Turn from the ribs; Soft knees; Do not yank the arms',
    design_notes: 'Cable is the default implement. Do not map to Cable Chop unless it was a high-to-low chop.',
    active: 'Yes',
  },
  {
    id: '254',
    name: 'Plate Front Raise',
    aliases: 'Squat plate front raise',
    primary_muscle: 'Front Delts',
    secondary_muscles: 'Upper Chest',
    movement_pattern: 'Shoulder Flexion',
    category: 'Isolation',
    default_equipment: 'Plate',
    compatible_equipment: 'Plate; Dumbbell',
    setup: 'Hold a plate at the hips or in a goblet position, standing tall.',
    execution: 'Raise the plate to shoulder height and lower under control.',
    form_cues: 'Soft elbows; Do not swing; Ribs down',
    design_notes: 'Household mixed-name lift. Separate from Front Raise so the plate version stays its own card.',
    active: 'Yes',
  },
];

function splitList(raw?: string): string[] {
  return String(raw || '')
    .split(/[;|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function mapMasterMovementPattern(raw?: string | null): MovementPattern {
  const v = String(raw || '').toLowerCase();
  if (v.includes('mobility') || v.includes('stretch')) return 'rotation';
  if (v.includes('vertical push')) return 'push_vertical';
  if (v.includes('horizontal push') || v.includes('diagonal push')) return 'push_horizontal';
  if (v.includes('vertical pull') || v.includes('hang')) return 'pull_vertical';
  if (v.includes('horizontal pull') || v.includes('diagonal pull')) return 'pull_horizontal';
  if (v.includes('cardio') || v.includes('conditioning') || v.includes('locomotion')) return 'cardio';
  if (v.includes('carry')) return 'carry';
  if (v.includes('hinge') || (v.includes('hip extension') && !v.includes('flexion'))) return 'hinge';
  if (v.includes('squat') || v.includes('lunge') || v.includes('jump') || v.includes('step')) return 'squat';
  if (v.includes('rotation') || v.includes('lateral flexion') || v.includes('thoracic')) return 'rotation';
  if (v.includes('throw')) return 'push_horizontal';
  return 'isolation';
}

function mapCatalogCategory(raw: string, exerciseType: string): string {
  const v = String(raw || '').toLowerCase();
  if (v.includes('mobility')) return 'mobility';
  if (v.includes('cardio') || v.includes('conditioning')) return 'cardio';
  if (v.includes('plyometric') || v.includes('power')) return 'plyometric';
  if (v.includes('prehab')) return 'warmup';
  if (exerciseType === 'mobility') return 'mobility';
  if (exerciseType === 'cardio') return 'cardio';
  return 'strength';
}

function buildInstructions(record: MasterLibraryRecord): string | null {
  const parts = [
    record.setup ? `Setup: ${record.setup}` : '',
    record.execution ? `Execution: ${record.execution}` : '',
    record.form_cues ? `Cues: ${record.form_cues}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join('\n\n') : null;
}

export function loadMasterLibraryRecords(): MasterLibraryRecord[] {
  const raw = ((masterFile as any)?.records || []) as MasterLibraryRecord[];
  const byId = new Map<string, MasterLibraryRecord>();
  raw.forEach((row) => {
    if (!row?.id || !row?.name) return;
    byId.set(String(row.id), { ...row, id: String(row.id) });
  });
  ADD_ON_ROWS.forEach((row) => byId.set(row.id, row));

  const pullThrough = byId.get('79');
  if (pullThrough) {
    const aliases = new Set(splitList(pullThrough.aliases));
    aliases.add('Cable Pull-Through');
    aliases.add('Pull Through');
    byId.set('79', {
      ...pullThrough,
      name: 'Pull-Through',
      aliases: Array.from(aliases).join('; '),
    });
  }

  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

export function masterRecordToCatalogRow(record: MasterLibraryRecord): MappedCatalogRow {
  const name = record.name.trim();
  const primary = String(record.primary_muscle || '').trim();
  const secondaries = splitList(record.secondary_muscles);
  const aliases = splitList(record.aliases);
  const compatible = splitList(record.compatible_equipment);
  const defaultEquipment = String(record.default_equipment || compatible[0] || '').trim();
  const movement_pattern = mapMasterMovementPattern(record.movement_pattern);
  const exercise_type = inferExerciseType(name, primary, String(record.category || ''), '');
  const category = mapCatalogCategory(record.category || '', exercise_type);
  const fullBody = /full\s*body/i.test(primary);
  const muscle_targets = fullBody && secondaries.length
    ? secondaries.map((muscle, i) => ({
        muscle,
        percentage: Math.max(1, Math.floor(100 / secondaries.length) + (i === 0 ? 100 % secondaries.length : 0)),
        role: (i < 2 ? 'primary' : 'secondary') as 'primary' | 'secondary',
      }))
    : [
        ...(primary ? [{ muscle: primary, percentage: 60, role: 'primary' as const }] : []),
        ...secondaries.map((muscle, i) => ({
          muscle,
          percentage: Math.max(1, Math.floor(40 / secondaries.length) + (i === 0 ? 40 % secondaries.length : 0)),
          role: 'secondary' as const,
        })),
      ];

  return {
    name,
    category,
    muscle_group: primary || secondaries[0] || '',
    equipment: defaultEquipment,
    movement_pattern,
    exercise_type,
    instructions: buildInstructions(record),
    media_url: null,
    image_url: null,
    gif_url: null,
    external_source: MASTER_CATALOG_SOURCE,
    external_id: String(record.id),
    training_goal: category === 'mobility' ? 'mobility' : category === 'plyometric' ? 'power' : 'strength',
    progression_type: exercise_type === 'cardio' || exercise_type === 'timed' ? 'duration' : 'weight',
    primary_muscle_percentage: fullBody ? 100 : primary ? 60 : null,
    secondary_muscle_percentage: fullBody ? null : secondaries.length ? 40 : null,
    muscle_targets,
    coaching_metadata: {
      aliases,
      compatible_equipment: compatible.length ? compatible : defaultEquipment ? [defaultEquipment] : [],
      default_equipment: defaultEquipment,
      master_movement: record.movement_pattern || '',
      master_category: record.category || '',
      design_notes: record.design_notes || '',
      coaching_cues: splitList(record.form_cues),
    },
    is_system: true,
    user_id: null,
    is_archived: false,
  };
}

export function expectedMasterCatalogCount() {
  return loadMasterLibraryRecords().length;
}
