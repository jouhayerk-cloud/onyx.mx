<#
.SYNOPSIS
    Starts and health-checks the local Colibri server on Windows (OpenAI API on http://127.0.0.1:8000).

.DESCRIPTION
    Colibri's own installer (START-HERE.bat / "coli setup") writes %LOCALAPPDATA%\colibri\setup.json with the model
    folder, the port and the exact arguments. This script reads that file, starts `coli web` with those arguments on
    127.0.0.1, and adds the browser origins the Onyx app is served from to Colibri's CORS list
    (--cors-origin +ORIGIN keeps the built-in list and adds yours). It then shows what the server really reports.

    The server serves ONE model at a time, is text only, and is slow (about 0.5 tokens per second measured on this PC).
    The Supabase Realtime relay is disabled until it is secured, so nothing here starts it.

.PARAMETER Port
    TCP port (default: the port in setup.json, else 8000).

.PARAMETER CorsOrigin
    Browser origins allowed to call the server. Default: the deployed app and https://localhost:1001. For a LAN address pass it here or set COLIBRI_CORS_ORIGINS (comma separated). http://localhost:5173 is already in
    Colibri's built-in list. Add the dev server origin if you serve the app from another port.

.PARAMETER DevMock
    Starts scripts\colibri-mock-server.cjs instead of the real engine (canned answers, same API shape). For
    developing the app only; never for real answers.

.PARAMETER Stop
    Stops whatever listens on the port.

.PARAMETER Status
    Shows the status without starting anything.

.PARAMETER Foreground
    Runs in this window (Ctrl+C stops it).

.EXAMPLE
    .\scripts\start-colibri-daemon.ps1
.EXAMPLE
    .\scripts\start-colibri-daemon.ps1 -CorsOrigin https://jouhayerk-cloud.github.io,https://localhost:1001
.EXAMPLE
    .\scripts\start-colibri-daemon.ps1 -Stop
#>

[CmdletBinding()]
param(
    [int]$Port = 0,
    [string[]]$CorsOrigin = @("https://jouhayerk-cloud.github.io", "https://localhost:1001"),
    [switch]$DevMock,
    [switch]$Stop,
    [switch]$Status,
    [switch]$Foreground
)

$ErrorActionPreference = "Continue"
$SetupFile = Join-Path $env:LOCALAPPDATA "colibri\setup.json"
$setup = $null
if (Test-Path $SetupFile) {
    try { $setup = Get-Content $SetupFile -Raw | ConvertFrom-Json } catch { $setup = $null }
}
if ($Port -le 0) { $Port = if ($setup -and $setup.port) { [int]$setup.port } else { 8000 } }

function Test-PortActive {
    param([int]$CheckPort)
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $CheckPort, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(250, $false) -and $tcp.Connected) { $tcp.EndConnect($iar); return $true }
        return $false
    } catch { return $false } finally { if ($tcp) { $tcp.Close() } }
}

function Stop-ColibriDaemon {
    param([int]$TargetPort)
    $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) { Write-Host " [INFO] Nothing is listening on port $TargetPort." -ForegroundColor Green; return }
    foreach ($conn in $connections) {
        $procId = $conn.OwningProcess
        if ($procId -gt 0) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host " [STOP] Stopping $($proc.ProcessName) (PID $procId)" -ForegroundColor Yellow
                Stop-Process -Id $procId -Force
            }
        }
    }
}

function Show-Health {
    param([int]$ActivePort)
    $baseUrl = "http://127.0.0.1:$ActivePort"
    Write-Host " ----------------------------------------------------------------------" -ForegroundColor DarkGray
    try {
        $h = Invoke-RestMethod -Uri "$baseUrl/health" -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   Status:   $($h.status)" -ForegroundColor Green
        if ($h.arch) { Write-Host "   Arch:     $($h.arch)" -ForegroundColor Gray }
        if ($h.scheduler) { Write-Host "   Queue:    active $($h.scheduler.active), queued $($h.scheduler.queued), completed $($h.scheduler.completed)" -ForegroundColor Gray }
        if ($h.input_modalities) { Write-Host "   Input:    $($h.input_modalities -join ', ')" -ForegroundColor Gray }
    } catch {
        Write-Host "   /health did not answer: $_" -ForegroundColor Yellow
    }
    try {
        $m = Invoke-RestMethod -Uri "$baseUrl/v1/models" -TimeoutSec 3 -ErrorAction Stop
        foreach ($model in $m.data) { Write-Host "   Model:    $($model.id)" -ForegroundColor White }
    } catch {
        Write-Host "   /v1/models did not answer: $_" -ForegroundColor Yellow
    }
    Write-Host " ----------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "   Stop it with: .\scripts\start-colibri-daemon.ps1 -Stop -Port $ActivePort" -ForegroundColor Gray
}

# --- Entrypoint ---
if ($Stop) { Stop-ColibriDaemon -TargetPort $Port; exit 0 }

if (Test-PortActive -CheckPort $Port) {
    Write-Host " [OK] A server is already listening on http://127.0.0.1:$Port" -ForegroundColor Green
    Write-Host " [NOTE] CORS origins are fixed when the server starts. If the app is blocked, stop it and start it again here." -ForegroundColor DarkYellow
    Show-Health -ActivePort $Port
    exit 0
}

if ($Status) {
    Write-Host " [INACTIVE] Nothing is listening on port $Port." -ForegroundColor Yellow
    exit 1
}

if ($DevMock) {
    $mock = Join-Path $PSScriptRoot "colibri-mock-server.cjs"
    $node = (Get-Command "node" -ErrorAction SilentlyContinue)
    if (-not $node -or -not (Test-Path $mock)) { Write-Error "DevMock needs Node.js and scripts\colibri-mock-server.cjs."; exit 1 }
    Write-Host " [DEV-MOCK] Starting the MOCK server (canned answers, not Colibri) on port $Port" -ForegroundColor Magenta
    if ($Foreground) { & $node.Source $mock --port $Port; exit 0 }
    Start-Process -FilePath $node.Source -ArgumentList @("`"$mock`"", "--port", "$Port") -WindowStyle Hidden | Out-Null
} else {
    if (-not $setup -or -not $setup.args) {
        Write-Host " [!] Colibri is not set up on this PC (no $SetupFile)." -ForegroundColor Yellow
        Write-Host "     Run START-HERE.bat in the Colibri folder once; see docs/ai/COLIBRI_WINDOWS_SETUP.md." -ForegroundColor Gray
        exit 1
    }
    $runtimeDir = Split-Path -Parent $setup.launcher
    $coliCmd = Join-Path $runtimeDir "coli.cmd"
    if (-not (Test-Path $coliCmd)) { Write-Error "coli.cmd not found next to $($setup.launcher). Re-run Colibri's setup."; exit 1 }

    $argList = @($setup.args | ForEach-Object { "$_" })
    # keep the server on this machine and replace the port if one was given
    $argList = @($argList | Where-Object { $_ -ne "--no-browser" })
    $envOrigins = if ($env:COLIBRI_CORS_ORIGINS) { $env:COLIBRI_CORS_ORIGINS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ } } else { @() }
    foreach ($origin in @($CorsOrigin) + @($envOrigins)) {
        if ($origin) { $argList += @("--cors-origin", "+$origin") }
    }
    $argList += "--no-browser"
    $pIdx = [array]::IndexOf($argList, "--port")
    if ($pIdx -ge 0 -and $pIdx + 1 -lt $argList.Count) { $argList[$pIdx + 1] = "$Port" } else { $argList += @("--port", "$Port") }

    foreach ($k in $setup.env.PSObject.Properties) { Set-Item -Path "Env:$($k.Name)" -Value "$($k.Value)" }
    Write-Host " [LAUNCH] coli.cmd $($argList -join ' ')" -ForegroundColor Cyan
    if ($Foreground) { & $coliCmd @argList; exit 0 }
    Start-Process -FilePath $coliCmd -ArgumentList $argList -WindowStyle Hidden | Out-Null
}

Write-Host " [WAIT] Waiting for the server (loading a large model can take a minute)..." -ForegroundColor Gray
$ready = $false
for ($i = 0; $i -lt 100; $i++) {
    Start-Sleep -Milliseconds 600
    if (Test-PortActive -CheckPort $Port) { $ready = $true; break }
}
if ($ready) {
    Write-Host " [SUCCESS] Colibri is listening on http://127.0.0.1:$Port" -ForegroundColor Green
    Show-Health -ActivePort $Port
    exit 0
}
Write-Host " [ERROR] No answer on port $Port. Run with -Foreground to see the engine output." -ForegroundColor Red
exit 1
