# Exercise catalog overhaul

This folder is the working copy of the exercise database.

## Download (open these)

- `exercise-catalog.csv` — **1,324 Guided Library exercises** (names, body part, equipment, instructions, GIF paths). This is the file to overhaul.
- `builtiq-basic-catalog.csv` — smaller BuildIQ Basic gym list already in migrations.

Live database copy (what is actually in Supabase): Settings → Guided Exercise Library → **Download CSV** (catalog admin).

Used exercises for mapping (household logs, not the full 1,324):

- `used-exercises.sql` — run in Supabase SQL Editor, then Download CSV
- `used-exercises-to-map.csv` — raw household log export
- `used-exercises-mapped.csv` — household map onto the master library (canvas-approved; includes `equipment_used`)
- `master-rows-to-add.csv` — new master movements added on import (Power Clean, Windmill, Side Bend)
- Live cutover: Settings → **Import Master Library** (BIQ-0201). Archives old system rows; does not delete history.

## What is wrong today (why overhaul)

Source fields are not BuildIQ fields yet. In `exercise-catalog.csv` you will see:

- `exercise_type` still looks like `waist` / `upper legs` (body part), not `strength` / `cardio` / `mobility`
- Odd names (`3/4 sit-up`, `air bike`)
- Duplicate patterns and mixed equipment labels (`body weight` vs `bodyweight`)

## Columns

| Column | Meaning |
| --- | --- |
| name | Display name in search and workouts |
| external_source | `exercisedb`, `builtiq_essentials`, `builtiq_basic` |
| external_id | Stable id for re-import |
| exercise_type | Should become strength, cardio, mobility, bodyweight, timed |
| category | warmup, strength, mobility, plyometric, other |
| muscle_group | Primary muscle |
| equipment | Equipment filter string |
| instructions | Form text |
| gif_url / thumbnail_url | Demo media |

## How to overhaul

1. Edit `exercise-catalog.csv` in Excel / Google Sheets.
2. Keep `external_id` stable when updating a row.
3. Catalog edits change future search and new workouts only — completed set logs stay as they were.
4. After you mark up the sheet, we can add a re-import path.

Regenerate from the public dataset:

```text
curl.exe -L https://raw.githubusercontent.com/AbdelrahmanElghoul/exercises-dataset/main/data/exercises.json -o docs/catalog-overhaul/exercises-raw.json
node scripts/convert-catalog.cjs
```
