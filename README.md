# BuiltIQ V2 — Household + Personal Programs

This version adds the key architecture change:

## Training Scope
- Household: shared plans visible to household members
- My Personal: private plans visible only to the logged-in user

## V2 tracking
- Exercise target sets
- Rep ranges
- Warm-up sets
- Working sets
- Per-set weight, reps, and RPE
- Exercise set logs remembered by user
- Foundation for progression memory

## Update steps
1. Unzip this package.
2. Replace your repo root files with these files.
3. Commit and push to GitHub.
4. In Supabase SQL Editor, run `supabase-v2-schema.sql`.
5. Redeploy in Vercel.
6. Hard refresh.
7. Generate either a Household or My Personal program.
