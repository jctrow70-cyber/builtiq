@echo off
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
git add CHANGELOG.md ROADMAP.md app/components/NutritionTracker.tsx app/globals.css app/page.tsx lib/nutrition/macros.ts supabase/migrations/20250716_020_nutrition_tracker_foundation.sql
git commit -F biq-0034-commit-msg.txt
git log --oneline -2
git status -sb
