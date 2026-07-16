-- BIQ-0027: Basic exercise catalog pack + user source preferences
-- Tags existing system seed as builtiq_essentials; adds builtiq_basic library; profile source filter.

-- Tag legacy Build IQ system seed rows
update public.st_exercise_catalog
set external_source = 'builtiq_essentials',
    external_id = coalesce(external_id, 'essentials_' || lower(regexp_replace(name, '[^a-zA-Z0-9]+', '_', 'g')))
where is_system = true
  and user_id is null
  and (external_source is null or external_source = '');

-- User preference: which catalog packs appear in exercise search
alter table public.st_profiles
  add column if not exists catalog_sources text[] default array['builtiq_essentials', 'builtiq_basic']::text[];

comment on column public.st_profiles.catalog_sources is
  'Enabled exercise libraries for search: builtiq_essentials, builtiq_basic, free_exercise_db';

-- Basic gym library — common exercises with clear names (keeps essentials separate)
insert into public.st_exercise_catalog (
  name, category, muscle_group, equipment, movement_pattern,
  is_system, user_id, external_source, external_id, exercise_type
)
select v.name, v.category, v.muscle_group, v.equipment, v.movement_pattern,
       true, null, 'builtiq_basic', v.external_id, v.exercise_type
from (
  values
    ('Push-Up', 'strength', 'Chest', 'bodyweight', 'push_horizontal', 'basic_push_up', 'strength'),
    ('Dip', 'strength', 'Chest', 'bodyweight', 'push_vertical', 'basic_dip', 'strength'),
    ('Sit-Up', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_sit_up', 'strength'),
    ('Crunch', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_crunch', 'strength'),
    ('Russian Twist', 'strength', 'Core', 'bodyweight', 'rotation', 'basic_russian_twist', 'strength'),
    ('Leg Press', 'strength', 'Quads', 'machine', 'squat', 'basic_leg_press', 'strength'),
    ('Hack Squat', 'strength', 'Quads', 'machine', 'squat', 'basic_hack_squat', 'strength'),
    ('Smith Machine Squat', 'strength', 'Quads', 'machine', 'squat', 'basic_smith_squat', 'strength'),
    ('Calf Raise', 'strength', 'Calves', 'machine', 'isolation', 'basic_calf_raise', 'strength'),
    ('Standing Calf Raise', 'strength', 'Calves', 'dumbbell', 'isolation', 'basic_standing_calf_raise', 'strength'),
    ('Leg Press Calf Raise', 'strength', 'Calves', 'machine', 'isolation', 'basic_leg_press_calf', 'strength'),
    ('Pec Deck', 'strength', 'Chest', 'machine', 'isolation', 'basic_pec_deck', 'strength'),
    ('Cable Fly', 'strength', 'Chest', 'cable', 'isolation', 'basic_cable_fly', 'strength'),
    ('Dumbbell Fly', 'strength', 'Chest', 'dumbbell', 'isolation', 'basic_db_fly', 'strength'),
    ('Hammer Curl', 'strength', 'Biceps', 'dumbbell', 'isolation', 'basic_hammer_curl', 'strength'),
    ('Preacher Curl', 'strength', 'Biceps', 'barbell', 'isolation', 'basic_preacher_curl', 'strength'),
    ('Concentration Curl', 'strength', 'Biceps', 'dumbbell', 'isolation', 'basic_concentration_curl', 'strength'),
    ('Overhead Tricep Extension', 'strength', 'Triceps', 'dumbbell', 'isolation', 'basic_oh_tricep_ext', 'strength'),
    ('Tricep Kickback', 'strength', 'Triceps', 'dumbbell', 'isolation', 'basic_tricep_kickback', 'strength'),
    ('Shrugs', 'strength', 'Traps', 'dumbbell', 'isolation', 'basic_shrugs', 'strength'),
    ('Upright Row', 'strength', 'Shoulders', 'barbell', 'pull_vertical', 'basic_upright_row', 'strength'),
    ('Rear Delt Fly', 'strength', 'Rear Delts', 'dumbbell', 'isolation', 'basic_rear_delt_fly', 'strength'),
    ('Front Raise', 'strength', 'Front Delts', 'dumbbell', 'isolation', 'basic_front_raise', 'strength'),
    ('Arnold Press', 'strength', 'Shoulders', 'dumbbell', 'push_vertical', 'basic_arnold_press', 'strength'),
    ('T-Bar Row', 'strength', 'Mid Back', 'barbell', 'pull_horizontal', 'basic_tbar_row', 'strength'),
    ('Chest Supported Row', 'strength', 'Mid Back', 'machine', 'pull_horizontal', 'basic_chest_supported_row', 'strength'),
    ('Straight Arm Pulldown', 'strength', 'Lats', 'cable', 'isolation', 'basic_straight_arm_pulldown', 'strength'),
    ('Single Arm Row', 'strength', 'Mid Back', 'dumbbell', 'pull_horizontal', 'basic_single_arm_row', 'strength'),
    ('Step-Up', 'strength', 'Quads', 'dumbbell', 'lunge', 'basic_step_up', 'strength'),
    ('Reverse Lunge', 'strength', 'Quads', 'dumbbell', 'lunge', 'basic_reverse_lunge', 'strength'),
    ('Sumo Deadlift', 'strength', 'Glutes', 'barbell', 'hinge', 'basic_sumo_deadlift', 'strength'),
    ('Good Morning', 'strength', 'Hamstrings', 'barbell', 'hinge', 'basic_good_morning', 'strength'),
    ('Glute Ham Raise', 'strength', 'Hamstrings', 'machine', 'hinge', 'basic_ghr', 'strength'),
    ('Cable Pull-Through', 'strength', 'Glutes', 'cable', 'hinge', 'basic_cable_pullthrough', 'strength'),
    ('Ab Wheel Rollout', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_ab_wheel', 'strength'),
    ('Hanging Leg Raise', 'strength', 'Core', 'bodyweight', 'isolation', 'basic_hanging_leg_raise', 'strength'),
    ('Mountain Climber', 'warmup', 'Full Body', 'bodyweight', 'cardio', 'basic_mountain_climber', 'cardio'),
    ('Jump Rope', 'warmup', 'Cardio', 'bodyweight', 'cardio', 'basic_jump_rope', 'cardio'),
    ('Treadmill Walk', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_treadmill_walk', 'cardio'),
    ('Elliptical', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_elliptical', 'cardio'),
    ('Stair Climber', 'warmup', 'Cardio', 'machine', 'cardio', 'basic_stair_climber', 'cardio'),
    ('Cat Cow', 'warmup', 'Full Body', 'bodyweight', 'mobility', 'basic_cat_cow', 'mobility'),
    ('Hip Flexor Stretch', 'cooldown', 'Hip Flexors', 'bodyweight', 'mobility', 'basic_hip_flexor_stretch', 'mobility'),
    ('Figure Four Stretch', 'cooldown', 'Glutes', 'bodyweight', 'mobility', 'basic_figure_four', 'mobility'),
    ('Doorway Stretch', 'cooldown', 'Chest', 'bodyweight', 'mobility', 'basic_doorway_stretch', 'mobility'),
    ('Cross-Body Shoulder Stretch', 'cooldown', 'Shoulders', 'bodyweight', 'mobility', 'basic_cross_body_shoulder', 'mobility')
) as v(name, category, muscle_group, equipment, movement_pattern, external_id, exercise_type)
where not exists (
  select 1 from public.st_exercise_catalog c
  where c.external_source = 'builtiq_basic' and c.external_id = v.external_id
);
