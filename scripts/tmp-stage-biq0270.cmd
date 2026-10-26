@echo off
setlocal
set OUT=%~dp0tmp-stage-biq0270-out.txt
echo === resolve unmerged === > "%OUT%"
git add -- "CHANGELOG.md" "lib/scienceEngine/duration.ts" "lib/scienceEngine/version.ts" >> "%OUT%" 2>&1
echo === unstage all === >> "%OUT%"
git reset HEAD -- . >> "%OUT%" 2>&1
echo === stage BIQ-0270 only === >> "%OUT%"
git add -- ^
  CHANGELOG.md ^
  DECISIONS.md ^
  ROADMAP.md ^
  lib/scienceEngine/version.ts ^
  lib/scienceEngine/duration.ts ^
  lib/scienceEngine/scienceSeed.ts ^
  lib/scienceEngine/acceptanceCheck.ts ^
  lib/scienceEngine/generation/orchestrator.ts ^
  lib/scienceEngine/generation/repairAiProgram.ts ^
  lib/scienceEngine/generation/validateAiProgram.ts ^
  lib/scienceEngine/generation/hardRequirements.ts ^
  lib/scienceEngine/generation/workingStructure.ts ^
  lib/scienceEngine/generation/prompt.ts ^
  lib/scienceEngine/generation/types.ts ^
  lib/scienceEngine/generation/log.ts ^
  lib/scienceEngine/generation/stage2dCheck.ts ^
  lib/scienceEngine/generation/phase1Check.ts >> "%OUT%" 2>&1
echo === cached stat === >> "%OUT%"
git diff --cached --stat >> "%OUT%" 2>&1
echo === cached name-only === >> "%OUT%"
git diff --cached --name-only >> "%OUT%" 2>&1
echo === cached check === >> "%OUT%"
git diff --cached --check >> "%OUT%" 2>&1
echo CHECK_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === status === >> "%OUT%"
git status --short >> "%OUT%" 2>&1
exit /b 0
