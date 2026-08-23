$ErrorActionPreference = "Stop"
$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $appRoot "server.mjs"
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) {
    $nodeCommand.Source
} else {
    "C:\Users\Suntapon\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

if (-not (Test-Path -LiteralPath $nodePath)) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("Node.js was not found. Install Node.js, then run this launcher again.", "KCG GHP Audit Report") | Out-Null
    exit 1
}

$listening = Get-NetTCPConnection -LocalPort 4173 -State Listen -ErrorAction SilentlyContinue
if (-not $listening) {
    Start-Process -FilePath $nodePath -ArgumentList @($serverPath) -WorkingDirectory $appRoot -WindowStyle Hidden
    Start-Sleep -Milliseconds 900
}

Start-Process "http://127.0.0.1:4173/"
