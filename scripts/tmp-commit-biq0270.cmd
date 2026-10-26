@echo off
setlocal
set OUT=%~dp0tmp-commit-biq0270-out.txt
git commit -F "%~dp0tmp-commit-msg.txt" > "%OUT%" 2>&1
echo COMMIT_EXIT=%ERRORLEVEL%>> "%OUT%"
git status --short >> "%OUT%"
echo ----- >> "%OUT%"
git log -3 --oneline >> "%OUT%"
echo ----- >> "%OUT%"
git diff --cached --name-only >> "%OUT%"
exit /b 0
