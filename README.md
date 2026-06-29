# BuiltIQ Production V1

This version fixes the generator so it creates real exercises and mobility items, not just day tiles.

## Update steps
1. Unzip this folder.
2. Replace all files in your GitHub repo root with these files.
3. Commit and push to GitHub.
4. In Supabase SQL Editor, run `supabase-schema.sql`.
5. In Vercel, redeploy.
6. Hard refresh the site.
7. Sign in.
8. Generate a new program.
9. Go to Train — you should see real exercises under each day.

If an older generated program shows only tiles, generate a new program after this update.
