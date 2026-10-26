@echo off
setlocal
set OUT=%~dp0tmp-inspect-merge-out.txt
echo === STATUS === > "%OUT%"
git status --short >> "%OUT%"
echo. >> "%OUT%"
echo === VERSION OURS === >> "%OUT%"
git show :2:lib/scienceEngine/version.ts >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === VERSION THEIRS === >> "%OUT%"
git show :3:lib/scienceEngine/version.ts >> "%OUT%" 2>&1
echo. >> "%OUT%"
echo === DURATION OURS trimForDuration === >> "%OUT%"
git show :2:lib/scienceEngine/duration.ts >> "%OUT%.ours-duration" 2>&1
echo wrote ours duration >> "%OUT%"
git show :3:lib/scienceEngine/duration.ts >> "%OUT%.theirs-duration" 2>&1
echo wrote theirs duration >> "%OUT%"
echo === CHANGELOG OURS HEAD === >> "%OUT%"
git show :2:CHANGELOG.md | more +1 > "%OUT%.ours-cl-head.txt" 2>&1
exit /b 0
