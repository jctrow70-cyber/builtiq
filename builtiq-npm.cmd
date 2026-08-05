@echo off
REM Run npm without admin and without adding Node to system PATH
setlocal
set NODEVER=22.16.0
set NODEDIR=%LOCALAPPDATA%\builtiq-node\node-v%NODEVER%-win-x64
set NPM=%NODEDIR%\npm.cmd

if not exist "%NPM%" (
  echo Node not found. Running installer...
  call "%~dp0scripts\install-node-portable.cmd"
  if errorlevel 1 exit /b 1
)

set "PATH=%NODEDIR%;%PATH%"
cd /d "%~dp0"
"%NPM%" %*
endlocal
