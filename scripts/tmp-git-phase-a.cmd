@echo off
setlocal
cd /d "%~dp0.."
set OUT=%~dp0tmp-git-phase-a-out.txt
> "%OUT%" echo === STATUS ===
git status --short >> "%OUT%" 2>&1
echo === BRANCH === >> "%OUT%"
git branch --show-current >> "%OUT%" 2>&1
echo === LOG === >> "%OUT%"
git log -8 --oneline >> "%OUT%" 2>&1
echo === DIFF STAT === >> "%OUT%"
git diff --stat >> "%OUT%" 2>&1
echo === STAGED STAT === >> "%OUT%"
git diff --cached --stat >> "%OUT%" 2>&1
