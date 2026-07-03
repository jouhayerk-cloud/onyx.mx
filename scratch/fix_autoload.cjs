const fs = require('fs');
const path = require('path');
const p = path.resolve('public/phomemo-designer/index.html');
let content = fs.readFileSync(p, 'utf8');

const regex = /\s*\/\/\s*Load from localStorage if data was pre-populated[\s\S]*?const raw = localStorage\.getItem\('onyx_packing_batch'\);[\s\S]*?if \(raw\) \{[\s\S]*?try \{[\s\S]*?\/\/ Delay to let the designer fully initialize first[\s\S]*?fallbackTimer = setTimeout\(\(\) => handleOnyxData\(JSON\.parse\(raw\)\), 800\);[\s\S]*?\} catch\(e\) \{ console\.warn\('OnyxLabels: failed to parse batch', e\); \}[\s\S]*?\}/;

if (content.match(regex)) {
    content = content.replace(regex, '');
    fs.writeFileSync(p, content, 'utf8');
    console.log('Successfully removed auto-load from index.html');
} else {
    console.log('Could not find the target codeblock.');
}
