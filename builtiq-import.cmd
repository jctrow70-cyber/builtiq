@echo off
REM Import exercises + alternatives (needs .env.local with SUPABASE_SERVICE_ROLE_KEY)
cd /d "%~dp0"
call "%~dp0builtiq-npm.cmd" run import:alternatives
if errorlevel 1 pause
