@echo off
set OUT=%TEMP%\biq-0291-commit.txt
cd /d "C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_validate-biq-0291.cmd
git add -- app/page.tsx app/components/WorkoutSetLogger.tsx lib/training/debouncedFieldEdits.ts lib/training/finishWorkoutPersistence.ts scripts/test-finish-debounced-edits.ts CHANGELOG.md DECISIONS.md ROADMAP.md >"%OUT%" 2>&1
git commit -m "BIQ-0291 Flush debounced set edits before Finish Workout." -m "Finish now stores the latest weight, reps, and notes before it checks required sets." >>"%OUT%" 2>&1
echo COMMIT:%ERRORLEVEL%>>"%OUT%"
git log -1 --oneline >>"%OUT%" 2>&1
git status --short >>"%OUT%" 2>&1
