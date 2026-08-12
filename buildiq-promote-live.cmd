@echo off
REM Promote TEST to LIVE: merge Develop into main -> Vercel builtiq production
setlocal EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo BuildIQ - Promote TEST to LIVE
echo ==============================
echo.
echo This merges Develop into main and pushes to GitHub.
echo Vercel "builtiq" will deploy to PRODUCTION (live users).
echo.

set /p CONFIRM=Type LIVE to continue:
if /I not "%CONFIRM%"=="LIVE" (
  echo Cancelled.
  pause
  exit /b 1
)

git fetch origin
if errorlevel 1 (
  echo git fetch failed.
  pause
  exit /b 1
)

git diff-index --quiet HEAD --
if errorlevel 1 (
  echo.
  echo Uncommitted changes on current branch. Commit or stash first.
  pause
  exit /b 1
)

REM Resolve test branch name
set TEST_BRANCH=Develop
git show-ref --verify --quiet refs/remotes/origin/Develop
if errorlevel 1 (
  set TEST_BRANCH=develop
  git show-ref --verify --quiet refs/remotes/origin/develop
  if errorlevel 1 (
    echo Could not find origin/Develop or origin/develop.
    pause
    exit /b 1
  )
)

for /f "delims=" %%B in ('git branch --show-current') do set SAVED_BRANCH=%%B

git checkout main
if errorlevel 1 (
  echo Could not checkout main.
  pause
  exit /b 1
)

git pull origin main
if errorlevel 1 (
  echo git pull origin main failed.
  git checkout %SAVED_BRANCH% 2>nul
  pause
  exit /b 1
)

echo.
echo Merging origin/%TEST_BRANCH% into main...
git merge origin/%TEST_BRANCH% -m "Promote %TEST_BRANCH% to main (live)"
if errorlevel 1 (
  echo.
  echo Merge conflict. Resolve in your editor, then:
  echo   git add .
  echo   git commit
  echo   git push origin main
  pause
  exit /b 1
)

echo.
echo Pushing main to origin (triggers LIVE Vercel)...
git push origin main
if errorlevel 1 (
  echo Push failed.
  pause
  exit /b 1
)

if /I not "%SAVED_BRANCH%"=="main" (
  git checkout %SAVED_BRANCH% 2>nul
)

echo.
echo Live promotion complete.
echo Check https://builtiq-duf7.vercel.app after Vercel finishes building.
echo If you added SQL migrations, run them on LIVE Supabase now.
echo.
pause
