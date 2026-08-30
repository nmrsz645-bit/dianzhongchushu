@echo off
chcp 65001 >nul
cd /d "%~dp0automation"
node src\baseline-now.js
pause
