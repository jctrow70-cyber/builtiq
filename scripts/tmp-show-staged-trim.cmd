@echo off
setlocal
set OUT=%~dp0tmp-show-staged-trim-out.txt
git show :lib/scienceEngine/duration.ts > "%OUT%.duration"
exit /b 0
