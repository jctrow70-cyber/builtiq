@echo off
REM Import Guided Exercise Library (~1,324 GIF + form guides) — no admin, uses portable Node
cd /d "%~dp0"
echo.
echo BuildIQ Guided Library Import
echo =============================
echo.
if not exist ".env.local" (
  echo ERROR: .env.local not found in this folder.
  echo Create it with:
  echo   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  echo   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
  echo   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
  echo.
  echo Get keys from Supabase Dashboard - Project Settings - API
  pause
  exit /b 1
)
echo Step 1: Ensure portable Node is installed...
call "%~dp0buildiq-npm.cmd" -v >nul 2>&1
if errorlevel 1 (
  call "%~dp0buildiq-install-node.cmd"
  if errorlevel 1 pause & exit /b 1
)
echo Step 2: Install packages if needed...
if not exist "node_modules" (
  call "%~dp0buildiq-setup.cmd"
  if errorlevel 1 pause & exit /b 1
)
echo Step 3: Import guided exercises to Supabase...
call "%~dp0buildiq-npm.cmd" run import:exercises:exercisedb
echo.
if errorlevel 1 (
  echo Import failed. See messages above.
) else (
  echo Done. Open BuildIQ - Settings - enable Guided Library - search exercises in Training.
)
pause
