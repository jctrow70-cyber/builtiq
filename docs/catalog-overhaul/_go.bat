@echo off
setlocal
set ROOT=C:\Users\JesseTrowbridge\OneDrive - Tegria\Documents\GitHub\builtiq
set NODEEXE=
if exist "C:\Program Files\nodejs\node.exe" set NODEEXE=C:\Program Files\nodejs\node.exe
if exist "%LOCALAPPDATA%\fnm_multishells" for /d %%D in ("%LOCALAPPDATA%\fnm_multishells\*") do if exist "%%D\node.exe" set NODEEXE=%%D\node.exe
where node > "%ROOT%\docs\catalog-overhaul\_where_node.txt" 2>&1
if "%NODEEXE%"=="" for /f "usebackq delims=" %%i in (where node) do set NODEEXE=%%i
echo NODEEXE=%NODEEXE% > "%ROOT%\docs\catalog-overhaul\_bat_node.txt"
if not "%NODEEXE%"=="" ("%NODEEXE%" "%ROOT%\docs\catalog-overhaul\_runner.js") else (node "%ROOT%\docs\catalog-overhaul\_runner.js")
echo BAT_EXIT=%ERRORLEVEL% >> "%ROOT%\docs\catalog-overhaul\_bat_node.txt"
