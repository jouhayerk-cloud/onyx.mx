const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;
const BRAIN_PATH = 'C:/Users/ramse/.gemini/antigravity/brain';

app.use(cors());

// Helper to find metadata files
function getMetadata(dirPath) {
    const files = fs.readdirSync(dirPath);
    return files.filter(f => f.endsWith('.metadata.json')).map(f => {
        const content = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf8'));
        return {
            fileName: f.replace('.metadata.json', ''),
            type: content.artifactType,
            summary: content.summary,
            updatedAt: content.updatedAt
        };
    });
}

// Main mining logic
function mineData() {
    const data = {
        nodes: [],
        links: []
    };

    if (!fs.existsSync(BRAIN_PATH)) {
        console.error('Brain path does not exist:', BRAIN_PATH);
        return data;
    }

    const conversations = fs.readdirSync(BRAIN_PATH).filter(f => {
        return fs.statSync(path.join(BRAIN_PATH, f)).isDirectory() && f !== 'tempmediaStorage';
    });

    conversations.forEach(uuid => {
        const fullPath = path.join(BRAIN_PATH, uuid);
        
        // Add Conversation Node
        data.nodes.push({
            id: uuid,
            label: `Conversation ${uuid.substring(0, 8)}`,
            group: 'conversation',
            color: '#00f2ff' // Cyan
        });

        // Add Artifacts
        try {
            const artifacts = getMetadata(fullPath);
            artifacts.forEach(art => {
                const artId = `${uuid}-${art.fileName}`;
                data.nodes.push({
                    id: artId,
                    label: art.fileName,
                    type: art.type,
                    summary: art.summary,
                    group: 'artifact',
                    color: '#ff00ea' // Magenta
                });
                data.links.push({
                    source: uuid,
                    target: artId,
                    value: 2
                });
            });

            // Add Media
            const mediaFiles = fs.readdirSync(fullPath).filter(f => /\.(png|webp|jpg)$/i.test(f));
            mediaFiles.forEach(media => {
                const mediaId = `${uuid}-${media}`;
                data.nodes.push({
                    id: mediaId,
                    label: media,
                    group: 'media',
                    color: '#00ff41' // Neon Green
                });
                data.links.push({
                    source: uuid,
                    target: mediaId,
                    value: 1
                });
            });
        } catch (e) {
            console.warn(`Could not read data for ${uuid}:`, e.message);
        }
    });

    return data;
}

app.get('/api/brain', (req, res) => {
    try {
        const data = mineData();
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`OnyxBrain Data Miner running at http://localhost:${PORT}`);
    console.log(`Scanning: ${BRAIN_PATH}`);
});
