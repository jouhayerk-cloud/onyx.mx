const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/ramse/.gemini/antigravity/brain/5b702907-c4ef-4b9b-953e-606dbc64b7f3';
const paths = {
  talan: 'media__1775247405003.png',
  fluorite: 'media__1775247608628.png',
  nacar: 'media__1775247760233.png',
  aqua: 'media__1775247785196.png'
};

const hexData = {
  talan: { primary: "#0d0b0a", secondary: "#161210", accents: ["#b8860b", "#8da388"] },
  fluorite: { primary: "#1c0e3a", secondary: "#0a2a40", accents: ["#00e5ff", "#7c3aed"] },
  nacar: { primary: "#fdfaf2", secondary: "#f4f1de", accents: ["#c17e61", "#a3b18a"] },
  aqua: { primary: "#00bcd4", secondary: "#c17e61", accents: ["#fdfcf0", "#435159"] }
};

let output = '/* eslint-disable */\n// AUTO-GENERATED THEME ASSETS\n\nexport const THEME_ASSETS = {\n';

for (const [name, filename] of Object.entries(paths)) {
  const fullPath = path.join(ARTIFACT_DIR, filename);
  if (!fs.existsSync(fullPath)) {
    console.error(`Missing: ${fullPath}`);
    continue;
  }
  const base64 = fs.readFileSync(fullPath).toString('base64');
  const metadata = hexData[name];
  
  output += `  ${name}: {
    swatch: 'data:image/png;base64,${base64}',
    hexInfo: {
      primary: "${metadata.primary}",
      secondary: "${metadata.secondary}",
      accents: ${JSON.stringify(metadata.accents)}
    }
  },\n`;
}

output += '};\n';
fs.writeFileSync('src/lib/themes-assets.ts', output);
console.log('Successfully generated src/lib/themes-assets.ts');
