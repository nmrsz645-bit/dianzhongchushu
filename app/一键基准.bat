@echo off
chcp 65001 >nul
call "%~dp0scripts\run-automation.cmd" "src\baseline-now.js"
pause
