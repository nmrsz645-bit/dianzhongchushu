$ErrorActionPreference = 'SilentlyContinue'

function To-Name([int[]]$Codes) { -join ($Codes | ForEach-Object { [char]$_ }) }

$currentRoot = $PSScriptRoot
$previousRoot = Join-Path (Split-Path -Parent $currentRoot) 'app.previous'
if (-not (Test-Path -LiteralPath $previousRoot -PathType Container)) { exit 0 }

function Restore-UserFile([string]$SourceRelativePath, [string]$DestinationRelativePath) {
    $source = Join-Path $previousRoot $SourceRelativePath
    $destination = Join-Path $currentRoot $DestinationRelativePath
    if ((Test-Path -LiteralPath $source -PathType Leaf) -and (Get-Item -LiteralPath $source).Length -gt 0) {
        Copy-Item -LiteralPath $source -Destination $destination -Force
    }
}

function Restore-UserDirectory([string]$RelativePath) {
    $source = Join-Path $previousRoot $RelativePath
    $destination = Join-Path $currentRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { return }
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Get-ChildItem -LiteralPath $source -File -Recurse | ForEach-Object {
        $relative = $_.FullName.Substring($source.Length).TrimStart('\', '/')
        $target = Join-Path $destination $relative
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $target -Force
    }
}

$wechat = To-Name @(0x4f01,0x4e1a,0x5fae,0x4fe1,0x2e,0x74,0x78,0x74)
$legacyWechat = To-Name @(0x6d7c,0x4f77,0x7b1f,0x5bf0,0xe1bb,0x4fca,0x2e,0x74,0x78,0x74)
$url = To-Name @(0x7f51,0x5740,0x2e,0x74,0x78,0x74)
$legacyUrl = To-Name @(0x7f03,0x621d,0x6f33,0x2e,0x74,0x78,0x74)
$feishu = To-Name @(0x98de,0x4e66,0x63a5,0x53e3,0x548c,0x94fe,0x63a5,0x2e,0x74,0x78,0x74)
$resource = To-Name @(0x9009,0x62e9,0x8d44,0x6e90,0x69,0x64,0x2e,0x74,0x78,0x74)
$mode = To-Name @(0x81ea,0x52a8,0x5316,0x6a21,0x5f0f,0x2e,0x6a,0x73,0x6f,0x6e)
$switch = To-Name @(0x4f01,0x4e1a,0x5fae,0x4fe1,0x53d1,0x9001,0x5f00,0x5173,0x2e,0x74,0x78,0x74)
$banned = To-Name @(0x8fdd,0x7981,0x8bcd,0x2e,0x74,0x78,0x74)

Restore-UserFile $legacyWechat $wechat
Restore-UserFile $legacyUrl $url
@($wechat, $url, $feishu, $resource, $mode, $switch, $banned) | ForEach-Object { Restore-UserFile $_ $_ }
@('automation\input', 'automation\output', 'automation\logs') | ForEach-Object { Restore-UserDirectory $_ }
