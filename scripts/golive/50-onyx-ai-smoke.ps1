<#
.SYNOPSIS
  Smoke test for the live onyx-ai Edge Function (Gemini AI proxy).

.DESCRIPTION
  Run it AFTER the onyx-ai function is deployed and the GEMINI_API_KEY secret is set.
  Run in Windows PowerShell 5.1 (GetResponseStream is not available in PowerShell 7).
  It needs one environment variable, ONYX_TEST_JWT: a current access token of YOUR Onyx login
  (get it in the app tab: DevTools console, then
     JSON.parse(localStorage.getItem('sb-yircifkayqpuydfdqzlm-auth-token')).access_token
  and set it with   $env:ONYX_TEST_JWT = "<paste>"   in the same PowerShell window; it lasts about an hour).

  What it never does: write a token to disk, print a token, or incur high token usage.
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Prop($o, $n) { if ($null -ne $o -and $o.PSObject.Properties[$n]) { return $o.$n } return $null }

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

Write-Host "`n== onyx-ai (Gemini AI proxy) ==" -ForegroundColor Cyan

# 1. Unauthenticated request without a token (must be refused with 401)
$r = Call "POST" "$base/onyx-ai" $null @{ messages = @( @{ role = "user"; parts = @( @{ text = "ping" } ) } ) }
Record ($r.Code -eq 401) "onyx-ai refuses a call without a token" ("HTTP {0}" -f $r.Code)

# 2. Non-POST method (must be refused with 405)
$r = Call "GET" "$base/onyx-ai" $jwt $null
Record ($r.Code -eq 405) "onyx-ai GET method is refused" ("HTTP {0}" -f $r.Code)

# 3. Missing messages parameter (must be rejected with 400)
$r = Call "POST" "$base/onyx-ai" $jwt @{ model = "gemini-2.5-flash" }
$err3 = Prop (Prop $r.Json "error") "message"
Record ($r.Code -eq 400 -and $null -ne $err3 -and $err3 -like "*Missing messages*") "onyx-ai rejects missing messages" ("HTTP {0}, msg: {1}" -f $r.Code, $(if ($null -ne $err3) { $err3 } else { "none" }))

# 4. Unapproved model parameter (must be rejected with 400)
$r = Call "POST" "$base/onyx-ai" $jwt @{ messages = @( @{ role = "user"; parts = @( @{ text = "ping" } ) } ); model = "unapproved-model-test" }
$err4 = Prop (Prop $r.Json "error") "message"
Record ($r.Code -eq 400 -and $null -ne $err4 -and $err4 -like "*Model not allowed*") "onyx-ai rejects unapproved model" ("HTTP {0}, msg: {1}" -f $r.Code, $(if ($null -ne $err4) { $err4 } else { "none" }))

# 5. Oversized payload (> 200 KB) must return 413
$bigText = "X" * (205 * 1024)
$r = Call "POST" "$base/onyx-ai" $jwt @{ messages = @( @{ role = "user"; parts = @( @{ text = $bigText } ) } ) }
$err5 = Prop (Prop $r.Json "error") "message"
Record ($r.Code -eq 413 -and $null -ne $err5 -and $err5 -like "*Payload too large*") "onyx-ai refuses oversized payload (>200KB)" ("HTTP {0}, msg: {1}" -f $r.Code, $(if ($null -ne $err5) { $err5 } else { "none" }))

# 6. Authorised cheap call with tiny prompt and valid model, verifying response shape
$r = Call "POST" "$base/onyx-ai" $jwt @{ messages = @( @{ role = "user"; parts = @( @{ text = "Say OK" } ) } ); model = "gemini-2.5-flash" }
if ($r.Code -eq 403) {
    Write-Host "      [Note] Caller was rejected with 403 Forbidden. Verify caller role in app_users is Developer, Admin, or ClientBoss." -ForegroundColor Yellow
}
$cfgErr = Prop (Prop $r.Json "error") "message"
if ($r.Code -eq 500 -and $null -ne $cfgErr -and $cfgErr -like "*Server configuration error*") {
    Write-Host "      [Note] Server configuration error: Check that GEMINI_API_KEY secret is set in Supabase." -ForegroundColor Yellow
}

$candidates = Prop $r.Json "candidates"
$hasCandidates = ($null -ne $candidates -and @($candidates).Count -gt 0)
$firstCandidate = if ($hasCandidates) { @($candidates)[0] } else { $null }
$content = Prop $firstCandidate "content"
$parts = Prop $content "parts"
$firstPart = if ($null -ne $parts -and @($parts).Count -gt 0) { @($parts)[0] } else { $null }
$responseText = if ($null -ne $firstPart) { [string](Prop $firstPart "text") } else { "" }
Record ($r.Code -eq 200 -and $hasCandidates) "onyx-ai tiny prompt and response shape" ("HTTP {0}, reply: {1}" -f $r.Code, (Short $responseText))

Write-Host "`n== Summary ==" -ForegroundColor Cyan
$fails = @($results | Where-Object { $_.StartsWith("FAIL") })
Write-Host ("{0} checks, {1} failed" -f $results.Count, $fails.Count)
if ($fails.Count -gt 0) { $fails | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }; exit 1 }
Write-Host "All checks passed." -ForegroundColor Green
