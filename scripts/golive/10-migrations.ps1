<#
.SYNOPSIS
    Interactive single-file database migration runner for Onyx.mx go-live.

.DESCRIPTION
    WHAT IT DOES:
    - Verifies current working directory is the repository root.
    - Displays pending draft migrations in strict order with purpose, risk, and rollback plan.
    - Explicitly excludes already applied migrations (document_jobs, onyxchan_audit, siri_tokens) and deferred decision files.
    - Prompts Ramses for confirmation (Y/N) before applying draft migration files (e.g. type_library).
    - Executes the single-file migration command against Supabase project yircifkayqpuydfdqzlm.
    - Supports -WhatIf to preview what would be executed without making any changes.

    WHAT IT NEVER DOES:
    - Never runs 'supabase db push' (which is unsafe due to timestamp differences).
    - Never auto-applies migrations without Ramses answering 'Y'.
    - Never applies the three migrations requiring Ramses' decision.
    - Never re-applies migrations that are already applied.
    - Never logs, prints, or exposes database connection credentials or secrets.

.PARAMETER WhatIf
    If specified, prints the single-file command that would be run for each migration without prompting or executing.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$WhatIf
)

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

$projectRef = "yircifkayqpuydfdqzlm"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ONYX.MX MIGRATION RUNNER (10-migrations.ps1)" -ForegroundColor Cyan
Write-Host "  Project Ref: $projectRef" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($WhatIf) {
    Write-Host "[MODE] -WhatIf specified: Dry run only. No changes will be made." -ForegroundColor Magenta
    Write-Host ""
}

Write-Host "Already applied migrations (DO NOT RE-APPLY):" -ForegroundColor DarkGray
Write-Host "  - 20261005120000_document_jobs.sql (Applied)" -ForegroundColor DarkGray
Write-Host "  - 20261010120000_onyxchan_audit.sql (Applied: table onyxchan_audit)" -ForegroundColor DarkGray
Write-Host "  - 20261011140000_siri_tokens.sql (Applied: table siri_tokens)" -ForegroundColor DarkGray
Write-Host "  - 20261011150000_device_functions_null_role_guard.sql (Applied)" -ForegroundColor DarkGray
Write-Host "  - 20261011160000_revoke_anon_new_tables.sql (Applied)" -ForegroundColor DarkGray
Write-Host ""

Write-Host "Reminder: The following 3 files require Ramses' decision and are SKIPPED:" -ForegroundColor Yellow
Write-Host "  - 20260725_pico_bridge_schema.sql (Retire legacy pico-bridge or keep?)" -ForegroundColor Gray
Write-Host "  - create_onyxchan_devices.sql (Conflicts with live onyxchan_devices?)" -ForegroundColor Gray
Write-Host "  - PENDING_consolidate_inventory_and_server_side_cypher.sql (Hold for season 826 stability?)" -ForegroundColor Gray
Write-Host ""

# Only pending draft migration(s): type_library gated behind explicit prompt
$migrations = @(
    @{
        File     = "supabase\migrations\20261011130000_type_library.sql"
        Name     = "20261011130000_type_library.sql"
        Purpose  = "Type definitions and metadata catalog for season 826 (DRAFT - requires explicit approval)"
        Risk     = "Low (Additive type library catalog)"
        Rollback = "DROP TABLE IF EXISTS type_library CASCADE;"
        IsDraft  = $true
    }
)

$index = 0
foreach ($m in $migrations) {
    $index++
    $fullPath = Join-Path $currentDir $m.File
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[$index/$($migrations.Count)] Migration: $($m.Name)" -ForegroundColor Cyan
    Write-Host "  Purpose:  $($m.Purpose)" -ForegroundColor Gray
    Write-Host "  Risk:     $($m.Risk)" -ForegroundColor Gray
    Write-Host "  Rollback: $($m.Rollback)" -ForegroundColor DarkYellow
    Write-Host "  File:     $fullPath" -ForegroundColor Gray
    if (Prop $m "IsDraft") {
        Write-Host "  [NOTICE] This migration is marked DRAFT. Gated behind explicit approval." -ForegroundColor Yellow
    }

    if (-not (Test-Path -Path $fullPath)) {
        Write-Host "  [WARN] File does not exist on disk: $fullPath" -ForegroundColor Red
        Write-Host "  (If this migration is being drafted today, create or finalize the file before applying.)" -ForegroundColor Yellow
    }

    # VERIFY ON FIRST RUN: single file execution command
    $cmdDisplay = "supabase db query --file `"$($m.File)`" --project-ref $projectRef"

    if ($WhatIf) {
        Write-Host "  [WhatIf] Would prompt to execute: $cmdDisplay" -ForegroundColor Magenta
        Write-Host "  [WhatIf] Fallback: Copy to clipboard for Supabase Dashboard SQL Editor" -ForegroundColor Magenta
        continue
    }

    Write-Host ""
    $response = Read-Host "Apply this migration? [Y = Execute via CLI / C = Copy to clipboard for SQL Editor / N = Skip / Q = Quit]"
    $cleanResponse = $response.Trim().ToUpperInvariant()

    if ($cleanResponse -eq "Q") {
        Write-Host "Aborting migration sequence by user request." -ForegroundColor Yellow
        break
    } elseif ($cleanResponse -eq "C") {
        if (Test-Path -Path $fullPath) {
            Get-Content -Raw $fullPath | Set-Clipboard
            Write-Host "  [COPIED] Content of $($m.Name) copied to Windows clipboard." -ForegroundColor Green
            Write-Host "           Paste into Supabase Dashboard SQL Editor and click Run." -ForegroundColor Yellow
            $ack = Read-Host "Press Enter once executed in Supabase Dashboard (or type 'fail' to abort)"
            if ($ack.Trim().ToLowerInvariant() -eq "fail") {
                Write-Error "Migration execution marked failed. Stopping sequence."
                exit 1
            }
        } else {
            Write-Host "  [ERROR] Cannot copy: file not found on disk." -ForegroundColor Red
        }
    } elseif ($cleanResponse -eq "Y") {
        Write-Host "  [RUNNING] Executing: $cmdDisplay" -ForegroundColor Yellow
        # VERIFY ON FIRST RUN: execute single SQL file against remote Supabase project
        & supabase db query --file "$($m.File)" --project-ref $projectRef
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Migration failed with exit code $LASTEXITCODE. Stopping sequence to prevent cascading errors."
            exit $LASTEXITCODE
        }
        Write-Host "  [SUCCESS] $($m.Name) applied successfully." -ForegroundColor Green
    } else {
        Write-Host "  [SKIPPED] $($m.Name) skipped by user." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Migration runner completed." -ForegroundColor Green
