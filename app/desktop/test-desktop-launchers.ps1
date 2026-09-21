$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BuildScript = Join-Path $PSScriptRoot "build-desktop.ps1"
$Runner = Join-Path $AppRoot "scripts\run-automation.cmd"
$BundledNode = Join-Path $AppRoot "runtime\node\node.exe"
$Wrapper = Join-Path ([System.IO.Path]::GetTempPath()) ("dianzhong-launcher-test-" + [Guid]::NewGuid().ToString("N") + ".cmd")
$ExternalRuntimeDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("dianzhong-external-runtime-" + [Guid]::NewGuid().ToString("N"))

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildScript
if ($LASTEXITCODE -ne 0) {
    throw "Desktop build failed."
}

if (-not (Test-Path -LiteralPath $Runner -PathType Leaf)) {
    throw "Desktop launchers must use scripts\\run-automation.cmd to locate the bundled Node runtime."
}

try {
    @"
@echo off
call "$Runner" -p "process.execPath"
exit /b %ERRORLEVEL%
"@ | Set-Content -LiteralPath $Wrapper -Encoding Ascii

    $PreviousPath = $env:PATH
    $PreviousNodePath = $env:DZ_NODE_PATH
    try {
        $env:PATH = (Join-Path $env:SystemRoot "System32")
        Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        $ResolvedNode = (& cmd.exe /d /c $Wrapper).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Desktop launcher could not execute Node without a system Node.js installation."
        }
    }
    finally {
        $env:PATH = $PreviousPath
        if ($null -eq $PreviousNodePath) {
            Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        }
        else {
            $env:DZ_NODE_PATH = $PreviousNodePath
        }
    }

    $ExpectedNode = (Resolve-Path -LiteralPath $BundledNode).Path
    if (-not [string]::Equals($ResolvedNode, $ExpectedNode, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Desktop launcher used '$ResolvedNode' instead of bundled Node '$ExpectedNode'."
    }

    New-Item -ItemType Directory -Force -Path $ExternalRuntimeDirectory | Out-Null
    $ExternalNode = Join-Path $ExternalRuntimeDirectory "external-node.exe"
    Copy-Item -LiteralPath $BundledNode -Destination $ExternalNode

    $PreviousPath = $env:PATH
    $PreviousNodePath = $env:DZ_NODE_PATH
    try {
        $env:PATH = (Join-Path $env:SystemRoot "System32")
        $env:DZ_NODE_PATH = $ExternalNode
        $ResolvedNodeWithOverride = (& cmd.exe /d /c $Wrapper).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Desktop launcher could not execute Node when DZ_NODE_PATH is set."
        }
    }
    finally {
        $env:PATH = $PreviousPath
        if ($null -eq $PreviousNodePath) {
            Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        }
        else {
            $env:DZ_NODE_PATH = $PreviousNodePath
        }
    }

    if (-not [string]::Equals($ResolvedNodeWithOverride, $ExpectedNode, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Desktop launcher used DZ_NODE_PATH '$ResolvedNodeWithOverride' instead of bundled Node '$ExpectedNode'."
    }
}
finally {
    Remove-Item -LiteralPath $Wrapper -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ExternalRuntimeDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Desktop launcher runtime test passed: $ResolvedNode"
