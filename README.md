# BuiltIQ Full Production-Style Web App

This version is the dark/purple design closer to the mockup: Supabase login, shared household, generated workouts, mobility, video buttons, nutrition, progress, coach, and separate user tracking.

## Update your existing Vercel/GitHub/Supabase deployment

1. Unzip this package.
2. In GitHub, open your existing `builtiq` repo.
3. Replace the old placeholder files with all files from this package.
4. Commit changes.
5. In Supabase > SQL Editor, paste and run `supabase-schema.sql`.
6. In Vercel > Project > Settings > Environment Variables, confirm:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. In Vercel, redeploy the latest GitHub commit.
8. In Supabase > Authentication > URL Configuration:
   - Site URL: your Vercel URL
   - Redirect URLs: your Vercel URL plus `/**`
9. Open the site, log in, create household, generate a program.

## Notes
Barcode and AI voice food logging are prototype buttons. Production needs camera barcode integration and an OpenAI/food database endpoint.
