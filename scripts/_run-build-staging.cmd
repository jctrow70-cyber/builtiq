@echo off
cd /d "%~dp0.."
"%USERPROFILE%\tools\node\node-v24.18.0-win-x64\node.exe" "%~dp0build-staging-sql.js" > "%~dp0staging-sql\_build-log.txt" 2>&1
echo exit=%errorlevel%>> "%~dp0staging-sql\_build-log.txt"
