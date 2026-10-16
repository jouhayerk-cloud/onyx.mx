<#
.SYNOPSIS
    Launches the Colibrì Local Network Relay Server for secondary laptops (e.g. second laptop)
    connecting to Ramses's laptop Colibrì MoE server over the G7 local network.

.DESCRIPTION
    Runs a lightweight HTTP proxy that forwards requests from local client applications
    (or browser web apps) to the primary Colibrì NVMe server running on Ramses's laptop.
    Eliminates browser Private Network Access (PNA) and Mixed Content restrictions.

.PARAMETER Upstream
    The address of Ramses's laptop Colibrì server (default: http://192.0.2.71:8082).

.PARAMETER Port
    The local port on second laptop to listen on (default: 8082).

.PARAMETER Foreground
    If set, runs the relay in the current PowerShell terminal window.

.PARAMETER Stop
    If set, stops any running Colibrì relay processes.

.EXAMPLE
    .\scripts\start-colibri-relay.ps1 -Upstream "http://192.0.2.71:8082"
    .\scripts\start-colibri-relay.ps1 -Upstream "http://192.0.2.71:8082" -Foreground
    .\scripts\start-colibri-relay.ps1 -Stop
#>

param(
    [string]$Upstream = "http://192.0.2.71:8082",
    [int]$Port = 8082,
    [switch]$Foreground,
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RelayScript = Join-Path $ScriptDir "colibri-lan-relay.cjs"

if ($Stop) {
    Write-Host "[Colibrì Relay] Stopping running relay processes..." -ForegroundColor Yellow
    $procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "colibri-lan-relay" }
    foreach ($p in $procs) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped PID $($p.ProcessId)" -ForegroundColor Green
    }
    Write-Host "[Colibrì Relay] Done." -ForegroundColor Green
    return
}

# Verify Node.js availability
$nodePath = (Get-Command node -ErrorAction SilentlyContinue)?.Source
if (-not $nodePath) {
    Write-Error "[Colibrì Relay] Node.js is required but not found in PATH. Please install Node.js >= 16."
    return
}

# Clean upstream URL
$Upstream = $Upstream.TrimEnd('/')
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  🪶 Colibrì Mesh LAN Relay Launcher (Secondary Laptop Surface)" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  Upstream Target : $Upstream (Ramses Laptop)" -ForegroundColor White
Write-Host "  Local Listener  : http://127.0.0.1:$Port" -ForegroundColor White
Write-Host "==================================================================" -ForegroundColor Cyan

# Test connectivity to upstream
Write-Host "[Colibrì Relay] Pinging upstream server ($Upstream/health)..." -NoNewline
try {
    $testResult = Invoke-RestMethod -Uri "$Upstream/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host " [ONLINE]" -ForegroundColor Green
    if ($testResult.telemetry) {
        Write-Host "  Upstream Engine : $($testResult.engine) v$($testResult.version)" -ForegroundColor DarkGray
        Write-Host "  NVMe Read Speed : $($testResult.telemetry.nvmeReadMBps) MB/s" -ForegroundColor DarkGray
    }
} catch {
    Write-Host " [UNREACHABLE]" -ForegroundColor Yellow
    Write-Host "  Warning: Upstream host ($Upstream) is not responding yet." -ForegroundColor DarkYellow
    Write-Host "  The relay will start anyway and keep retrying whenever requests arrive." -ForegroundColor DarkGray
}

if ($Foreground) {
    Write-Host "[Colibrì Relay] Starting relay in foreground (Press Ctrl+C to stop)..." -ForegroundColor Green
    & node $RelayScript --upstream $Upstream --port $Port
} else {
    Write-Host "[Colibrì Relay] Launching relay in background..." -ForegroundColor Green
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = "node"
    $startInfo.Arguments = "`"$RelayScript`" --upstream `"$Upstream`" --port $Port"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true

    $proc = [System.Diagnostics.Process]::Start($startInfo)
    Start-Sleep -Milliseconds 800

    if ($proc -and -not $proc.HasExited) {
        Write-Host "  Relay running in background (PID $($proc.Id))" -ForegroundColor Green
        Write-Host "  Local client endpoint : http://127.0.0.1:$Port" -ForegroundColor Cyan
        Write-Host "  To stop: powershell -ExecutionPolicy Bypass -File .\scripts\start-colibri-relay.ps1 -Stop" -ForegroundColor DarkGray
    } else {
        Write-Error "Failed to launch relay background process."
    }
}
