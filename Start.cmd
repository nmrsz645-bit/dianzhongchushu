@echo off
setlocal
chcp 65001 >nul
if exist "%~dp0updater\enabled.flag" "%~dp0updater\UpdateAgent.exe" --check "%~dp0updater\updater-config.json"
call "%~dp0app\Start-App.cmd"
endlocal
