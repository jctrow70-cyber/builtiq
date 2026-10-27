@echo off
set OUT=%~dp0tmp-phase-b-status-out.txt
cd /d "%~dp0.."
> "%OUT%" echo === STATUS ===
git status --short -- CHANGELOG.md DECISIONS.md ROADMAP.md app/globals.css app/components/programDesign app/components/training/WorkoutTemplateEditor.tsx lib/programDesign scripts/test-program-calendar-view.ts scripts/test-customize-for-me.ts lib/scienceEngine/warmup.ts >> "%OUT%" 2>&1
echo === STAGED === >> "%OUT%"
git diff --cached --name-only >> "%OUT%" 2>&1
echo === UNSTAGED PD === >> "%OUT%"
git diff --name-only -- CHANGELOG.md DECISIONS.md ROADMAP.md app/globals.css app/components/programDesign app/components/training/WorkoutTemplateEditor.tsx lib/programDesign scripts/test-program-calendar-view.ts scripts/test-customize-for-me.ts >> "%OUT%" 2>&1
echo === UNTRACKED PD === >> "%OUT%"
git ls-files --others --exclude-standard -- app/components/programDesign lib/programDesign scripts/test-program-calendar-view.ts scripts/test-customize-for-me.ts >> "%OUT%" 2>&1
echo === WARMUP === >> "%OUT%"
git status --short -- lib/scienceEngine/warmup.ts >> "%OUT%" 2>&1
echo DONE >> "%OUT%"
