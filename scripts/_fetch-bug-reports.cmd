@echo off
set NODEVER=22.16.0
set NODEDIR=%LOCALAPPDATA%\buildiq-node\node-v%NODEVER%-win-x64
"%NODEDIR%\node.exe" "%~dp0_fetch-bug-reports.mjs"
