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
| `gif_url` | no | `gif_url` (animated demo) |

## Recommended: Guided Library — ExerciseDB (~1,324 exercises)

**Source:** [ExerciseDB v1 OSS](https://oss.exercisedb.dev/docs) (AscendAPI) — GIF demos, thumbnails, and step-by-step instructions.

**Attribution:** Credit ExerciseDB / AscendAPI when using the free OSS dataset.

### 1. Fetch + convert (bulk mirror — avoids API rate limits)

```bash
npm run import:fetch:exercisedb
```

Output: `scripts/import-exercises/data/exercisedb/buildiq-import.json`

Optional: live API paginated fetch (may 429): `npm run import:fetch:exercisedb:api`

### 2. Dry-run, then live import

```bash
npm run import:exercises:exercisedb:dry
npm run import:exercises:exercisedb
```

### 3. Verify in Supabase

```sql
select count(*) from st_exercise_catalog where external_source = 'exercisedb';
-- expect ~1324
```

### 4. Enable in the app

Settings → Profile → enable **Guided Library**. Add Exercise search defaults to **With form guide** filter.

---

## Legacy dataset: Free Exercise DB (873 exercises)

**Source:** [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) — **The Unlicense** (public domain).

### 1. Download (PowerShell)

```powershell
New-Item -ItemType Directory -Force -Path "scripts/import-exercises/data/free-exercise-db"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json" -OutFile "scripts/import-exercises/data/free-exercise-db/exercises.json"
```

### 2. Convert to BuildIQ format

```powershell
npm.cmd run import:convert:free-exercise-db
```

Output: `scripts/import-exercises/data/free-exercise-db/buildiq-import.json`

### 3. Dry-run, then live import

```powershell
npm.cmd run import:exercises:production:dry
npm.cmd run import:exercises:production
```

`import:exercises:production` converts the dataset and imports with `--enrich-legacy` so the 13 exact-name BIQ-0005 staples (e.g. Goblet Squat, Dumbbell Bench Press) gain form guides and `external_source` instead of being skipped.

### 4. Seed exercise alternatives (after catalog import)

```powershell
npm.cmd run import:alternatives:dry
npm.cmd run import:alternatives
```

Also run migration `20250713_017_exercise_alternatives_seed.sql` for curated name-based pairs.

### 5. Verify in Supabase

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
| `name` | **yes** | Kettlebell Swing | Display name in BuildIQ |
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
npm.cmd run import:exercises:dry -- --file scripts/import-exercises/my-exercises-buildiq.json
npm.cmd run import:exercises -- --file scripts/import-exercises/my-exercises-buildiq.json
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
- **Preserves BIQ-0005 seed rows** — by default skips import when name matches a legacy system exercise without `external_source`
- **`--enrich-legacy`** — updates matching BIQ-0005 seed rows with import data (images, instructions, `external_source`) instead of skipping; used by `import:exercises:production`
- **Dry-run** validates mapping and prints counts before live import.

## Report output

- Total records found
- Records imported (inserted / updated)
- Records skipped (with reasons)
- Duplicates in file
- Errors
