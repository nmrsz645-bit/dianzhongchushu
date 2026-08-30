@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0automation\scripts\control-panel.ps1"
if errorlevel 1 pause
