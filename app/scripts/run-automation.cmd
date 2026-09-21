@echo off
setlocal

if "%~1"=="" (
  echo ERROR: Automation script argument is required.
  exit /b 1
)

call "%~dp0resolve-node-runtime.cmd"
if errorlevel 1 (
  echo ERROR: Node.js runtime not found. Use the complete desktop package or run self-check.
  exit /b 1
)

cd /d "%~dp0..\automation"
"%DZ_NODE%" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
