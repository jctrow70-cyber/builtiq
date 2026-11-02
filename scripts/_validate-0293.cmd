@echo off
set NODE=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set TSX=node_modules\tsx\dist\cli.mjs
cd /d "c:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq"
set OUT=scripts\_validate-out.txt
echo START > %OUT%
for %%S in (test-set-log-status test-exercise-list-edit test-schedule-hardening test-logger-performance test-finish-workout test-finish-debounced-edits test-set-log-network-retry test-calendar-first test-nav-program-load test-screen-session test-today-training test-unified-schedule test-previous-performance test-customize-for-me) do (
  echo RUN %%S >> %OUT%
  "%NODE%" "%TSX%" scripts\%%S.ts >> %OUT% 2>&1
  echo EXIT %%S %ERRORLEVEL% >> %OUT%
)
echo TSC >> %OUT%
"%NODE%" node_modules\typescript\bin\tsc --noEmit --pretty false >> %OUT% 2>&1
echo TSC_EXIT %ERRORLEVEL% >> %OUT%
echo BUILD >> %OUT%
"%NODE%" node_modules\next\dist\bin\next build >> %OUT% 2>&1
echo BUILD_EXIT %ERRORLEVEL% >> %OUT%
