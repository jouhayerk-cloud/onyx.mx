<#
.SYNOPSIS
    Interactive edge functions deployment runner for Onyx.mx go-live.

.DESCRIPTION
    WHAT IT DOES:
    - Verifies current working directory is the repository root.
    - Displays each local edge function to deploy in strict order:
        1. onyx-mcp (JWT only)
        2. onyxchan-mcp (staff JWT and device tokens, verify_jwt false)
        3. onyx-ai (Gemini AI features)
        4. siri-token (verify_jwt true)
        5. siri-inventory (verify_jwt false, internal token auth)
    - Reminds Ramses of required secrets before deployment.
    - Prompts Ramses for confirmation (Y/N) before deploying each function.
    - Executes 'supabase functions deploy <name> --project-ref yircifkayqpuydfdqzlm' (with --no-verify-jwt where required).
    - Supports -WhatIf to preview deployment commands without executing.

    WHAT IT NEVER DOES:
    - Never deploys functions without Ramses confirming 'Y'.
    - Never hardcodes or prints API keys, secrets, or tokens.
    - Never modifies existing live functions (artifact, artifact-preview) without confirmation.
    - Never continues if a function deployment encounters an error.

.PARAMETER WhatIf
    If specified, prints the deploy command that would be run for each function without prompting or executing.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [switch]$WhatIf
)

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

$projectRef = "yircifkayqpuydfdqzlm"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  ONYX.MX EDGE FUNCTIONS DEPLOYER (20-functions.ps1)" -ForegroundColor Cyan
Write-Host "  Project Ref: $projectRef" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if ($WhatIf) {
    Write-Host "[MODE] -WhatIf specified: Dry run only. No deployments will execute." -ForegroundColor Magenta
    Write-Host ""
}

# Reminder on secrets
Write-Host "IMPORTANT: Ensure secrets are set before deploying functions:" -ForegroundColor Yellow
Write-Host "  - SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY (provided automatically by Supabase)" -ForegroundColor Gray
Write-Host "  - ONYXCHAN_ALLOWED_ORIGIN (e.g. set via: supabase secrets set ONYXCHAN_ALLOWED_ORIGIN=...)" -ForegroundColor Gray
Write-Host "  - GEMINI_API_KEY          (e.g. set via: supabase secrets set GEMINI_API_KEY=...)" -ForegroundColor Gray
Write-Host ""

$functions = @(
    @{
        Name       = "onyx-mcp"
        VerifyJwt  = $true
        ExtraFlags = @()
        Secrets    = "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
        Desc       = "Data MCP server for agents & web app (JWT-only auth)"
    },
    @{
        Name       = "onyxchan-mcp"
        VerifyJwt  = $false
        ExtraFlags = @("--no-verify-jwt")
        Secrets    = "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ONYXCHAN_ALLOWED_ORIGIN"
        Desc       = "Staff JWT and hardware device tokens (ocd_ prefix; app-level auth)"
    },
    @{
        Name       = "onyx-ai"
        VerifyJwt  = $true
        ExtraFlags = @()
        Secrets    = "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY"
        Desc       = "Gemini AI assistant bridge"
    },
    @{
        Name       = "siri-token"
        VerifyJwt  = $true
        ExtraFlags = @()
        Secrets    = "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
        Desc       = "Personal siri_ token issuance and management"
    },
    @{
        Name       = "siri-inventory"
        VerifyJwt  = $false
        ExtraFlags = @("--no-verify-jwt")
        Secrets    = "SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
        Desc       = "Siri voice adapter for warehouse inventory (verifies JWT or siri_ token internally)"
    }
)

$index = 0
foreach ($fn in $functions) {
    $index++
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "[$index/$($functions.Count)] Function: $($fn.Name)" -ForegroundColor Cyan
    Write-Host "  Description: $($fn.Desc)" -ForegroundColor Gray
    Write-Host "  Verify JWT:  $($fn.VerifyJwt)" -ForegroundColor Gray
    Write-Host "  Secrets:     $($fn.Secrets)" -ForegroundColor DarkYellow

    # Construct deploy command
    $cmdArgs = @("functions", "deploy", $fn.Name, "--project-ref", $projectRef)
    if ($fn.ExtraFlags.Count -gt 0) {
        $cmdArgs += $fn.ExtraFlags
    }
    $displayCmd = "supabase " + ($cmdArgs -join " ")

    if ($WhatIf) {
        Write-Host "  [WhatIf] Would prompt to execute: $displayCmd" -ForegroundColor Magenta
        continue
    }

    Write-Host ""
    $response = Read-Host "Deploy $($fn.Name)? [Y = Deploy / N = Skip / Q = Quit]"
    $cleanResponse = $response.Trim().ToUpperInvariant()

    if ($cleanResponse -eq "Q") {
        Write-Host "Aborting edge function deployment by user request." -ForegroundColor Yellow
        break
    } elseif ($cleanResponse -eq "Y") {
        Write-Host "  [DEPLOYING] Executing: $displayCmd" -ForegroundColor Yellow
        # VERIFY ON FIRST RUN: function deployment command
        & supabase @cmdArgs
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Deployment of $($fn.Name) failed with exit code $LASTEXITCODE. Stopping sequence."
            exit $LASTEXITCODE
        }
        Write-Host "  [SUCCESS] $($fn.Name) deployed successfully." -ForegroundColor Green
    } else {
        Write-Host "  [SKIPPED] $($fn.Name) skipped by user." -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Edge functions deployer completed." -ForegroundColor Green
Write-Host "Next step: Run scripts/golive/30-smoke.ps1 to verify endpoints." -ForegroundColor Gray
