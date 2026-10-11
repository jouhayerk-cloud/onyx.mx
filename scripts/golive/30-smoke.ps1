<#
.SYNOPSIS
    Automated smoke tests for live Onyx.mx Edge Functions and Cloud Run Gateway.

.DESCRIPTION
    WHAT IT DOES:
    - Verifies current working directory is the repository root.
    - Reads the test JWT strictly from environment variable ONYX_TEST_JWT.
    - Executes HTTP probe tests using curl.exe against Supabase project yircifkayqpuydfdqzlm.
    - Verifies expected status codes:
        * 401 Unauthorized when unauthenticated calls are made to secured endpoints.
        * 405 Method Not Allowed or 401 when unexpected HTTP methods are used.
        * 200 OK (or expected service response) when valid JWT credentials are provided.
    - Optionally tests Cloud Run Gateway (/v1/checkin) if GATEWAY_SERVICE_URL is defined.
    - Prints a PASS / FAIL summary table with HTTP status codes.

    WHAT IT NEVER DOES:
    - Never reads tokens or secrets from files on disk.
    - Never prints, logs, or echos the content of ONYX_TEST_JWT or any authorization header.
    - Never runs mutating or destructive actions.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Prop($o, $n) {
    if ($null -ne $o -and $o.PSObject.Properties[$n]) { return $o.$n }
    return $null
}

# Refuse to run if not in repository root (or valid repo containing supabase\config.toml)
$expectedRoot = "C:\Jouhayerk\git\onyxchan-wt\GOLIVE-1"
$currentDir = (Get-Item -LiteralPath (Get-Location).Path).FullName.TrimEnd('\/')
$normExpected = $expectedRoot.TrimEnd('\/')

if (-not [string]::Equals($currentDir, $normExpected, [System.StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path -Path "supabase\config.toml")) {
    Write-Error "Refusing to run: Current working directory '$currentDir' is not the repository root '$normExpected' or lacks supabase\config.toml."
    exit 1
}

$baseUrl = "https://yircifkayqpuydfdqzlm.supabase.co/functions/v1"
$jwt = $env:ONYX_TEST_JWT

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ONYX.MX EDGE FUNCTIONS SMOKE TESTS (30-smoke.ps1)" -ForegroundColor Cyan
Write-Host "  Base URL: $baseUrl" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrWhiteSpace($jwt)) {
    Write-Host "[WARN] Environment variable ONYX_TEST_JWT is not set." -ForegroundColor Yellow
    Write-Host "       Authenticated tests will be skipped. Only unauthenticated (401/405) checks will run." -ForegroundColor Yellow
    Write-Host "       To run authenticated checks: `$env:ONYX_TEST_JWT = 'your_test_jwt'" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "[INFO] ONYX_TEST_JWT is present. Authenticated tests will run." -ForegroundColor Green
    Write-Host ""
}

# Helper to run curl.exe and extract HTTP status code
function Invoke-Probe {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers,
        [string]$Body,
        [int[]]$ExpectedStatuses
    )

    $curlArgs = @("-s", "-o", "NUL", "-w", "%{http_code}", "-X", $Method, $Url)
    if ($Headers) {
        foreach ($key in $Headers.Keys) {
            $curlArgs += @("-H", "$($key): $($Headers[$key])")
        }
    }
    if ($Body) {
        $curlArgs += @("-d", $Body)
    }

    try {
        $rawCode = & curl.exe @curlArgs
        $statusCode = [int]((-join $rawCode).Trim())
    } catch {
        Write-Host "  [FAIL] $Name : Execution error ($($_.Exception.Message))" -ForegroundColor Red
        return $false
    }

    $isMatch = $ExpectedStatuses -contains $statusCode
    $expectedStr = ($ExpectedStatuses -join " or ")

    if ($isMatch) {
        Write-Host "  [PASS] $Name -> HTTP $statusCode (Expected: $expectedStr)" -ForegroundColor Green
        return $true
    } else {
        Write-Host "  [FAIL] $Name -> HTTP $statusCode (Expected: $expectedStr)" -ForegroundColor Red
        return $false
    }
}

$totalTests = 0
$passedTests = 0

function Record-Result([bool]$success) {
    $script:totalTests++
    if ($success) { $script:passedTests++ }
}

Write-Host "--- [1] Baseline Live Functions ---" -ForegroundColor Yellow
# artifact (public tag scan, expects 400 or 200)
Record-Result (Invoke-Probe -Name "artifact (public endpoint)" -Method "GET" -Url "$baseUrl/artifact" -ExpectedStatuses @(200, 400))
# artifact-preview
Record-Result (Invoke-Probe -Name "artifact-preview (public endpoint)" -Method "GET" -Url "$baseUrl/artifact-preview" -ExpectedStatuses @(200, 400))

Write-Host ""
Write-Host "--- [2] onyx-mcp (accepts JWT or mcp_ token) ---" -ForegroundColor Yellow
# Unauthenticated POST -> 401
Record-Result (Invoke-Probe -Name "onyx-mcp (No Auth)" -Method "POST" -Url "$baseUrl/onyx-mcp" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
# GET root -> expects 200 health JSON
Record-Result (Invoke-Probe -Name "onyx-mcp (GET root)" -Method "GET" -Url "$baseUrl/onyx-mcp" -ExpectedStatuses @(200))
# Authenticated POST
if (-not [string]::IsNullOrWhiteSpace($jwt)) {
    Record-Result (Invoke-Probe -Name "onyx-mcp (Auth JWT)" -Method "POST" -Url "$baseUrl/onyx-mcp" -Headers @{"Authorization"="Bearer $jwt"; "Content-Type"="application/json"} -Body '{"jsonrpc":"2.0","method":"tools/list","id":1}' -ExpectedStatuses @(200))
}

Write-Host ""
Write-Host "--- [3] onyxchan-mcp (Staff JWT / Device Tokens) ---" -ForegroundColor Yellow
# Unauthenticated POST -> 401
Record-Result (Invoke-Probe -Name "onyxchan-mcp (No Auth)" -Method "POST" -Url "$baseUrl/onyxchan-mcp" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
# Authenticated POST to /rpc
if (-not [string]::IsNullOrWhiteSpace($jwt)) {
    Record-Result (Invoke-Probe -Name "onyxchan-mcp (Auth JWT /rpc)" -Method "POST" -Url "$baseUrl/onyxchan-mcp/rpc" -Headers @{"Authorization"="Bearer $jwt"; "Content-Type"="application/json"} -Body '{"jsonrpc":"2.0","method":"tools/list","id":1}' -ExpectedStatuses @(200))
}

Write-Host ""
Write-Host "--- [4] onyx-ai (Gemini Assistant) ---" -ForegroundColor Yellow
# Unauthenticated POST -> 401
Record-Result (Invoke-Probe -Name "onyx-ai (No Auth)" -Method "POST" -Url "$baseUrl/onyx-ai" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
# Authenticated POST
if (-not [string]::IsNullOrWhiteSpace($jwt)) {
    Record-Result (Invoke-Probe -Name "onyx-ai (Auth JWT)" -Method "POST" -Url "$baseUrl/onyx-ai" -Headers @{"Authorization"="Bearer $jwt"; "Content-Type"="application/json"} -Body '{"messages":[{"role":"user","parts":[{"text":"Say OK"}]}],"model":"gemini-2.5-flash"}' -ExpectedStatuses @(200))
}

Write-Host ""
Write-Host "--- [5] siri-token (Personal Token Generator) ---" -ForegroundColor Yellow
# Unauthenticated POST -> 401
Record-Result (Invoke-Probe -Name "siri-token (No Auth)" -Method "POST" -Url "$baseUrl/siri-token" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
# Authenticated POST
if (-not [string]::IsNullOrWhiteSpace($jwt)) {
    Record-Result (Invoke-Probe -Name "siri-token (Auth JWT)" -Method "POST" -Url "$baseUrl/siri-token" -Headers @{"Authorization"="Bearer $jwt"; "Content-Type"="application/json"} -Body '{"action":"list"}' -ExpectedStatuses @(200))
}

Write-Host ""
Write-Host "--- [6] siri-inventory (Voice Adapter) ---" -ForegroundColor Yellow
# Unauthenticated POST -> 401
Record-Result (Invoke-Probe -Name "siri-inventory (No Auth)" -Method "POST" -Url "$baseUrl/siri-inventory" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
# Authenticated POST
if (-not [string]::IsNullOrWhiteSpace($jwt)) {
    Record-Result (Invoke-Probe -Name "siri-inventory (Auth JWT)" -Method "POST" -Url "$baseUrl/siri-inventory" -Headers @{"Authorization"="Bearer $jwt"; "Content-Type"="application/json"} -Body '{"intent":"count","query":"","lang":"en"}' -ExpectedStatuses @(200))
}

Write-Host ""
Write-Host "--- [7] Gateway (Cloud Run) ---" -ForegroundColor Yellow
$gatewayUrl = $env:GATEWAY_SERVICE_URL
if (-not [string]::IsNullOrWhiteSpace($gatewayUrl)) {
    # Checkin endpoint without token -> 401 (proves container is up and enforcing token check)
    Record-Result (Invoke-Probe -Name "Gateway Checkin (No Token)" -Method "POST" -Url "$gatewayUrl/v1/checkin" -Headers @{"Content-Type"="application/json"} -ExpectedStatuses @(401))
} else {
    Write-Host "  [SKIP] GATEWAY_SERVICE_URL environment variable is not set. Gateway probe skipped." -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  TEST RESULTS: $passedTests / $totalTests Passed" -ForegroundColor ($([System.ConsoleColor]$(if ($passedTests -eq $totalTests) { "Green" } else { "Yellow" })))
Write-Host "============================================================" -ForegroundColor Cyan
