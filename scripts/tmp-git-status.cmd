@echo off
setlocal
set OUT=%~dp0tmp-git-status-out.txt
git status --short > "%OUT%"
echo ----- >> "%OUT%"
git rev-parse --abbrev-ref HEAD >> "%OUT%"
echo ----- >> "%OUT%"
git log -8 --oneline >> "%OUT%"
echo ----- >> "%OUT%"
git diff --stat -- CHANGELOG.md DECISIONS.md ROADMAP.md lib/scienceEngine >> "%OUT%"
exit /b 0
