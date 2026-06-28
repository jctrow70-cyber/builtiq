create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  full_name text,
  created_at timestamp with time zone default now()
);

create table if not exists workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  title text not null,
  focus text,
  duration_minutes int,
  notes text,
  created_at timestamp with time zone default now()
);

create table if not exists nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  food_name text not null,
  calories int default 0,
  protein numeric default 0,
  carbs numeric default 0,
  fat numeric default 0,
  logged_at timestamp with time zone default now()
);

create table if not exists progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  weight numeric,
  waist numeric,
  notes text,
  logged_at timestamp with time zone default now()
);
