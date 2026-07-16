@echo off
REM Portable Node.js — no admin, works when PowerShell is in Constrained Language Mode
setlocal
set NODEVER=22.16.0
set INSTALL=%LOCALAPPDATA%\buildiq-node
set NODEDIR=%INSTALL%\node-v%NODEVER%-win-x64
set NODEZIP=%INSTALL%\node-v%NODEVER%-win-x64.zip
set NODEURL=https://nodejs.org/dist/v%NODEVER%/node-v%NODEVER%-win-x64.zip

if exist "%NODEDIR%\npm.cmd" (
  echo Node already installed: %NODEDIR%
  goto :done
)

echo Installing portable Node to %NODEDIR%
if not exist "%INSTALL%" mkdir "%INSTALL%"

echo Downloading %NODEURL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri '%NODEURL%' -OutFile '%NODEZIP%' -UseBasicParsing"
if errorlevel 1 (
  echo Download failed. Check internet / proxy.
  exit /b 1
)

echo Extracting...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%NODEZIP%' -DestinationPath '%INSTALL%' -Force"
if errorlevel 1 (
  echo Extract failed.
  exit /b 1
)
del "%NODEZIP%" 2>nul

:done
set "PATH=%NODEDIR%;%PATH%"
"%NODEDIR%\node.exe" -v
"%NODEDIR%\npm.cmd" -v
echo.
echo OK. Use buildiq-setup.cmd or buildiq-npm.cmd — no PATH edit required.
endlocal
