# BuiltIQ V3

Built around your V2 notes.

## Sections
- Dashboard: stats and starter graphs
- Training: household/personal, week toggle, day toggle, add/edit exercise, warm-up + working sets, cardio finisher, readiness check
- Nutrition: macro logging, AI food entry concept, barcode placeholder
- Body Composition: weight, waist, body fat, steps, notes
- Settings: profile, body info, units, future wearable notes

## Update steps
1. Unzip this package.
2. Replace your GitHub repo root files with these files.
3. Commit and push.
4. In Supabase SQL Editor, run `supabase-v3-schema.sql`.
5. Redeploy Vercel.
6. Hard refresh.
7. Generate a Household or Personal program.


## V3.1 additions
- Remove generated strength exercises
- Add/edit/remove strength exercises
- Mobility Warm-Up section
- Plyometric Warm-Up section
- Cardio Finisher section
- Ab Finisher section
- Add/edit/remove any generated item
- New `workout_blocks` table in `supabase-v3-schema.sql`

Run `supabase-v3-schema.sql` again after deploying this version.
