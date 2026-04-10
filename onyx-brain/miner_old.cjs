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
                const content = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
                return {
                    fileName: f.replace('.metadata.json', ''),
                    type: content.artifactType || 'OTHER',
                    summary: content.summary || 'No summary available.',
                    updatedAt: content.updatedAt
                };
            } catch (e) { return null; }
        }).filter(x => x !== null);
    } catch (e) { return []; }
}

const CONV_PATH = 'C:/Users/ramse/.gemini/antigravity/conversations';

const TAXONOMY = {
    DATABASE: ['supabase', 'sql', 'table', 'rls', 'schema', 'query', 'json', 'postg', 'db'],
    CODEBASE: ['react', 'typescript', 'tsx', 'vite', 'node', 'git', 'dev', 'build', 'lint', 'error'],
    COMPONENTS: ['logistics', 'inventory', 'finance', 'dashboard', 'threed', 'process', 'auth', 'core', 'catalog', 'control', 'create', 'market', 'store', 'upload', 'viewer', 'workbook'],
    ELEMENTS: ['header', 'sidebar', 'modal', 'button', 'overlay', 'map', 'graph', 'input', 'panel']
};

function classify(keywords) {
    const scores = { DATABASE: 0, CODEBASE: 0, COMPONENTS: 0, ELEMENTS: 0 };
    keywords.forEach(kw => {
        for (const [cat, terms] of Object.entries(TAXONOMY)) {
            if (terms.some(t => kw.includes(t))) {
                scores[cat]++;
            }
        }
    });
    // Return category with highest score, or 'GENERAL'
    const best = Object.entries(scores).reduce((a, b) => a[1] > b[1] ? a : b);
    return best[1] > 0 ? best[0] : 'GENERAL';
}

function extractKeywords(filePath) {
    if (!fs.existsSync(filePath)) return [];
    try {
        const buffer = fs.readFileSync(filePath);
        // Extract ASCII strings (heuristic)
        const strings = buffer.toString('ascii').match(/[a-zA-Z]{4,}/g) || [];
        // Filter common noise and keep unique keywords
        const stopWords = new Set(['this', 'that', 'with', 'from', 'your', 'have', 'been', 'will', 'they', 'into']);
        const keywords = [...new Set(strings.map(s => s.toLowerCase()))]
            .filter(s => s.length > 3 && !stopWords.has(s))
            .slice(0, 50); // Limit to top 50 unique keywords per file
        return keywords;
    } catch (e) { return []; }
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

    folders.forEach((uuid, idx) => {
        const fullPath = path.join(BRAIN_PATH, uuid);
        const pbPath = path.join(CONV_PATH, `${uuid}.pb`);
        
        const keywords = extractKeywords(pbPath);
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

        const artifacts = getMetadata(fullPath);
        artifacts.forEach(art => {
            const artId = `${uuid}-${art.fileName}`;
            data.nodes.push({
                id: artId,
                label: art.fileName,
                summary: art.summary,
                group: 'artifact',
                type: art.type,
                val: 3
            });
            data.links.push({ source: uuid, target: artId });
        });

        const media = fs.readdirSync(fullPath).filter(f => /\.(png|webp|jpg)$/i.test(f));
        media.forEach(m => {
            const mId = `${uuid}-${m}`;
            data.nodes.push({
                id: mId,
                label: m,
                group: 'media',
                val: 2
            });
            data.links.push({ source: uuid, target: mId });
        });
    });

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
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
            console.log(`Open in Browser: http://localhost:${PORT}/OnyxBrain_Viewer.html`);
            console.log('Press Ctrl+C to stop the server.');
        });
    } catch (e) {
        console.warn('\nNote: "express" is not installed. To launch the auto-server, run: npm install express');
        console.log(`Manual View: Open ${path.join(__dirname, 'OnyxBrain_Viewer.html')} in a browser with local-file-access enabled.`);
    }
}

mine();
