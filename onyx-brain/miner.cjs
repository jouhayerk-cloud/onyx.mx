const fs = require('fs');
const path = require('path');

const BRAIN_PATH = 'C:/Users/ramse/.gemini/antigravity/brain';
const OUTPUT_FILE = path.join(__dirname, 'brain_data.json');

console.log('--- OnyxBrain Data Miner ---');
console.log(`Scanning: ${BRAIN_PATH}`);

function getMetadata(dirPath) {
    if (!fs.existsSync(dirPath)) return [];
    try {
        const files = fs.readdirSync(dirPath);
        return files.filter(f => f.endsWith('.metadata.json')).map(f => {
            try {
                const meta = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
                const fileName = f.replace('.metadata.json', '');
                const filePath = path.join(dirPath, fileName);
                
                let content = '';
                if (fs.existsSync(filePath) && /\.(md|txt|jsx|tsx|js|ts|py|go|rs|css|html)$/i.test(fileName)) {
                    content = fs.readFileSync(filePath, 'utf8').substring(0, 500) + '...';
                }

                return {
                    fileName: fileName,
                    type: meta.artifactType || 'OTHER',
                    summary: meta.summary || 'No summary available.',
                    content: content,
                    updatedAt: meta.updatedAt
                };
            } catch (e) { return null; }
        }).filter(x => x !== null);
    } catch (e) { return []; }
}

const CONV_PATH = 'C:/Users/ramse/.gemini/antigravity/conversations';

function extractKeywords(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        const buffer = fs.readFileSync(filePath);
        // Extract ASCII strings (heuristic) - refined to 5+ chars to reduce noise
        const strings = buffer.toString('ascii').match(/[a-zA-Z]{5,}/g) || [];
        // Filter common noise and keep unique keywords
        const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'been', 'will', 'they', 'into', 'there', 'their', 'which', 'about', 'would', 'could', 'should']);
        const keywords = [...new Set(strings.map(s => s.toLowerCase()))]
            .filter(s => {
                // Ignore strings with too many repeated characters (noise)
                const uniqueChars = new Set(s).size;
                return s.length > 5 && uniqueChars > 3 && !stopWords.has(s);
            })
            .slice(0, 30); // Limit to top 30 unique keywords per file
        return keywords;
    } catch (e) { return []; }
}

function classify(keywords) {
    const kStr = keywords.join(' ').toLowerCase();
    if (/supabase|sql|db|schema|rls|database/i.test(kStr)) return 'DATABASE';
    if (/react|vite|typescript|node|build|config|env/i.test(kStr)) return 'CODEBASE';
    if (/logistics|finance|inventory|sales|overview/i.test(kStr)) return 'COMPONENTS';
    if (/sidebar|header|modal|button|grid|table/i.test(kStr)) return 'ELEMENTS';
    return 'GENERAL';
}

function mine() {
    const data = { nodes: [], links: [] };
    if (!fs.existsSync(BRAIN_PATH)) {
        console.error('Error: Brain folder not found.');
        return;
    }

    const folders = fs.readdirSync(BRAIN_PATH).filter(f => {
        return fs.statSync(path.join(BRAIN_PATH, f)).isDirectory() && f !== 'tempmediaStorage';
    });

    console.log(`Found ${folders.length} conversations.`);

    // --- STEP 1: Global Keyword Frequency ---
    const globalKeywords = {};
    const sessionData = folders.map(uuid => {
        const pbPath = path.join(CONV_PATH, `${uuid}.pb`);
        const keywords = extractKeywords(pbPath);
        keywords.forEach(kw => { globalKeywords[kw] = (globalKeywords[kw] || 0) + 1; });
        return { uuid, keywords };
    });

    // Pick top 15 keywords for clustering
    const topKeywords = Object.entries(globalKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(e => e[0]);

    topKeywords.forEach(kw => {
        data.nodes.push({
            id: `kw-${kw}`,
            label: kw.toUpperCase(),
            group: 'keyword',
            val: 0.1 // Virtually invisible but acts as a force center
        });
    });

    // --- STEP 2: Media Discovery (Sorted by Date) ---
    const allMedia = [];
    folders.forEach(uuid => {
        const fullPath = path.join(BRAIN_PATH, uuid);
        try {
            fs.readdirSync(fullPath).filter(f => /\.(png|webp|jpg)$/i.test(f)).forEach(f => {
                const mPath = path.join(fullPath, f);
                const stats = fs.statSync(mPath);
                allMedia.push({ uuid, fileName: f, path: mPath, mtime: stats.mtime });
            });
        } catch(e) {}
    });
    // Sort by most recent
    const latestMedia = allMedia.sort((a, b) => b.mtime - a.mtime).slice(0, 30);

    // --- STEP 3: Main Processing ---
    sessionData.forEach(({ uuid, keywords }) => {
        const fullPath = path.join(BRAIN_PATH, uuid);
        const category = classify(keywords);

        // Conv Node
        data.nodes.push({
            id: uuid,
            label: `Session ${uuid.substring(0, 6)}`,
            group: 'conversation',
            keywords: keywords,
            category: category,
            val: 5
        });

        // Link to top keywords for clustering
        keywords.forEach(kw => {
            if (topKeywords.includes(kw)) {
                data.links.push({ source: uuid, target: `kw-${kw}`, value: 1 });
            }
        });

        const artifacts = getMetadata(fullPath);
        artifacts.forEach(art => {
            const artId = `${uuid}-${art.fileName}`;
            data.nodes.push({
                id: artId,
                label: art.fileName,
                summary: art.summary,
                content: art.content,
                group: 'artifact',
                type: art.type,
                val: 1.5
            });
            data.links.push({ source: uuid, target: artId, value: 5 });
        });

        const media = fs.readdirSync(fullPath).filter(f => /\.(png|webp|jpg)$/i.test(f));
        media.forEach(m => {
            const mId = `${uuid}-${m}`;
            const mPath = path.join(fullPath, m);
            
            let b64 = null;
            // Only embed if this media is in our "Latest 30" list
            if (latestMedia.find(lm => lm.path === mPath)) {
                try {
                    const stats = fs.statSync(mPath);
                    if (stats.size < 1500000) { // Limit to < 1.5MB
                        b64 = `data:image/${path.extname(m).slice(1)};base64,` + fs.readFileSync(mPath).toString('base64');
                    }
                } catch (e) {}
            }

            data.nodes.push({
                id: mId,
                label: m,
                group: 'media',
                img: b64,
                val: 2
            });
            data.links.push({ source: uuid, target: mId });
        });
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
    
    // ZERO-DEPENDENCY INJECTION: Create a standalone HTML with data baked in
    try {
        const viewerPath = path.join(__dirname, 'OnyxBrain_Viewer.html');
        const liveViewerPath = path.join(__dirname, 'OnyxBrain_Visualizer_LIVE.html');
        if (fs.existsSync(viewerPath)) {
            let html = fs.readFileSync(viewerPath, 'utf8');
            // Inject data into a global window variable
            const dataString = JSON.stringify(data);
            html = html.replace('// DATA_INJECTION_POINT', `window.ONYX_DATA = ${dataString};`);
            fs.writeFileSync(liveViewerPath, html);
            console.log(`\n✨ STANDALONE READY: ${liveViewerPath}`);
        }
    } catch (e) {
        console.warn('Could not generate standalone visualizer:', e.message);
    }

    console.log(`Success! Data extracted with keywords to: ${OUTPUT_FILE}`);
    
    startServer();
}

function startServer() {
    try {
        const express = require('express');
        const app = express();
        const PORT = 3000;
        app.use(express.static(__dirname));
        app.listen(PORT, () => {
            console.log('\n--- OnyxBrain Live ---');
            console.log(`Open in Browser: http://localhost:${PORT}/OnyxBrain_Visualizer_LIVE.html`);
            console.log('Press Ctrl+C to stop the server.');
        });
    } catch (e) {
        console.warn('\nNote: "express" is not installed. To launch the auto-server, run: npm install express');
        console.log(`Manual View: Open ${path.join(__dirname, 'OnyxBrain_Visualizer_LIVE.html')} in any browser.`);
    }
}

mine();
