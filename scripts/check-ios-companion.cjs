/**
 * Static verification script for Onyx Companion iOS app.
 * Runs in plain Node.js with zero external dependencies.
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

const requiredFiles = [
  'ios/OnyxCompanion/project.yml',
  'ios/OnyxCompanion/Resources/Info.plist',
  'ios/OnyxCompanion/Sources/OnyxCompanionApp.swift',
  'ios/OnyxCompanion/Sources/WebContainer.swift',
  'ios/OnyxCompanion/Sources/OnyxEmbedBridge.swift',
  'ios/OnyxCompanion/Sources/OnyxChatBridge.swift',
  'ios/OnyxCompanion/Sources/ModelStore.swift',
  'ios/OnyxCompanion/README.md',
  'scripts/check-ios-companion.cjs'
];

// 1. Verify existence of all required files
for (const relPath of requiredFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`Error: Required file missing: ${relPath}`);
    process.exit(1);
  }
}

// 2. Helper to strip comments and string literals from Swift code
function stripSwiftCommentsAndStrings(source) {
  let cleaned = '';
  let i = 0;
  const len = source.length;

  while (i < len) {
    // Multi-line comment /* ... */
    if (source[i] === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        i++;
      }
      i += 2;
      continue;
    }

    // Single-line comment // ...
    if (source[i] === '/' && source[i + 1] === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Multi-line string """ ... """
    if (source.slice(i, i + 3) === '"""') {
      i += 3;
      while (i < len && source.slice(i, i + 3) !== '"""') {
        if (source[i] === '\\') {
          i += 2;
        } else {
          i++;
        }
      }
      i += 3;
      continue;
    }

    // Single-line string " ... "
    if (source[i] === '"') {
      i++;
      while (i < len && source[i] !== '"') {
        if (source[i] === '\\') {
          i += 2;
        } else if (source[i] === '\n') {
          break;
        } else {
          i++;
        }
      }
      i++;
      continue;
    }

    cleaned += source[i];
    i++;
  }

  return cleaned;
}

// 3. Verify brace and parenthesis balance in each Swift file
const swiftFiles = requiredFiles.filter(f => f.endsWith('.swift'));
for (const relPath of swiftFiles) {
  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const stripped = stripSwiftCommentsAndStrings(content);

  let openBrace = 0;
  let closeBrace = 0;
  let openParen = 0;
  let closeParen = 0;

  for (const char of stripped) {
    if (char === '{') openBrace++;
    if (char === '}') closeBrace++;
    if (char === '(') openParen++;
    if (char === ')') closeParen++;
  }

  if (openBrace !== closeBrace) {
    console.error(`Error: Unbalanced braces in ${relPath} (open: ${openBrace}, close: ${closeBrace})`);
    process.exit(1);
  }

  if (openParen !== closeParen) {
    console.error(`Error: Unbalanced parentheses in ${relPath} (open: ${openParen}, close: ${closeParen})`);
    process.exit(1);
  }
}

// 4. Verify OnyxEmbedBridge.swift contents
const bridgePath = path.join(rootDir, 'ios/OnyxCompanion/Sources/OnyxEmbedBridge.swift');
const bridgeContent = fs.readFileSync(bridgePath, 'utf8');

const bridgeRequiredStrings = [
  'onyxEmbed',
  'WKScriptMessageHandlerWithReply',
  'info',
  'embed',
  'embed_image',
  'embed_audio'
];

for (const req of bridgeRequiredStrings) {
  if (!bridgeContent.includes(req)) {
    console.error(`Error: OnyxEmbedBridge.swift missing required string: ${req}`);
    process.exit(1);
  }
}

// 5. Verify OnyxChatBridge.swift contents
const chatBridgePath = path.join(rootDir, 'ios/OnyxCompanion/Sources/OnyxChatBridge.swift');
const chatBridgeContent = fs.readFileSync(chatBridgePath, 'utf8');

const chatBridgeRequiredStrings = [
  'onyxChat',
  'WKScriptMessageHandlerWithReply',
  'info',
  'models_list',
  'chat_generate',
  'chat_stream',
  'chat_abort'
];

for (const req of chatBridgeRequiredStrings) {
  if (!chatBridgeContent.includes(req)) {
    console.error(`Error: OnyxChatBridge.swift missing required string: ${req}`);
    process.exit(1);
  }
}

// 6. Verify WebContainer.swift registers onyxEmbed and onyxChat
const webContainerPath = path.join(rootDir, 'ios/OnyxCompanion/Sources/WebContainer.swift');
const webContainerContent = fs.readFileSync(webContainerPath, 'utf8');

if (!webContainerContent.includes('onyxEmbed')) {
  console.error("Error: WebContainer.swift must register the name 'onyxEmbed'");
  process.exit(1);
}

if (!webContainerContent.includes('onyxChat')) {
  console.error("Error: WebContainer.swift must register the name 'onyxChat'");
  process.exit(1);
}

// 6. Verify Info.plist contains UIFileSharingEnabled and LSSupportsOpeningDocumentsInPlace
const plistPath = path.join(rootDir, 'ios/OnyxCompanion/Resources/Info.plist');
const plistContent = fs.readFileSync(plistPath, 'utf8');

if (!plistContent.includes('UIFileSharingEnabled')) {
  console.error('Error: Info.plist missing UIFileSharingEnabled');
  process.exit(1);
}

if (!plistContent.includes('LSSupportsOpeningDocumentsInPlace')) {
  console.error('Error: Info.plist missing LSSupportsOpeningDocumentsInPlace');
  process.exit(1);
}

// 7. Verify project.yml names LiteRT-LM URL and 0.18.0
const projectYmlPath = path.join(rootDir, 'ios/OnyxCompanion/project.yml');
const projectYmlContent = fs.readFileSync(projectYmlPath, 'utf8');

if (!projectYmlContent.includes('https://github.com/google-ai-edge/LiteRT-LM')) {
  console.error('Error: project.yml missing LiteRT-LM repository URL');
  process.exit(1);
}

if (!projectYmlContent.includes('0.18.0')) {
  console.error('Error: project.yml missing exact version 0.18.0');
  process.exit(1);
}

// 8. Verify no file contains hard-coded secret/token patterns
const secretPatterns = [
  /AIza[0-9A-Za-z\-_]{35}/,
  /sk-[0-9a-zA-Z]{20,}/,
  /ghp_[0-9a-zA-Z]{36}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/
];

for (const relPath of requiredFiles) {
  const fullPath = path.join(rootDir, relPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      console.error(`Error: Potential secret pattern matched in ${relPath}`);
      process.exit(1);
    }
  }
}

console.log('ios static checks passed');
process.exit(0);
