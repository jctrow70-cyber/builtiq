@echo off
setlocal
set NODE_HELPER=C:\Users\JesseTrowbridge\AppData\Local\Programs\cursor\resources\app\resources\helpers\node.exe
set NEXT=%~dp0..\node_modules\next\dist\bin\next
set OUT=%~dp0tmp-start-next-out.txt
cd /d "%~dp0.."
echo cwd=%CD%> "%OUT%"
if exist "%NEXT%" (
  echo NEXT_OK=1>> "%OUT%"
) else (
  echo NEXT_OK=0>> "%OUT%"
  dir /b node_modules\next\dist\bin >> "%OUT%" 2>&1
)
"%NODE_HELPER%" "%NEXT%" dev -p 3000 >> "%OUT%" 2>&1
