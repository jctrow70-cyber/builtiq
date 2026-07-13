-- BIQ-0013: Curated system exercise alternatives (name-based; safe to re-run)

insert into public.st_exercise_alternatives (exercise_id, alternative_id, reason, priority, notes, is_system)
select e.id, a.id, v.reason, v.priority, v.notes, true
from (
  values
    ('Bench Press', 'Dumbbell Bench Press', 'equipment_unavailable', 1, 'No barbell or rack'),
    ('Back Squat', 'Goblet Squat', 'equipment_unavailable', 1, 'No rack or barbell'),
    ('Back Squat', 'Bulgarian Split Squat', 'equipment_unavailable', 2, 'Dumbbell alternative'),
    ('Romanian Deadlift', 'Trap Bar Deadlift', 'preference', 1, 'Trap bar hinge option'),
    ('Overhead Press', 'Dumbbell Shoulder Press', 'equipment_unavailable', 1, 'No barbell'),
    ('Barbell Row', 'Dumbbell Row', 'equipment_unavailable', 1, 'No barbell'),
    ('Lat Pulldown', 'Pull-Up', 'equipment_unavailable', 1, 'No cable machine'),
    ('Lat Pulldown', 'Chin-Up', 'equipment_unavailable', 2, 'Bodyweight pull option'),
    ('Deadlift', 'Trap Bar Deadlift', 'preference', 1, 'Trap bar preference'),
    ('Cable Row', 'Dumbbell Row', 'equipment_unavailable', 1, 'No cable machine'),
    ('Hip Thrust', 'Glute Bridge', 'equipment_unavailable', 1, 'No barbell setup')
) as v(exercise_name, alt_name, reason, priority, notes)
join public.st_exercise_catalog e on lower(e.name) = lower(v.exercise_name) and e.is_system = true
join public.st_exercise_catalog a on lower(a.name) = lower(v.alt_name) and a.is_system = true
where e.id <> a.id
  and not exists (
    select 1 from public.st_exercise_alternatives x
    where x.exercise_id = e.id and x.alternative_id = a.id and x.reason = v.reason
  );
