<#
.SYNOPSIS
    Starts the Colibri LAN relay: a small forwarding proxy on THIS machine in front of a Colibri server elsewhere.

.DESCRIPTION
    A page served over HTTPS cannot call a plain-HTTP LAN address, but it can call http://127.0.0.1. Run the relay on
    the machine that has the browser, point it at the machine that runs Colibri, and set the app's Colibri address to
    the relay (http://127.0.0.1:<Port>).

    Safe by default: the relay listens on 127.0.0.1 only, answers CORS for an explicit origin list (never "*"), and
    forwards only /health, /v1/models and /v1/chat/completions. No address is built in: -Upstream is required.

.PARAMETER Upstream
    Address of the Colibri server, for example http://<host-or-ip>:8000 . Required.

.PARAMETER Port
    Local port the relay listens on (default: 8001).

.PARAMETER Foreground
    Run in this window.

.PARAMETER Stop
    Stop running relay processes.

.EXAMPLE
    .\scripts\start-colibri-relay.ps1 -Upstream "http://<host-or-ip>:8000"
    .\scripts\start-colibri-relay.ps1 -Stop
#>

param(
    [string]$Upstream = "",
    [int]$Port = 8001,
    [switch]$Foreground,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RelayScript = Join-Path $ScriptDir "colibri-lan-relay.cjs"

if ($Stop) {
    Write-Host "[Colibri Relay] Stopping running relay processes..." -ForegroundColor Yellow
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "colibri-lan-relay" }
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped PID $($p.ProcessId)" -ForegroundColor Green
    }
    return
}

if (-not $Upstream) {
    Write-Error "[Colibri Relay] -Upstream is required, for example -Upstream http://<host-or-ip>:8000"
    return
}

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error "[Colibri Relay] Node.js is required but was not found in PATH."
    return
}

$Upstream = $Upstream.TrimEnd('/')
Write-Host "[Colibri Relay] Upstream: $Upstream" -ForegroundColor White
Write-Host "[Colibri Relay] Listening on http://127.0.0.1:$Port (this machine only)" -ForegroundColor White

try {
    $h = Invoke-RestMethod -Uri "$Upstream/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[Colibri Relay] Upstream answers (status: $($h.status))" -ForegroundColor Green
} catch {
    Write-Host "[Colibri Relay] Upstream does not answer yet; the relay starts anyway." -ForegroundColor DarkYellow
}

if ($Foreground) {
    & $node.Source $RelayScript --upstream $Upstream --port $Port
} else {
    $proc = Start-Process -FilePath $node.Source -ArgumentList @("`"$RelayScript`"", "--upstream", "`"$Upstream`"", "--port", "$Port") -WindowStyle Hidden -PassThru
    Start-Sleep -Milliseconds 800
    if ($proc -and -not $proc.HasExited) {
        Write-Host "[Colibri Relay] Running in the background (PID $($proc.Id)). Stop with -Stop." -ForegroundColor Green
    } else {
        Write-Error "[Colibri Relay] The relay did not start. Run with -Foreground to see why."
    }
}
