@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
git add -- "app/components/WorkoutSetLogger.tsx" "app/page.tsx" "app/globals.css" "lib/training/catalogDedupe.ts" "lib/training/previousPerformance.ts" "lib/training/setLogIntent.ts" "lib/performance/loggerTiming.ts" "scripts/test-logger-performance.ts" "CHANGELOG.md" "DECISIONS.md" "ROADMAP.md"
if errorlevel 1 exit /b 1
git commit -m "BIQ-0289 Make workout logging respond immediately." -m "RIR and Done update before the set write, and a newer edit is not overwritten by an older save."
if errorlevel 1 exit /b 1
git status --short > "%TEMP%\biq-commit-status.txt"
git log -1 --oneline >> "%TEMP%\biq-commit-status.txt"
echo EXIT:0>> "%TEMP%\biq-commit-status.txt"
