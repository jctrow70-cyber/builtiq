@echo off
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
del /q scripts\_chunk-sizes.cmd scripts\_cleanup.cmd scripts\_markers.cmd scripts\_probe-next.cmd scripts\_probe-parent.cmd scripts\_probe-pid.cmd scripts\_probe-ports.cmd scripts\_snip.cmd scripts\_src-sizes.cmd scripts\_git-look.cmd
git add CHANGELOG.md DECISIONS.md ROADMAP.md app/components/NutritionTracker.tsx app/components/dashboard/NutritionDashboardCard.tsx app/components/nutrition/NutritionAddFoodPanel.tsx app/page.tsx lib/performance/screenTiming.ts lib/performance/lazyScreen.ts lib/scienceEngine/catalogAdapter.ts lib/scienceEngine/catalogExerciseFromRow.ts lib/scienceEngine/generation/library.ts lib/scienceEngine/generation/exerciseShape.ts lib/training/adaptationApply.ts lib/training/prescriptionMeta.ts lib/training/patchProgramPlannedWeights.ts lib/nutrition/nutritionDaySummary.ts scripts/test-nutrition-dashboard.ts scripts/test-lazy-screens.ts
git commit -m "BIQ-0287 Split the first screen bundle and keep loaded screens ready." -m "A return visit renders the screen that already loaded, and a finished workout still saves if adaptation cannot load."
echo COMMIT:%ERRORLEVEL%> "%TEMP%\biq-git-after.txt"
git status --short >> "%TEMP%\biq-git-after.txt"
git log -1 --oneline >> "%TEMP%\biq-git-after.txt"
del /q "%~f0"
