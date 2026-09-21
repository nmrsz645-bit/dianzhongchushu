param(
  [Parameter(Mandatory = $true)]
  [string]$RootDir
)

$BundledNode = Join-Path $RootDir "runtime\node\node.exe"
if (Test-Path -LiteralPath $BundledNode -PathType Leaf) {
  (Resolve-Path -LiteralPath $BundledNode).Path
  exit 0
}

if ($env:DZ_NODE_PATH -and (Test-Path -LiteralPath $env:DZ_NODE_PATH -PathType Leaf)) {
  (Resolve-Path -LiteralPath $env:DZ_NODE_PATH).Path
  exit 0
}

Write-Output "node.exe"
exit 0
