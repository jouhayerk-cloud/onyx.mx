<#
.SYNOPSIS
    Starts and health-checks the local Colibri inference server on Windows.

.DESCRIPTION
    Manages the background daemon for Colibri (JustVugg/colibri) sparse expert streaming on Windows.
    Verifies loopback port availability, launches coli.exe or the development mock daemon, and
    performs health and model verification.

.PARAMETER Port
    TCP port for the Colibri HTTP server (default: 8082).

.PARAMETER ModelDir
    Path to NVMe model weights (default: "C:\colibri\models").

.PARAMETER DevMock
    Launches a lightweight local Node.js/Python mock server on port 8082 for dev testing if coli.exe is not installed.

.PARAMETER Stop
    Stops any running Colibri daemon on the specified port.

.PARAMETER Status
    Checks and displays the status of the Colibri server without starting it.

.PARAMETER Foreground
    Runs the process in the foreground rather than as a background daemon.

.EXAMPLE
    .\scripts\start-colibri-daemon.ps1
    Starts the Colibri daemon using default port 8082 and models at C:\colibri\models.

.EXAMPLE
    .\scripts\start-colibri-daemon.ps1 -DevMock
    Starts the dev mock daemon for local frontend and bridge testing without requiring the full engine.

.EXAMPLE
    .\scripts\start-colibri-daemon.ps1 -Stop
    Terminates the local Colibri server running on port 8082.
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [int]$Port = 8082,

    [Parameter(Position = 1)]
    [string]$ModelDir = "C:\colibri\models",

    [Parameter()]
    [switch]$DevMock,

    [Parameter()]
    [switch]$Stop,

    [Parameter()]
    [switch]$Status,

    [Parameter()]
    [switch]$Foreground
)

$ErrorActionPreference = "Continue"

function Write-ColibriBanner {
    Write-Host ""
    Write-Host " ======================================================================" -ForegroundColor DarkCyan
    Write-Host "   COLIBRI LOCAL MoE ENGINE - WINDOWS DAEMON ORCHESTRATOR               " -ForegroundColor Cyan -NoNewline
    Write-Host " [v1.2] " -ForegroundColor Yellow
    Write-Host "       NVMe Sparse Expert Streaming for Onyx-mx and Chan Chat           " -ForegroundColor DarkGray
    Write-Host " ======================================================================" -ForegroundColor DarkCyan
    Write-Host ""
}

function Test-PortActive {
    param([int]$CheckPort)
    $tcp = $null
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $iar = $tcp.BeginConnect("127.0.0.1", $CheckPort, $null, $null)
        $wait = $iar.AsyncWaitHandle.WaitOne(250, $false)
        if ($wait -and $tcp.Connected) {
            $tcp.EndConnect($iar)
            return $true
        }
        return $false
    } catch {
        return $false
    } finally {
        if ($tcp) { $tcp.Close() }
    }
}

function Stop-ColibriDaemon {
    param([int]$TargetPort)
    Write-Host " [INFO] Searching for processes listening on port $TargetPort..." -ForegroundColor Yellow
    
    $connections = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue
    if (-not $connections) {
        Write-Host " [INFO] No process found listening on port $TargetPort." -ForegroundColor Green
        return
    }

    foreach ($conn in $connections) {
        $procId = $conn.OwningProcess
        if ($procId -gt 0) {
            try {
                $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host " [STOP] Terminating process $($proc.ProcessName) (PID: ${procId})..." -ForegroundColor Yellow
                    Stop-Process -Id $procId -Force
                    Write-Host " [OK] Process $procId terminated successfully." -ForegroundColor Green
                }
            } catch {
                Write-Warning "Failed to stop process PID ${procId}: $_"
            }
        }
    }

    # Also stop any running Colibri Supabase Relay daemons
    try {
        $relayProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*colibri-supabase-relay.cjs*" }
        foreach ($rp in $relayProcs) {
            Write-Host " [STOP] Terminating Colibri Supabase Relay Daemon (PID: $($rp.ProcessId))..." -ForegroundColor Yellow
            Stop-Process -Id $rp.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host " [OK] Relay process $($rp.ProcessId) stopped." -ForegroundColor Green
        }
    } catch {
        # ignore
    }
}

function Start-DetachedProcess {
    param(
        [string]$CommandLine,
        [string]$FilePath,
        [string[]]$ArgumentList
    )
    try {
        $cimResult = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $CommandLine } -ErrorAction Stop
        if ($cimResult.ReturnValue -eq 0 -and $cimResult.ProcessId) {
            return $cimResult.ProcessId
        }
    } catch {
        # Fallback to Start-Process
    }
    $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WindowStyle Hidden -PassThru
    return $p.Id
}

function Show-HealthAndModels {
    param([int]$ActivePort)
    $baseUrl = "http://127.0.0.1:$ActivePort"
    
    Write-Host " ----------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host " [HEALTH CHECK] Querying $baseUrl/health ..." -ForegroundColor Cyan
    try {
        $health = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get -TimeoutSec 3 -ErrorAction Stop
        Write-Host "   Status:          " -NoNewline
        Write-Host "$($health.status)" -ForegroundColor Green
        Write-Host "   Engine:          " -NoNewline
        Write-Host "$($health.engine)" -ForegroundColor Cyan
        if ($health.version) {
            Write-Host "   Version:         $($health.version)" -ForegroundColor Gray
        }
        if ($health.nvmePath) {
            Write-Host "   NVMe Path:       $($health.nvmePath)" -ForegroundColor Gray
        }
        if ($health.telemetry) {
            Write-Host "   NVMe Throughput: $($health.telemetry.nvmeReadMBps) MB/s" -ForegroundColor Magenta
            Write-Host "   Cache Hit Rate:  $([math]::Round($health.telemetry.cacheHitRate * 100, 1))%" -ForegroundColor Magenta
            Write-Host "   Token Velocity:  $($health.telemetry.tokensPerSecond) tps" -ForegroundColor Magenta
        }
    } catch {
        Write-Host "   Status:          Responding on port, but /health endpoint returned error: $_" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host " [MODELS] Querying $baseUrl/v1/models ..." -ForegroundColor Cyan
    try {
        $modelsResponse = Invoke-RestMethod -Uri "$baseUrl/v1/models" -Method Get -TimeoutSec 3 -ErrorAction Stop
        $modelList = $modelsResponse.data
        if ($modelList -and $modelList.Count -gt 0) {
            foreach ($m in $modelList) {
                $owner = if ($m.owned_by) { $m.owned_by } else { "local" }
                Write-Host "   * $($m.id)" -ForegroundColor White -NoNewline
                Write-Host " ($owner)" -ForegroundColor DarkGray
            }
        } else {
            Write-Host "   No models reported." -ForegroundColor DarkYellow
        }
    } catch {
        Write-Host "   Could not retrieve /v1/models: $_" -ForegroundColor Yellow
    }

    Write-Host " ----------------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host " Helpful Commands:" -ForegroundColor Yellow
    Write-Host "   * Check Health:    Invoke-RestMethod http://127.0.0.1:$ActivePort/health" -ForegroundColor Gray
    Write-Host "   * List Models:     Invoke-RestMethod http://127.0.0.1:$ActivePort/v1/models" -ForegroundColor Gray
    Write-Host "   * Test Chat:       curl.exe -X POST http://127.0.0.1:$ActivePort/v1/chat/completions -H `"Content-Type: application/json`" -d `"{`\`"messages`\`":[{`\`"role`\`":`\`"user`\`",`\`"content`\`":`\`"hello`\`"}]}`"" -ForegroundColor Gray
    Write-Host "   * Stop Daemon:     .\scripts\start-colibri-daemon.ps1 -Stop -Port $ActivePort" -ForegroundColor Gray
    Write-Host ""
}

function Start-SupabaseRelayDaemon {
    param([int]$ActivePort)
    
    # Check if relay daemon is already running
    $runningRelay = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*colibri-supabase-relay.cjs*" }
    if ($runningRelay) {
        $firstPid = ($runningRelay | Select-Object -First 1).ProcessId
        Write-Host " [RELAY] Supabase Realtime Relay is already running (PID: $firstPid)" -ForegroundColor DarkCyan
        return
    }

    $relayScript = Join-Path $PSScriptRoot "colibri-supabase-relay.cjs"
    if (-not (Test-Path $relayScript)) {
        $relayScript = "C:\Jouhayerk\git\app\scripts\colibri-supabase-relay.cjs"
    }

    if (Test-Path $relayScript) {
        $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
        if ($nodeCmd) {
            $nodeExe = $nodeCmd.Source
            $cmdLine = "`"$nodeExe`" `"$relayScript`" --port $ActivePort"
            $arguments = @("`"$relayScript`"", "--port", "$ActivePort")
            $relayPid = Start-DetachedProcess -CommandLine $cmdLine -FilePath $nodeExe -ArgumentList $arguments
            Write-Host " [RELAY] Launched Colibri Supabase Realtime Relay Daemon (PID: $relayPid) -> colibri_relay_global" -ForegroundColor Magenta
        } else {
            Write-Host " [RELAY] Node.js not detected; skipping background relay daemon." -ForegroundColor DarkYellow
        }
    }
}

# --- Execution Entrypoint ---
Write-ColibriBanner

if ($Stop) {
    Stop-ColibriDaemon -TargetPort $Port
    exit 0
}

Write-Host " [PORT CHECK] Testing loopback connection on 127.0.0.1:$Port ..." -ForegroundColor Gray
$isPortActive = Test-PortActive -CheckPort $Port

if ($isPortActive) {
    Write-Host " [OK] Colibri local server is ALREADY ACTIVE on port $Port (http://127.0.0.1:$Port)" -ForegroundColor Green
    Start-SupabaseRelayDaemon -ActivePort $Port
    Show-HealthAndModels -ActivePort $Port
    exit 0
}

if ($Status) {
    Write-Host " [INACTIVE] No server is listening on port $Port." -ForegroundColor Yellow
    Write-Host " Launch it with: .\scripts\start-colibri-daemon.ps1 -Port $Port" -ForegroundColor DarkGray
    exit 1
}

Write-Host " [INFO] Port $Port is available." -ForegroundColor Gray

# Look for native coli.exe executable
$coliSearchPaths = @(
    (Join-Path (Split-Path $ModelDir -Parent) "coli.exe"),
    "C:\colibri\coli.exe",
    "C:\colibri\c\coli.exe"
)

$foundColiExe = $null
foreach ($path in $coliSearchPaths) {
    if (Test-Path $path) {
        $foundColiExe = (Resolve-Path $path).Path
        break
    }
}

if (-not $foundColiExe) {
    $cmdColi = Get-Command "coli.exe" -ErrorAction SilentlyContinue
    if ($cmdColi) {
        $foundColiExe = $cmdColi.Source
    }
}

# Locate Dev Mock server script if needed
$mockScriptCandidates = @(
    (Join-Path $PSScriptRoot "colibri-mock-server.cjs"),
    (Join-Path (Join-Path $PSScriptRoot "scripts") "colibri-mock-server.cjs"),
    "C:\Jouhayerk\scripts\colibri-mock-server.cjs",
    "C:\Jouhayerk\git\app\scripts\colibri-mock-server.cjs"
)

$foundMockScript = $null
foreach ($mPath in $mockScriptCandidates) {
    if (Test-Path $mPath) {
        $foundMockScript = (Resolve-Path $mPath).Path
        break
    }
}

if ($foundColiExe) {
    Write-Host " [BINARY] Found Colibri executable: $foundColiExe" -ForegroundColor Green
    Write-Host " [STORAGE] Model directory: $ModelDir" -ForegroundColor Cyan
    
    if (-not (Test-Path $ModelDir)) {
        Write-Host " [WARNING] Model directory '$ModelDir' does not exist yet. Creating directory..." -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $ModelDir -Force | Out-Null
    }

    $arguments = @("--server", "--port", "$Port", "--nvme-path", "$ModelDir")
    Write-Host " [LAUNCH] Starting coli.exe with arguments: $($arguments -join ' ')" -ForegroundColor Cyan

    if ($Foreground) {
        Write-Host " [RUN] Running in foreground. Press Ctrl+C to stop." -ForegroundColor Yellow
        & $foundColiExe $arguments
        exit 0
    } else {
        $fullCmd = "`"$foundColiExe`" $($arguments -join ' ')"
        $procId = Start-DetachedProcess -CommandLine $fullCmd -FilePath $foundColiExe -ArgumentList $arguments
        Write-Host " [DAEMON] Started background process PID: $procId" -ForegroundColor Green
    }
} elseif ($DevMock) {
    Write-Host " [DEV-MOCK] coli.exe not detected. Starting lightweight Colibri Dev Mock server..." -ForegroundColor Magenta
    
    if (-not $foundMockScript) {
        Write-Error "DevMock script colibri-mock-server.cjs not found in scripts directory."
        exit 1
    }

    # Verify Node.js runtime
    $nodeCmd = Get-Command "node" -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
        Write-Error "Node.js is required to run the DevMock server. Please install Node.js (v18+) or install coli.exe."
        exit 1
    }

    $nodeExe = $nodeCmd.Source
    $arguments = @("`"$foundMockScript`"", "--port", "$Port", "--nvme-path", "`"$ModelDir`"")

    Write-Host " [LAUNCH] Starting: $nodeExe $($arguments -join ' ')" -ForegroundColor DarkCyan

    if ($Foreground) {
        Write-Host " [RUN] Running DevMock in foreground. Press Ctrl+C to stop." -ForegroundColor Yellow
        & $nodeExe $foundMockScript --port $Port --nvme-path $ModelDir
        exit 0
    } else {
        $fullCmd = "`"$nodeExe`" `"$foundMockScript`" --port $Port --nvme-path `"$ModelDir`""
        $procId = Start-DetachedProcess -CommandLine $fullCmd -FilePath $nodeExe -ArgumentList $arguments
        Write-Host " [DAEMON] Started DevMock background process PID: $procId" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host " ======================================================================" -ForegroundColor Yellow
    Write-Host "   [!] COLIBRI EXECUTABLE NOT FOUND (coli.exe)                          " -ForegroundColor Yellow
    Write-Host " ======================================================================" -ForegroundColor Yellow
    Write-Host "  Could not find 'coli.exe' in 'C:\colibri\' or in system PATH." -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Options to proceed:" -ForegroundColor White
    Write-Host "   1. Run with -DevMock to start the lightweight local testing server:" -ForegroundColor Cyan
    Write-Host "      .\scripts\start-colibri-daemon.ps1 -DevMock" -ForegroundColor White
    Write-Host ""
    Write-Host "   2. Install coli.exe and download models following the setup guide:" -ForegroundColor Cyan
    Write-Host "      See: docs/ai/COLIBRI_WINDOWS_SETUP.md" -ForegroundColor White
    Write-Host ""
    Write-Host "   3. If your binary is located elsewhere, specify via PATH or copy to C:\colibri\coli.exe" -ForegroundColor Gray
    Write-Host " ======================================================================" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Wait for daemon to become responsive
Write-Host " [WAIT] Waiting for Colibri server to initialize on port $Port..." -ForegroundColor Gray
$maxAttempts = 15
$attempt = 0
$serverReady = $false

while ($attempt -lt $maxAttempts) {
    Start-Sleep -Milliseconds 600
    $attempt++
    if (Test-PortActive -CheckPort $Port) {
        $serverReady = $true
        break
    }
    Write-Host "." -NoNewline -ForegroundColor DarkGray
}
Write-Host ""

if ($serverReady) {
    Write-Host " [SUCCESS] Colibri daemon is online and healthy!" -ForegroundColor Green
    Start-SupabaseRelayDaemon -ActivePort $Port
    Show-HealthAndModels -ActivePort $Port
    exit 0
} else {
    Write-Host " [ERROR] Server failed to respond on port $Port within $($maxAttempts * 0.6) seconds." -ForegroundColor Red
    Write-Host " Check system event logs or launch with -Foreground to inspect console errors." -ForegroundColor Yellow
    exit 1
}
