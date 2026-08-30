@echo off
setlocal
set "APP_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path -LiteralPath $env:APP_ROOT).Path.TrimEnd([IO.Path]::DirectorySeparatorChar); $exe=Join-Path $root 'app\DianzhongDesktop.exe'; if(-not (Test-Path -LiteralPath $exe)){throw 'DianzhongDesktop.exe not found'}; $shell=New-Object -ComObject WScript.Shell; $shortcut=Join-Path ([Environment]::GetFolderPath('Desktop')) ((Split-Path $root -Leaf) + '.lnk'); $link=$shell.CreateShortcut($shortcut); $link.TargetPath=$exe; $link.WorkingDirectory=(Split-Path $exe -Parent); $link.IconLocation=$exe + ',0'; $link.Save()"
if errorlevel 1 (
  echo Desktop shortcut creation failed.
  pause
  exit /b 1
)
echo Desktop shortcut created.
pause
