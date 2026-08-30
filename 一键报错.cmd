@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0reporter\Report-Problem.ps1"
if errorlevel 1 pause
endlocal