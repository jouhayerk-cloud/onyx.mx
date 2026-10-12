#!/usr/bin/env node
/**
 * scripts/check-ios-ops.cjs
 *
 * Operational verification script for Onyx.mx iOS Companion operations:
 * 1. Asserts .github/workflows/ios-companion.yml contains required build steps and zero secrets.
 * 2. Parses scripts/ios/weekly-refresh.ps1 with [scriptblock]::Create to verify syntax.
 * 3. Asserts docs/IOS_COMPANION.md contains both English and Spanish operational guides.
 * 4. Prints "ios ops checks passed" on success.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const workflowPath = path.join(rootDir, '.github', 'workflows', 'ios-companion.yml');
const psScriptPath = path.join(rootDir, 'scripts', 'ios', 'weekly-refresh.ps1');
const docPath = path.join(rootDir, 'docs', 'IOS_COMPANION.md');

function fail(message) {
    console.error(`\x1b[31m[FAIL]\x1b[0m ${message}`);
    process.exit(1);
}

// ---------------------------------------------------------------------------
// 1. Assert Workflow File Content and Secret Freedom
// ---------------------------------------------------------------------------
if (!fs.existsSync(workflowPath)) {
    fail(`Workflow file missing: ${workflowPath}`);
}

const workflowContent = fs.readFileSync(workflowPath, 'utf8');

const requiredWorkflowTokens = [
    'runs-on',
    'xcodegen',
    'xcodebuild archive',
    'CODE_SIGNING_ALLOWED=NO',
    'Payload',
    'upload-artifact'
];

for (const token of requiredWorkflowTokens) {
    if (!workflowContent.includes(token)) {
        fail(`Workflow file missing required token: "${token}"`);
    }
}

// Check that workflow has NO secrets referenced
const forbiddenSecretPatterns = [
    /\$\{\{\s*secrets\./i,
    /secrets\.[A-Za-z0-9_]+/i,
    /GITHUB_TOKEN/i,
    /P12_BASE64/i,
    /PROVISIONING_PROFILE_BASE64/i
];

for (const pattern of forbiddenSecretPatterns) {
    if (pattern.test(workflowContent)) {
        fail(`Workflow file references secrets or credentials matching pattern: ${pattern}`);
    }
}

// ---------------------------------------------------------------------------
// 2. Parse PowerShell Script with [scriptblock]::Create
// ---------------------------------------------------------------------------
if (!fs.existsSync(psScriptPath)) {
    fail(`PowerShell script missing: ${psScriptPath}`);
}

try {
    const escapedPsPath = psScriptPath.replace(/'/g, "''");
    // Verify syntax using PowerShell's native ScriptBlock parser
    const psCommand = `powershell -NoProfile -NonInteractive -Command "[scriptblock]::Create((Get-Content -Raw -LiteralPath '${escapedPsPath}')) | Out-Null"`;
    execSync(psCommand, { stdio: 'pipe' });
} catch (err) {
    fail(`PowerShell script syntax validation failed via [scriptblock]::Create: ${err.message}`);
}

// ---------------------------------------------------------------------------
// 3. Verify Runbook Documentation (English + Spanish Mexican)
// ---------------------------------------------------------------------------
if (!fs.existsSync(docPath)) {
    fail(`Documentation runbook missing: ${docPath}`);
}

const docContent = fs.readFileSync(docPath, 'utf8');

const englishKeywords = [
    'System Overview',
    'One-Time Setup',
    'Weekly Routine',
    'Troubleshooting',
    '485 MB'
];

const spanishKeywords = [
    'Resumen del Sistema',
    'Configuración Inicial',
    'Rutina Semanal',
    'Solución de Problemas',
    '485 MB'
];

for (const kw of englishKeywords) {
    if (!docContent.includes(kw)) {
        fail(`Documentation missing required English section keyword: "${kw}"`);
    }
}

for (const kw of spanishKeywords) {
    if (!docContent.includes(kw)) {
        fail(`Documentation missing required Spanish section keyword: "${kw}"`);
    }
}

// All checks passed
console.log("ios ops checks passed");
process.exit(0);
