@echo off
setlocal
cd /d "%~dp0"
set "INPUT_FILE=%~dp0批量书籍ID.txt"
if not exist "%INPUT_FILE%" type nul > "%INPUT_FILE%"
start /wait notepad.exe "%INPUT_FILE%"
set "NODE=node.exe"
if exist "%~dp0runtime\node\node.exe" set "NODE=%~dp0runtime\node\node.exe"
cd /d "%~dp0automation"
"%NODE%" src\run-books.js "%INPUT_FILE%"
pause
