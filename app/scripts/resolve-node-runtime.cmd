@echo off
set "DZ_NODE="

if not defined DZ_NODE if exist "%~dp0..\runtime\node\node.exe" set "DZ_NODE=%~dp0..\runtime\node\node.exe"
if not defined DZ_NODE if defined DZ_NODE_PATH if exist "%DZ_NODE_PATH%" set "DZ_NODE=%DZ_NODE_PATH%"
if not defined DZ_NODE for %%I in (node.exe) do if not "%%~$PATH:I"=="" set "DZ_NODE=%%~$PATH:I"

if not defined DZ_NODE exit /b 1
exit /b 0
