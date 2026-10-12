#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const candidates = [
    path.resolve(__dirname, '..', 'supabase', 'migrations', '20261012000000_item_embeddings.sql'),
    path.resolve(process.cwd(), 'supabase', 'migrations', '20261012000000_item_embeddings.sql')
];

let targetPath = null;
for (const cand of candidates) {
    if (fs.existsSync(cand)) {
        targetPath = cand;
        break;
    }
}

if (!targetPath) {
    console.error('FAIL: Migration file not found. Looked in:');
    candidates.forEach((c) => console.error(`  - ${c}`));
    process.exit(1);
}

const sql = fs.readFileSync(targetPath, 'utf8');

const requiredChecks = [
    { name: 'create extension if not exists vector', regex: /create\s+extension\s+if\s+not\s+exists\s+vector/i },
    { name: 'vector(768)', regex: /vector\s*\(\s*768\s*\)/i },
    { name: 'hnsw', regex: /hnsw/i },
    { name: 'vector_cosine_ops', regex: /vector_cosine_ops/i },
    { name: 'enable row level security', regex: /enable\s+row\s+level\s+security/i },
    { name: 'create policy (read)', regex: /create\s+policy\s+["']?[^"'\n]*read[^"'\n]*["']?/i },
    { name: 'create policy (write)', regex: /create\s+policy\s+["']?[^"'\n]*write[^"'\n]*["']?/i },
    { name: 'function name (match_item_embeddings)', regex: /\bmatch_item_embeddings\b/i },
    { name: 'security invoker', regex: /security\s+invoker/i },
    { name: 'on delete cascade', regex: /on\s+delete\s+cascade/i }
];

const prohibitedChecks = [
    { name: 'drop table', regex: /\bdrop\s+table\b/i },
    { name: 'drop column', regex: /\bdrop\s+column\b/i },
    { name: 'truncate', regex: /\btruncate\b/i },
    { name: 'delete from', regex: /\bdelete\s+from\b/i },
    { name: 'alter table items', regex: /\balter\s+table\s+items\b/i }
];

let failed = false;

for (const check of requiredChecks) {
    if (!check.regex.test(sql)) {
        console.error(`FAIL: Missing required pattern: ${check.name}`);
        failed = true;
    }
}

for (const check of prohibitedChecks) {
    if (check.regex.test(sql)) {
        console.error(`FAIL: Contains prohibited pattern: ${check.name}`);
        failed = true;
    }
}

if (failed) {
    console.error('sql checks failed');
    process.exit(1);
}

console.log('sql checks passed');
process.exit(0);
