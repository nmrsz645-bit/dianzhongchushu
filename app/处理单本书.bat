@echo off
setlocal
title Dianzhong Run One Book
cd /d "%~dp0"

if not exist "automation\src\run-book.js" (
  echo ERROR: automation\src\run-book.js not found.
  echo Put this BAT in the program root folder.
  echo Current folder: %cd%
  pause
  exit /b 1
)

set "BOOK_ID="
echo.
set /p BOOK_ID=Input book ID:
if "%BOOK_ID%"=="" (
  echo No book ID entered.
  pause
  exit /b 1
)

call "%~dp0scripts\run-automation.cmd" "src\run-book.js" "%BOOK_ID%"
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo Finished. Exit code: %EXIT_CODE%
pause
exit /b %EXIT_CODE%
