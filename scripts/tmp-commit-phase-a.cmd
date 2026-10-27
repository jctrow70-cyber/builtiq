@echo off
setlocal
cd /d "%~dp0.."
set OUT=%~dp0tmp-commit-phase-a-out.txt
> "%OUT%" echo === ADD ===
git add CHANGELOG.md DECISIONS.md ROADMAP.md app/components/programDesign/ProgramCalendarEditor.tsx app/components/programDesign/ProgramDesignHome.tsx app/components/programDesign/ProgramWorkoutPlan.tsx app/components/training/WorkoutPlanSheet.tsx app/globals.css app/page.tsx lib/programDesign/enrollment.ts lib/programDesign/workoutPreview.ts lib/scienceEngine/adaptation/phase2b1Check.ts lib/training/adaptationOrchestration.ts lib/training/catalogSearch.ts lib/training/workoutTemplate.ts scripts/test-customize-for-me.ts scripts/test-workout-preview.ts >> "%OUT%" 2>&1
echo === CACHED STAT === >> "%OUT%"
git diff --cached --stat >> "%OUT%" 2>&1
echo === CACHED CHECK === >> "%OUT%"
git diff --cached --check >> "%OUT%" 2>&1
echo === COMMIT === >> "%OUT%"
git commit -F "%~dp0tmp-commit-msg.txt" >> "%OUT%" 2>&1
echo COMMIT_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === STATUS === >> "%OUT%"
git status --short >> "%OUT%" 2>&1
echo === LOG === >> "%OUT%"
git log -3 --oneline >> "%OUT%" 2>&1
