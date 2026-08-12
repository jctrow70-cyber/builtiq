@echo off
REM Push to TEST: GitHub Develop branch -> Vercel builtiq-test
setlocal
cd /d "%~dp0"

echo.
echo BuildIQ - Push to TEST (Develop branch)
echo ========================================
echo.

git status --short
if errorlevel 1 (
  echo Git not available or not a repo.
  pause
  exit /b 1
)

git diff-index --quiet HEAD --
if errorlevel 1 (
  echo.
  echo You have uncommitted changes. Commit first, then run this again.
  echo Example:
  echo   git add .
  echo   git commit -m "BIQ-xxxx Your change"
  echo.
  pause
  exit /b 1
)

REM Prefer Develop (remote name); fall back to develop
git show-ref --verify --quiet refs/heads/Develop
if errorlevel 1 (
  git show-ref --verify --quiet refs/heads/develop
  if errorlevel 1 (
    echo Neither Develop nor develop branch exists locally.
    echo Create one: git checkout -b Develop origin/Develop
    pause
    exit /b 1
  )
  set TEST_BRANCH=develop
) else (
  set TEST_BRANCH=Develop
)

for /f "delims=" %%B in ('git branch --show-current') do set CURRENT=%%B
if /I not "%CURRENT%"=="%TEST_BRANCH%" (
  echo Switching to %TEST_BRANCH% ...
  git checkout %TEST_BRANCH%
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo.
echo Pushing %TEST_BRANCH% to origin (triggers Vercel PREVIEW deployment)...
git push origin %TEST_BRANCH%
if errorlevel 1 (
  echo Push failed.
  pause
  exit /b 1
)

echo.
echo Done. Check Vercel -^> builtiq -^> Deployments (branch %TEST_BRANCH%, Preview).
echo See docs/ENVIRONMENTS.md if the preview did not update.
echo.
pause
