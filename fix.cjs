const fs = require('fs');
let c = fs.readFileSync('c:/Jouhayerk/git/app/src/features/core/MainAppView.tsx', 'utf8');
c = c.replace(/return\s*\(\s*<>\s*<LiquidOnyxFilters \/>\s*<>\s*<DataSyncProvider \/>/m, 'return (\n        <>\n            <LiquidOnyxFilters />\n            <DataSyncProvider />');
fs.writeFileSync('c:/Jouhayerk/git/app/src/features/core/MainAppView.tsx', c);
