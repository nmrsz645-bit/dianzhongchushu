@echo off
setlocal
set "APP_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$root=(Resolve-Path -LiteralPath $env:APP_ROOT).Path.TrimEnd([IO.Path]::DirectorySeparatorChar); $start=Join-Path $root 'Start.cmd'; if(-not (Test-Path -LiteralPath $start)){throw '未找到 Start.cmd'}; $w=New-Object -ComObject WScript.Shell; $p=Join-Path ([Environment]::GetFolderPath('Desktop')) ((Split-Path $root -Leaf) + '.lnk'); $s=$w.CreateShortcut($p); $s.TargetPath=$start; $s.WorkingDirectory=$root; $s.IconLocation=$env:SystemRoot + '\System32\shell32.dll,0'; $s.Save()"
if errorlevel 1 goto :failed
echo 桌面快捷方式已创建。
echo 现在可以在桌面双击图标打开软件。
pause
exit /b 0

:failed
echo 创建快捷方式失败，请保留此窗口并截图联系管理员。
pause
exit /b 1
