# Exercise bulk import (BIQ-0013)

Import external exercise datasets into `st_exercise_catalog` without UI changes.

## Prerequisites

1. Run migrations through `20250708_011` (and `012` if movement_pattern constraint failed).
2. Set environment variables (`.env.local`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Never commit the service role key.** Use it only for local/CI import runs.

## Dataset format

JSON **array** or **JSONL** (one object per line).

| Field | Required | Maps to |
|-------|----------|---------|
| `external_source` | yes | `external_source` |
| `external_id` | yes | `external_id` |
| `name` | yes | `name` |
| `exercise_type` | no | `exercise_type` |
| `primary_muscle` | no | `muscle_group` + volume % |
| `secondary_muscles` | no | `muscle_targets` JSON |
| `equipment` | no | `equipment` |
| `movement_pattern` | no | `movement_pattern` (normalized) |
| `instructions` | no | `instructions` |
| `media_url` | no | `media_url` |
| `thumbnail_url` | no | `image_url` |

## Production dataset: Free Exercise DB (873 exercises)

**Source:** [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) — **The Unlicense** (public domain).

### 1. Download (PowerShell)

```powershell
New-Item -ItemType Directory -Force -Path "scripts/import-exercises/data/free-exercise-db"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json" -OutFile "scripts/import-exercises/data/free-exercise-db/exercises.json"
```

### 2. Convert to BuiltIQ format

```powershell
npm.cmd run import:convert:free-exercise-db
```

Output: `scripts/import-exercises/data/free-exercise-db/builtiq-import.json`

### 3. Dry-run, then live import

```powershell
npm.cmd run import:exercises:dry -- --file scripts/import-exercises/data/free-exercise-db/builtiq-import.json
npm.cmd run import:exercises -- --file scripts/import-exercises/data/free-exercise-db/builtiq-import.json
```

### 4. Verify in Supabase

```sql
select count(*) from st_exercise_catalog where external_source = 'free_exercise_db';
-- expect ~873 (minus any skipped legacy name collisions)
```

Imported rows include `thumbnail_url` (GitHub-hosted images) and `instructions`. Re-running import **updates** existing rows by `(external_source, external_id)`.

---

## Spreadsheet import (Excel → CSV)

Use `scripts/import-exercises/exercise-import-template.csv` as your starting point in Excel.

### Columns

| Column | Required | Example | Notes |
|--------|----------|---------|-------|
| `name` | **yes** | Kettlebell Swing | Display name in BuiltIQ |
| `external_id` | no | kb-swing-2arm | Unique per source; auto-slug from name if blank |
| `external_source` | no | spreadsheet_import | Dataset tag; default `spreadsheet_import` |
| `exercise_type` | no | strength | strength, cardio, mobility, bodyweight, timed, custom |
| `primary_muscle` | no | Hamstrings | Main muscle group |
| `secondary_muscles` | no | Glutes, Core | Comma-separated in one cell |
| `equipment` | no | kettlebell | Used for equipment filter in app |
| `movement_pattern` | no | hinge | squat, hinge, push_horizontal, push_vertical, pull_horizontal, pull_vertical, carry, rotation, isolation, cardio |
| `category` | no | strength | warmup, strength, mobility |
| `instructions` | no | Hinge at hips… | Form guide text |
| `thumbnail_url` | no | https://…/kb-swing.jpg | Public image URL (form guide thumbnail) |
| `media_url` | no | https://…/video.mp4 | Optional video URL |

**Thumbnails:** use a public HTTPS URL (Supabase Storage, your CDN, or any hosted image). Excel cannot embed images in CSV — paste the URL in `thumbnail_url`.

### Workflow

1. Copy or open `exercise-import-template.csv` in Excel, add your rows, save as **CSV UTF-8**.
2. Convert to import JSON:

```powershell
npm.cmd run import:convert:spreadsheet -- --file scripts/import-exercises/my-exercises.csv --source jesse_import
```

3. Dry-run, then import:

```powershell
npm.cmd run import:exercises:dry -- --file scripts/import-exercises/my-exercises-builtiq.json
npm.cmd run import:exercises -- --file scripts/import-exercises/my-exercises-builtiq.json
```

Re-importing the same `external_source` + `external_id` **updates** the exercise (name, muscles, thumbnail, etc.).

---

## Commands (sample dataset)

Dry run (no database writes):

```bash
npm run import:exercises:dry -- --file scripts/import-exercises/sample-dataset.json
```

Live import:

```bash
npm run import:exercises -- --file path/to/your-dataset.json
```

## Safety rules

- **Upsert by** `(external_source, external_id)` — no duplicate imports.
- **Only writes** `is_system = true`, `user_id = null` rows.
- **Never updates** user custom exercises (`user_id IS NOT NULL`).
- **Preserves BIQ-0005 seed rows** — skips import when name matches a legacy system exercise without `external_source`.
- **Dry-run** validates mapping and prints counts before live import.

## Report output

- Total records found
- Records imported (inserted / updated)
- Records skipped (with reasons)
- Duplicates in file
- Errors
