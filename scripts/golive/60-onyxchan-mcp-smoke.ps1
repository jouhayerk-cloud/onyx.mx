<#
.SYNOPSIS
  Smoke test for the live onyxchan-mcp Edge Function.

.DESCRIPTION
  Run it AFTER the per-device tokens migration (20260830234500) is applied and
  onyxchan-mcp is deployed.
  Run in Windows PowerShell 5.1 (GetResponseStream is not available in PowerShell 7).

  Environment variables:
    - ONYX_TEST_JWT: Current access token of your Onyx staff login (required).
      Retrieve from browser DevTools Console while logged into the app:
        JSON.parse(localStorage.getItem('sb-yircifkayqpuydfdqzlm-auth-token')).access_token
      and set in PowerShell:
        $env:ONYX_TEST_JWT = "<paste>"
    - ONYXCHAN_TEST_DEVICE_TOKEN: Optional raw hardware device token (ocd_...).
      If set, exercises device-role tool restrictions, allowed tools, and heartbeat.

  Safety:
    Never writes tokens to disk, never prints raw tokens to console, and makes
    read-only tool calls, except the optional device heartbeat, which updates that device's telemetry row (battery, rssi, last_seen, status).
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Prop($o, $n) { if ($null -ne $o -and $o.PSObject.Properties[$n]) { return $o.$n } return $null }

$ref  = "yircifkayqpuydfdqzlm"
$base = "https://$ref.supabase.co/functions/v1"

$jwt = $env:ONYX_TEST_JWT
if (-not $jwt) {
    Write-Host "Set ONYX_TEST_JWT first (see the header of this script)." -ForegroundColor Red
    exit 1
}

$devToken = $env:ONYXCHAN_TEST_DEVICE_TOKEN

$results = New-Object System.Collections.Generic.List[string]

function Record($ok, $name, $detail) {
    $mark = if ($ok) { "PASS" } else { "FAIL" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host ("[{0}] {1}  {2}" -f $mark, $name, $detail) -ForegroundColor $color
    $script:results.Add(("{0} {1}" -f $mark, $name))
}

function Call($method, $url, $token, $bodyObj) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $reqArgs = @{ Uri = $url; Method = $method; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $bodyObj) { $reqArgs["Body"] = ($bodyObj | ConvertTo-Json -Depth 8 -Compress) }
    try {
        $r = Invoke-WebRequest @reqArgs
        $code = [int]$r.StatusCode
        $text = $r.Content
    } catch {
        $resp = $_.Exception.Response
        if ($null -eq $resp) { return @{ Code = 0; Json = $null; Text = $_.Exception.Message } }
        $code = [int]$resp.StatusCode
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $text = $reader.ReadToEnd()
    }
    $json = $null
    try { $json = $text | ConvertFrom-Json } catch { }
    return @{ Code = $code; Json = $json; Text = $text }
}

function Short($s) {
    if ($null -eq $s) { return "" }
    $t = [string]$s
    if ($t.Length -gt 110) { return $t.Substring(0, 110) + "..." } else { return $t }
}

Write-Host "`n== onyxchan-mcp: Service Banner & Refusal Paths ==" -ForegroundColor Cyan

# 1. Unauthenticated GET banner
$r = Call "GET" "$base/onyxchan-mcp" $null $null
Record ($r.Code -eq 200 -and $r.Text.Contains("OnyxChan MCP Edge Function")) "onyxchan-mcp active banner" ("HTTP {0}" -f $r.Code)

# 2. Refusal without token on /rpc
$r = Call "POST" "$base/onyxchan-mcp/rpc" $null @{ tool = "resolve_tag"; args = @{ tag = "test" } }
$err2 = Prop $r.Json "error"
Record ($r.Code -eq 401 -and $err2 -eq "Missing bearer token") "refuses POST /rpc without token" ("HTTP {0}, error: {1}" -f $r.Code, (Short $err2))

# 3. Refusal without token on /heartbeat
$r = Call "POST" "$base/onyxchan-mcp/heartbeat" $null @{ battery = 90; rssi = -50 }
$err3 = Prop $r.Json "error"
Record ($r.Code -eq 401 -and $err3 -eq "Missing bearer token") "refuses POST /heartbeat without token" ("HTTP {0}, error: {1}" -f $r.Code, (Short $err3))

# 4. Refusal with bogus device token
$bogusDevToken = "ocd_" + ("0" * 64)
$r = Call "POST" "$base/onyxchan-mcp/rpc" $bogusDevToken @{ tool = "resolve_tag"; args = @{ tag = "test" } }
$err4a = Prop $r.Json "error"
Record ($r.Code -eq 401 -and $err4a -eq "Invalid or revoked device token") "refuses bogus device token on /rpc" ("HTTP {0}, error: {1}" -f $r.Code, (Short $err4a))

$r = Call "POST" "$base/onyxchan-mcp/heartbeat" $bogusDevToken @{ battery = 90; rssi = -50 }
$err4b = Prop $r.Json "error"
Record ($r.Code -eq 401 -and $err4b -eq "Invalid or revoked device token") "refuses bogus device token on /heartbeat" ("HTTP {0}, error: {1}" -f $r.Code, (Short $err4b))

# 5. Refusal with bogus staff JWT
$bogusJwt = "invalid.jwt.token"
$r = Call "POST" "$base/onyxchan-mcp/rpc" $bogusJwt @{ tool = "resolve_tag"; args = @{ tag = "test" } }
$err5 = Prop $r.Json "error"
Record ($r.Code -eq 401 -and $err5 -eq "Invalid or expired token") "refuses bogus staff JWT" ("HTTP {0}, error: {1}" -f $r.Code, (Short $err5))

# 6. Optional Device Token Paths
if ($devToken) {
    Write-Host "`n== onyxchan-mcp: Hardware Device Token Live Checks ==" -ForegroundColor Cyan

    # Device token attempting forbidden staff tool (query_inventory)
    $r = Call "POST" "$base/onyxchan-mcp/rpc" $devToken @{ tool = "query_inventory"; args = @{} }
    $devErr = Prop $r.Json "error"
    $blocked = ($r.Code -eq 403 -and $null -ne $devErr -and [string]$devErr -like "*Device tokens may not call*")
    Record $blocked "device token forbidden tool refusal" ("HTTP {0}, error: {1}" -f $r.Code, (Short $devErr))

    # Device token executing allowed read-only tool (resolve_tag)
    $r = Call "POST" "$base/onyxchan-mcp/rpc" $devToken @{ tool = "resolve_tag"; args = @{ tag = "smoke-test-tag" } }
    $hasContent = $null -ne (Prop $r.Json "content")
    Record ($r.Code -eq 200 -and $hasContent) "device token allowed tool resolve_tag" ("HTTP {0}, result: {1}" -f $r.Code, (Short $r.Text))

    # Device token reporting heartbeat
    $r = Call "POST" "$base/onyxchan-mcp/heartbeat" $devToken @{ battery = 92; rssi = -48 }
    $devStatus = Prop $r.Json "status"
    $devId = Prop $r.Json "device_id"
    Record ($r.Code -eq 200 -and $devStatus -eq "ok") "device token heartbeat" ("HTTP {0}, status: {1}, device_id: {2}" -f $r.Code, $devStatus, $devId)
} else {
    Write-Host "`nNotice: ONYXCHAN_TEST_DEVICE_TOKEN not provided; skipping hardware device live checks." -ForegroundColor Yellow
}

# 7. Staff JWT Checks
Write-Host "`n== onyxchan-mcp: Staff JWT Checks ==" -ForegroundColor Cyan

# Staff listing tools via JSON-RPC
$r = Call "POST" "$base/onyxchan-mcp/rpc" $jwt @{ jsonrpc = "2.0"; id = 1; method = "tools/list" }
$rpcResult = Prop $r.Json "result"
$rpcTools = Prop $rpcResult "tools"
$toolCount = if ($null -ne $rpcTools) { @($rpcTools).Count } else { 0 }
Record ($r.Code -eq 200 -and $toolCount -gt 0) "staff tools/list" ("HTTP {0}, {1} tools available" -f $r.Code, $toolCount)

# Staff executing read-only tool (count_vendor_items)
$r = Call "POST" "$base/onyxchan-mcp/rpc" $jwt @{ tool = "count_vendor_items"; args = @{ vendor_id = "EM" } }
Record ($r.Code -eq 200 -and $null -eq (Prop $r.Json "isError")) "staff read-only tool count_vendor_items" ("HTTP {0}, result: {1}" -f $r.Code, (Short $r.Text))

Write-Host "`n== Summary ==" -ForegroundColor Cyan
$fails = @($results | Where-Object { $_.StartsWith("FAIL") })
Write-Host ("{0} checks, {1} failed" -f $results.Count, $fails.Count)
if ($fails.Count -gt 0) {
    $fails | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}
Write-Host "All checks passed." -ForegroundColor Green
