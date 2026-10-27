@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSC=%~dp0..\node_modules\typescript\bin\tsc
set TSX=%~dp0..\node_modules\tsx\dist\cli.mjs
set OUT=%~dp0tmp-phase-a-tsc-out.txt
cd /d "%~dp0.."
> "%OUT%" echo === warmup.ts HEAD vs worktree ===
git diff HEAD -- lib/scienceEngine/warmup.ts >> "%OUT%" 2>&1
echo === warmup.ts line 149 HEAD === >> "%OUT%"
git show HEAD:lib/scienceEngine/warmup.ts | findstr /n "uniquePatterns Set" >> "%OUT%" 2>&1
echo === tsc working tree === >> "%OUT%"
"%NODE_HELPER%" "%TSC%" --noEmit >> "%OUT%" 2>&1
echo TSC_WORKTREE=%ERRORLEVEL% >> "%OUT%"
echo === tests === >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-workout-preview.ts" >> "%OUT%" 2>&1
echo PREVIEW_EXIT=%ERRORLEVEL% >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-customize-for-me.ts" >> "%OUT%" 2>&1
echo CUSTOMIZE_EXIT=%ERRORLEVEL% >> "%OUT%"
"%NODE_HELPER%" "%TSX%" "%~dp0test-group-strength-workout.ts" >> "%OUT%" 2>&1
echo GROUP_EXIT=%ERRORLEVEL% >> "%OUT%"
echo === page.tsx diff === >> "%OUT%"
git diff -- app/page.tsx >> "%OUT%" 2>&1
echo === adaptation diff === >> "%OUT%"
git diff -- lib/training/adaptationOrchestration.ts lib/scienceEngine/adaptation/phase2b1Check.ts lib/training/catalogSearch.ts >> "%OUT%" 2>&1
