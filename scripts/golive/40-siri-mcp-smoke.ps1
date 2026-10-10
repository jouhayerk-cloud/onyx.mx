<#
.SYNOPSIS
  Smoke test for the live onyx-mcp, siri-token and siri-inventory functions.

.DESCRIPTION
  Run it AFTER the siri_tokens migration is applied and the three functions are deployed.
  It needs one environment variable, ONYX_TEST_JWT: a current access token of YOUR Onyx login
  (get it in the app tab: DevTools console, then
     JSON.parse(localStorage.getItem('sb-yircifkayqpuydfdqzlm-auth-token')).access_token
  and set it with   $env:ONYX_TEST_JWT = "<paste>"   in the same PowerShell window; it lasts about an hour).

  What it never does: write a token to disk, print a full token, change data other than creating
  and revoking one test Siri token labelled "smoke-test".
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ref  = "yircifkayqpuydfdqzlm"
$base = "https://$ref.supabase.co/functions/v1"
$jwt  = $env:ONYX_TEST_JWT
if (-not $jwt) { Write-Host "Set ONYX_TEST_JWT first (see the header of this script)." -ForegroundColor Red; exit 1 }

$results = New-Object System.Collections.Generic.List[string]
function Record($ok, $name, $detail) {
    $mark = if ($ok) { "PASS" } else { "FAIL" }
    $color = if ($ok) { "Green" } else { "Red" }
    Write-Host ("[{0}] {1}  {2}" -f $mark, $name, $detail) -ForegroundColor $color
    $script:results.Add(("{0} {1}" -f $mark, $name))
}

# Calls a URL and returns the status code and the parsed JSON body (never throws on 4xx or 5xx).
function Call($method, $url, $token, $bodyObj) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $args = @{ Uri = $url; Method = $method; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $bodyObj) { $args["Body"] = ($bodyObj | ConvertTo-Json -Depth 8 -Compress) }
    try {
        $r = Invoke-WebRequest @args
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
function Short($s) { if ($null -eq $s) { return "" }; $t = [string]$s; if ($t.Length -gt 110) { return $t.Substring(0, 110) + "..." } else { return $t } }

Write-Host "`n== onyx-mcp (data MCP server) ==" -ForegroundColor Cyan
$r = Call "GET" "$base/onyx-mcp/health" $jwt $null
Record ($r.Code -eq 200 -and $r.Json.status -eq "ok") "onyx-mcp health" ("HTTP {0}, tools_count {1}" -f $r.Code, $(if ($r.Json) { $r.Json.tools_count } else { "?" }))

$r = Call "POST" "$base/onyx-mcp" $jwt @{ jsonrpc = "2.0"; id = 1; method = "tools/list" }
$n = 0; if ($r.Json -and $r.Json.result -and $r.Json.result.tools) { $n = @($r.Json.result.tools).Count }
Record ($r.Code -eq 200 -and $n -gt 0) "onyx-mcp tools/list" ("HTTP {0}, {1} tools visible to your role" -f $r.Code, $n)

$r = Call "POST" "$base/onyx-mcp" $jwt @{ jsonrpc = "2.0"; id = 2; method = "tools/call"; params = @{ name = "inventory_count_by_status"; arguments = @{} } }
Record ($r.Code -eq 200 -and $null -ne $r.Json -and $null -eq $r.Json.error) "onyx-mcp inventory_count_by_status" (Short $r.Text)

$r = Call "POST" "$base/onyx-mcp" $null @{ jsonrpc = "2.0"; id = 3; method = "tools/list" }
Record ($r.Code -eq 401) "onyx-mcp refuses a call without a token" ("HTTP {0}" -f $r.Code)

Write-Host "`n== siri-token and siri-inventory ==" -ForegroundColor Cyan
$r = Call "POST" "$base/siri-token" $jwt @{ action = "list" }
Record ($r.Code -eq 200 -and $r.Json.ok -eq $true) "siri-token list" ("HTTP {0}, {1} token(s)" -f $r.Code, $(if ($r.Json -and $r.Json.tokens) { @($r.Json.tokens).Count } else { 0 }))

$r = Call "POST" "$base/siri-token" $jwt @{ action = "create"; label = "smoke-test" }
$siri = $null; $siriId = $null
if ($r.Code -eq 200 -and $r.Json.ok -eq $true) { $siri = $r.Json.token; $siriId = $r.Json.id }
Record ($null -ne $siri -and $siri.StartsWith("siri_") -and $siri.Length -eq 48) "siri-token create" ("HTTP {0}, prefix {1}" -f $r.Code, $(if ($siri) { $siri.Substring(0, 9) } else { "none" }))

$r = Call "GET" "$base/siri-inventory" $null $null
Record ($r.Code -eq 405) "siri-inventory GET is refused" ("HTTP {0}" -f $r.Code)
$r = Call "POST" "$base/siri-inventory" $null @{ intent = "count"; query = ""; lang = "en" }
Record ($r.Code -eq 401) "siri-inventory without a token" ("HTTP {0}" -f $r.Code)
$r = Call "POST" "$base/siri-inventory" ("siri_" + ("A" * 43)) @{ intent = "count"; query = ""; lang = "en" }
Record ($r.Code -eq 401) "siri-inventory with a made-up siri token" ("HTTP {0}" -f $r.Code)

if ($siri) {
    $r = Call "POST" "$base/siri-inventory" $siri @{ intent = "count"; query = ""; lang = "en" }
    Record ($r.Code -eq 200 -and $r.Json.ok -eq $true) "siri-inventory count (English)" (Short $r.Json.spoken_text)
    $r = Call "POST" "$base/siri-inventory" $siri @{ intent = "count"; query = ""; lang = "es" }
    Record ($r.Code -eq 200 -and $r.Json.ok -eq $true) "siri-inventory count (Spanish)" (Short $r.Json.spoken_text)
    $r = Call "POST" "$base/siri-inventory" $siri @{ intent = "search"; query = "canoe"; lang = "en" }
    Record ($r.Code -eq 200 -and $r.Json.ok -eq $true) "siri-inventory search canoe" (Short $r.Json.spoken_text)
    $r = Call "POST" "$base/siri-inventory" $siri @{ intent = "item"; query = "how much is the first canoe"; lang = "en" }
    Write-Host ("      money question answer (check by hand: amounts only for finance roles): " + (Short $r.Json.spoken_text)) -ForegroundColor Yellow
    Record ($r.Code -eq 200) "siri-inventory money question answered" ("HTTP {0}" -f $r.Code)

    $r = Call "POST" "$base/siri-token" $jwt @{ action = "revoke"; id = $siriId }
    Record ($r.Code -eq 200 -and $r.Json.ok -eq $true) "siri-token revoke" ("HTTP {0}" -f $r.Code)
    $r = Call "POST" "$base/siri-inventory" $siri @{ intent = "count"; query = ""; lang = "en" }
    Record ($r.Code -eq 401) "siri-inventory refuses the revoked token" ("HTTP {0}" -f $r.Code)
} else {
    Record $false "siri-inventory tests with a real token" "skipped: no token was created"
}

Write-Host "`n== Summary ==" -ForegroundColor Cyan
$fails = @($results | Where-Object { $_.StartsWith("FAIL") })
Write-Host ("{0} checks, {1} failed" -f $results.Count, $fails.Count)
if ($fails.Count -gt 0) { $fails | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }; exit 1 }
Write-Host "All checks passed." -ForegroundColor Green
