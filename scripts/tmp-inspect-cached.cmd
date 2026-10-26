@echo off
setlocal
set OUT=%~dp0tmp-inspect-cached-out.txt
echo === version cached === > "%OUT%"
git diff --cached -- lib/scienceEngine/version.ts >> "%OUT%"
echo === duration bands/tolerance/softIdx === >> "%OUT%"
git diff --cached -- lib/scienceEngine/duration.ts | findstr /C:"warnDelta" /C:"durationBands" /C:"softIdx" /C:"hardCap" /C:"SCIENCE_ENGINE" >> "%OUT%"
echo === changelog first 80 cached === >> "%OUT%"
git diff --cached -- CHANGELOG.md | more +1 >> "%OUT%"
exit /b 0
