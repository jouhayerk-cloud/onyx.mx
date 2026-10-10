<#
.SYNOPSIS
    Pre-flight environment and tool verification for Onyx.mx go-live.

.DESCRIPTION
    WHAT IT DOES:
    - Verifies current working directory is the repository root.
    - Checks availability and prints versions of required CLI tools (supabase, gcloud, node, npm, curl.exe).
    - Lists local migration files found in supabase\migrations.
    - Displays the ordered deployment plan for migrations and edge functions.
    - Changes nothing on your machine or in the cloud (read-only audit).

    WHAT IT NEVER DOES:
    - Never executes migrations or applies database changes.
    - Never deploys edge functions or Cloud Run services.
    - Never prints, logs, or transmits secret keys or tokens.
    - Never modifies local files or configuration.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Refuse to run if not in repository root
$expectedRoot = "C:\Jouhayerk\git\onyxchan-wt\GOLIVE-1"
$currentDir = (Get-Item -LiteralPath (Get-Location).Path).FullName.TrimEnd('\/')
$normExpected = $expectedRoot.TrimEnd('\/')

if (-not [string]::Equals($currentDir, $normExpected, [System.StringComparison]::OrdinalIgnoreCase) -and -not (Test-Path -Path "supabase\config.toml")) {
    Write-Error "Refusing to run: Current working directory '$currentDir' is not the repository root '$normExpected'."
    exit 1
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ONYX.MX GO-LIVE PRE-FLIGHT CHECK (00-check.ps1)" -ForegroundColor Cyan
Write-Host "  Date: 2026-10-11 | Project Ref: yircifkayqpuydfdqzlm" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Tool availability checks
Write-Host "[1/4] Checking required tools..." -ForegroundColor Yellow

$tools = @(
    @{ Name = "supabase"; CheckCommand = "supabase --version" },
    @{ Name = "gcloud";   CheckCommand = "gcloud --version" },
    @{ Name = "node";     CheckCommand = "node --version" },
    @{ Name = "npm";      CheckCommand = "npm --version" },
    @{ Name = "curl";     CheckCommand = "curl.exe --version" }
)

foreach ($tool in $tools) {
    $cmd = Get-Command $tool.Name -ErrorAction SilentlyContinue
    if ($cmd) {
        Write-Host "  [OK] $($tool.Name): Found at $($cmd.Source)" -ForegroundColor Green
        try {
            $versionOutput = & ($tool.Name) --version 2>&1 | Select-Object -First 1
            Write-Host "       Version: $versionOutput" -ForegroundColor Gray
        } catch {
            Write-Host "       (Could not query version directly)" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [WARN] $($tool.Name): Not found in PATH!" -ForegroundColor Red
    }
}

Write-Host ""

# 2. Local migration inspection
Write-Host "[2/4] Inspecting local migrations directory..." -ForegroundColor Yellow
$migrationsDir = Join-Path $currentDir "supabase\migrations"
if (Test-Path -Path $migrationsDir) {
    $migrationFiles = Get-ChildItem -Path $migrationsDir -Filter "*.sql" | Sort-Object Name
    Write-Host "  Found $($migrationFiles.Count) migration file(s) in ${migrationsDir}:" -ForegroundColor Gray
    foreach ($mf in $migrationFiles) {
        Write-Host "    - $($mf.Name)" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARN] Migrations directory not found at: $migrationsDir" -ForegroundColor Red
}

Write-Host ""

# 3. Ordered migration plan
Write-Host "[3/4] Ordered Migration Plan for Season 826:" -ForegroundColor Yellow
Write-Host "  [ALREADY LIVE - DO NOT RE-APPLY]:" -ForegroundColor DarkGray
Write-Host "    * 20260920_item_segmentation.sql              (Live as version 20260921014132)" -ForegroundColor DarkGray
Write-Host "    * 20260830234500_device_auth_per_device_tokens.sql (Live as version 20260831002448)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  [PENDING RAMSES DECISION - DO NOT APPLY YET]:" -ForegroundColor Magenta
Write-Host "    * 20260725_pico_bridge_schema.sql             (Decision: Retire legacy pico bridge or keep?)" -ForegroundColor Magenta
Write-Host "    * create_onyxchan_devices.sql                 (Decision: Conflicts with live onyxchan_devices?)" -ForegroundColor Magenta
Write-Host "    * PENDING_consolidate_inventory_and_server_side_cypher.sql (Decision: Wait for inventory stability?)" -ForegroundColor Magenta
Write-Host ""
Write-Host "  [READY TO APPLY IN ORDER]:" -ForegroundColor Cyan
Write-Host "    1. 20261005120000_document_jobs.sql           (Additive: Document export job queue)" -ForegroundColor White
Write-Host "    2. 20261010120000_onyxchan_audit.sql          (Additive: Audit logging tables)" -ForegroundColor White
Write-Host "    3. 20261011130000_type_library.sql            (Additive: Type definitions catalog)" -ForegroundColor White
Write-Host "    4. 20261011140000_siri_tokens.sql             (Additive: Siri auth tokens table)" -ForegroundColor White

Write-Host ""

# 4. Ordered edge function deployment plan
Write-Host "[4/4] Edge Functions Deployment Plan:" -ForegroundColor Yellow
Write-Host "  Live today: artifact, artifact-preview" -ForegroundColor Gray
Write-Host "  To deploy in sequence:" -ForegroundColor Cyan
Write-Host "    1. onyx-mcp        (verify_jwt: true,  Data MCP server for agents & app)" -ForegroundColor White
Write-Host "    2. onyxchan-mcp    (verify_jwt: false, Hardware device tokens + Staff JWT)" -ForegroundColor White
Write-Host "    3. onyx-ai         (verify_jwt: true,  Gemini AI bridge)" -ForegroundColor White
Write-Host "    4. siri-token      (verify_jwt: true,  Siri personal token generator)" -ForegroundColor White
Write-Host "    5. siri-inventory  (verify_jwt: false, Siri voice adapter with internal token auth)" -ForegroundColor White

Write-Host ""
Write-Host "Check complete. No changes were made." -ForegroundColor Green
Write-Host "Next step: Review docs/runbooks/GO_LIVE_KIT.md and run scripts/golive/10-migrations.ps1." -ForegroundColor Gray
