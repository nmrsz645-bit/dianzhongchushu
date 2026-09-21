$ErrorActionPreference = "Stop"

$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$Source = Join-Path $PSScriptRoot "PointChongDesktop.cs"
$Output = Join-Path $AppRoot "DianzhongDesktop.exe"
$NodeVersion = "24.19.0"
$NodeUri = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
$NodeSha256 = "3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237"
$NodeCacheDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "dianzhong-desktop-build-cache"
$CachedNode = Join-Path $NodeCacheDirectory "node-v$NodeVersion-win-x64.exe"
$BundledNode = Join-Path $AppRoot "runtime\node\node.exe"

function Test-Sha256Match {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedHash
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $false
    }

    return ((Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash -eq $ExpectedHash.ToUpperInvariant())
}

function Install-BundledNodeRuntime {
    New-Item -ItemType Directory -Force -Path $NodeCacheDirectory | Out-Null

    if (-not (Test-Sha256Match -Path $CachedNode -ExpectedHash $NodeSha256)) {
        $DownloadPath = "$CachedNode.download"
        if (Test-Path -LiteralPath $DownloadPath) {
            Remove-Item -LiteralPath $DownloadPath -Force
        }

        Write-Host "Downloading official Node.js $NodeVersion x64 runtime..."
        Invoke-WebRequest -UseBasicParsing -Uri $NodeUri -OutFile $DownloadPath

        if (-not (Test-Sha256Match -Path $DownloadPath -ExpectedHash $NodeSha256)) {
            Remove-Item -LiteralPath $DownloadPath -Force -ErrorAction SilentlyContinue
            throw "Downloaded Node.js runtime failed SHA-256 verification."
        }

        Move-Item -LiteralPath $DownloadPath -Destination $CachedNode -Force
    }

    $BundledNodeDirectory = Split-Path -Parent $BundledNode
    New-Item -ItemType Directory -Force -Path $BundledNodeDirectory | Out-Null
    Copy-Item -LiteralPath $CachedNode -Destination $BundledNode -Force

    if (-not (Test-Sha256Match -Path $BundledNode -ExpectedHash $NodeSha256)) {
        throw "Bundled Node.js runtime failed SHA-256 verification after copying."
    }
}

Install-BundledNodeRuntime

& $Compiler /nologo /target:winexe /platform:x64 /optimize+ /out:$Output /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Management.dll $Source
if ($LASTEXITCODE -ne 0) { throw "Desktop build failed" }
Write-Host "Built: $Output (includes Node.js $NodeVersion runtime)"
