$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$BuildScript = Join-Path $PSScriptRoot "build-desktop.ps1"
$Resolver = Join-Path $AppRoot "automation\scripts\resolve-node-runtime.ps1"
$BundledNode = Join-Path $AppRoot "runtime\node\node.exe"
$ExternalRuntimeDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("dianzhong-watchdog-runtime-" + [Guid]::NewGuid().ToString("N"))
$SourceOnlyRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("dianzhong-source-only-" + [Guid]::NewGuid().ToString("N"))

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $BuildScript
if ($LASTEXITCODE -ne 0) {
    throw "Desktop build failed."
}

if (-not (Test-Path -LiteralPath $Resolver -PathType Leaf)) {
    throw "Watchdog must use a dedicated Node runtime resolver."
}

try {
    New-Item -ItemType Directory -Force -Path $ExternalRuntimeDirectory | Out-Null
    $ExternalNode = Join-Path $ExternalRuntimeDirectory "external-node.exe"
    Copy-Item -LiteralPath $BundledNode -Destination $ExternalNode

    $PreviousNodePath = $env:DZ_NODE_PATH
    try {
        $env:DZ_NODE_PATH = $ExternalNode
        $ResolvedNode = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Resolver -RootDir $AppRoot).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Watchdog runtime resolver failed."
        }
    }
    finally {
        if ($null -eq $PreviousNodePath) {
            Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        }
        else {
            $env:DZ_NODE_PATH = $PreviousNodePath
        }
    }

    $ExpectedNode = (Resolve-Path -LiteralPath $BundledNode).Path
    if (-not [string]::Equals($ResolvedNode, $ExpectedNode, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Watchdog selected '$ResolvedNode' instead of bundled Node '$ExpectedNode'."
    }

    New-Item -ItemType Directory -Force -Path $SourceOnlyRoot | Out-Null
    $PreviousNodePath = $env:DZ_NODE_PATH
    try {
        Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        $global:LASTEXITCODE = $null
        $FallbackNode = (& $Resolver -RootDir $SourceOnlyRoot).Trim()
        if ($LASTEXITCODE -ne 0) {
            throw "Watchdog Node resolver must return success when a source checkout falls back to node.exe."
        }
    }
    finally {
        if ($null -eq $PreviousNodePath) {
            Remove-Item Env:DZ_NODE_PATH -ErrorAction SilentlyContinue
        }
        else {
            $env:DZ_NODE_PATH = $PreviousNodePath
        }
    }

    if ($FallbackNode -ne "node.exe") {
        throw "Watchdog source-checkout fallback must resolve node.exe, got '$FallbackNode'."
    }
}
finally {
    Remove-Item -LiteralPath $ExternalRuntimeDirectory -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $SourceOnlyRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "Watchdog runtime test passed: $ResolvedNode"
