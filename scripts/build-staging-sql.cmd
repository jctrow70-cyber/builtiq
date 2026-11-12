@echo off
REM Builds UTF-8 part-*.sql for Supabase. Do not use "echo" to create SQL — that writes UTF-16 and breaks part-01.
cd /d "%~dp0.."
set NODE=%USERPROFILE%\tools\node\node-v24.18.0-win-x64\node.exe
if not exist "%NODE%" set NODE=node
"%NODE%" "%~dp0build-staging-sql.js"
if errorlevel 1 exit /b 1
dir /b "%~dp0staging-sql\part-*.sql"
