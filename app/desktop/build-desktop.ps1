$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$Source = Join-Path $PSScriptRoot "PointChongDesktop.cs"
$Output = Join-Path $AppRoot "DianzhongDesktop.exe"

& $Compiler /nologo /target:winexe /platform:x64 /optimize+ /out:$Output /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Management.dll $Source
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed" }
Write-Host "Built: $Output"
