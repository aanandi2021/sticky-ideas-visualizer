#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
//  Sticky Ideas Visualizer — End-to-end pipeline
//  PDF → Image Extraction → AI/OCR Reading → Clustering → D3 Tree
// ═══════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ANSI colors
const C = {
    reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
    green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
    magenta: '\x1b[35m', cyan: '\x1b[36m', red: '\x1b[31m',
    bgBlue: '\x1b[44m', white: '\x1b[37m',
};

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }
function header(msg) { console.log(`\n${C.bold}${C.cyan}${msg}${C.reset}`); }
function success(msg) { log(`${C.green}✓${C.reset}`, msg); }
function warn(msg) { log(`${C.yellow}⚠${C.reset}`, msg); }
function info(msg) { log(`${C.blue}ℹ${C.reset}`, msg); }
function err(msg) { log(`${C.red}✗${C.reset}`, msg); }

// ═══════════════════════════════════════════════════════════════════
//  1. PROMPTS
// ═══════════════════════════════════════════════════════════════════
async function getInputs() {
    console.log(`\n${C.bold}${C.bgBlue}${C.white} 🎨 Sticky Ideas Visualizer ${C.reset}\n`);

    let pdfPath = await ask(`${C.cyan}📄 PDF file path: ${C.reset}`);
    pdfPath = pdfPath.trim().replace(/^["']|["']$/g, '');
    if (!path.isAbsolute(pdfPath)) pdfPath = path.resolve(process.cwd(), pdfPath);
    if (!fs.existsSync(pdfPath)) { err(`File not found: ${pdfPath}`); process.exit(1); }

    const title = (await ask(`${C.cyan}📝 Title for the visualization: ${C.reset}`)).trim() || 'Sticky Ideas';

    const defaultOut = path.join(path.dirname(pdfPath),
        path.basename(pdfPath, path.extname(pdfPath)) + '_visualization.html');
    let outPath = (await ask(`${C.cyan}📂 Output HTML path ${C.dim}[${path.basename(defaultOut)}]${C.reset}: `)).trim();
    outPath = outPath ? (path.isAbsolute(outPath) ? outPath : path.resolve(path.dirname(pdfPath), outPath)) : defaultOut;

    return { pdfPath, title, outPath };
}

// ═══════════════════════════════════════════════════════════════════
//  2. PDF → IMAGES
// ═══════════════════════════════════════════════════════════════════
async function extractImages(pdfPath) {
    header('📑 Extracting images from PDF...');
    const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
    const sharp = require('sharp');

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    const pageCount = doc.numPages;
    info(`${pageCount} pages detected`);

    const images = []; // { pageNum, buffer }
    const tmpDir = path.join(path.dirname(pdfPath), '.sticky-ideas-tmp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    for (let p = 1; p <= pageCount; p++) {
        const page = await doc.getPage(p);
        const ops = await page.getOperatorList();
        let extracted = false;

        for (let j = 0; j < ops.fnArray.length; j++) {
            if (ops.fnArray[j] === pdfjs.OPS.paintImageXObject) {
                const imgName = ops.argsArray[j][0];
                const img = await page.objs.get(imgName);
                if (!img || !img.data) continue;

                const w = img.width, h = img.height;
                const channels = Math.round(img.data.length / (w * h));
                const pngPath = path.join(tmpDir, `page_${String(p).padStart(3, '0')}.png`);

                await sharp(Buffer.from(img.data), { raw: { width: w, height: h, channels } })
                    .png().toFile(pngPath);

                images.push({ pageNum: p, path: pngPath, width: w, height: h });
                extracted = true;
                break;
            }
        }
        if (!extracted) warn(`Page ${p}: no image found`);
        process.stdout.write(`\r  ${C.dim}Progress: ${p}/${pageCount}${C.reset}`);
    }
    console.log('');
    success(`Extracted ${images.length} images`);
    return images;
}

// ═══════════════════════════════════════════════════════════════════
//  3. IMAGE → TEXT (AI Vision or local OCR)
// ═══════════════════════════════════════════════════════════════════
function detectProvider() {
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_KEY) return 'azure';
    return 'local';
}

async function readWithOpenAI(images) {
    header('🧠 Reading sticky notes with OpenAI GPT-4o Vision...');
    const apiKey = process.env.OPENAI_API_KEY;
    const ideas = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const b64 = fs.readFileSync(img.path).toString('base64');

        const body = {
            model: 'gpt-4o',
            max_tokens: 300,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Read this sticky note image. Return ONLY the title and a one-sentence description, separated by " — ". Example: "Smart Parking — Guide drivers to open spots using AI."' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'low' } }
                ]
            }]
        };

        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`OpenAI API error (${resp.status}): ${errText}`);
        }

        const json = await resp.json();
        const text = json.choices[0].message.content.trim();
        ideas.push(text);
        process.stdout.write(`\r  ${C.dim}Progress: ${i + 1}/${images.length}${C.reset}`);
    }
    console.log('');
    success(`Read ${ideas.length} sticky notes`);
    return ideas;
}

async function readWithAzure(images) {
    header('🧠 Reading sticky notes with Azure OpenAI Vision...');
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
    const apiKey = process.env.AZURE_OPENAI_KEY;
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
    const ideas = [];

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const b64 = fs.readFileSync(img.path).toString('base64');

        const body = {
            max_tokens: 300,
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: 'Read this sticky note image. Return ONLY the title and a one-sentence description, separated by " — ". Example: "Smart Parking — Guide drivers to open spots using AI."' },
                    { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}`, detail: 'low' } }
                ]
            }]
        };

        const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text();
            throw new Error(`Azure OpenAI error (${resp.status}): ${errText}`);
        }

        const json = await resp.json();
        const text = json.choices[0].message.content.trim();
        ideas.push(text);
        process.stdout.write(`\r  ${C.dim}Progress: ${i + 1}/${images.length}${C.reset}`);
    }
    console.log('');
    success(`Read ${ideas.length} sticky notes`);
    return ideas;
}

async function readWithOCR(images) {
    header('🔤 Reading sticky notes with local OCR (Tesseract.js)...');
    info('This may take a few minutes...');
    const Tesseract = require('tesseract.js');
    const worker = await Tesseract.createWorker('eng');
    const ideas = [];

    for (let i = 0; i < images.length; i++) {
        const { data: { text } } = await worker.recognize(images[i].path);
        const cleaned = text.replace(/\n+/g, ' ').trim();
        ideas.push(cleaned || `[Page ${images[i].pageNum} — could not read]`);
        process.stdout.write(`\r  ${C.dim}Progress: ${i + 1}/${images.length}${C.reset}`);
    }
    console.log('');
    await worker.terminate();
    success(`Read ${ideas.length} sticky notes (OCR)`);
    warn('OCR accuracy varies — please review the ideas in the next step.');
    return ideas;
}

async function readImages(images) {
    const provider = detectProvider();
    info(`AI provider: ${C.bold}${provider === 'openai' ? 'OpenAI GPT-4o' : provider === 'azure' ? 'Azure OpenAI' : 'Local OCR (Tesseract.js)'}${C.reset}`);

    if (provider === 'openai') {
        try { return await readWithOpenAI(images); }
        catch (e) { warn(`OpenAI failed: ${e.message}`); info('Falling back to local OCR...'); }
    } else if (provider === 'azure') {
        try { return await readWithAzure(images); }
        catch (e) { warn(`Azure OpenAI failed: ${e.message}`); info('Falling back to local OCR...'); }
    }
    return await readWithOCR(images);
}

// ═══════════════════════════════════════════════════════════════════
//  4. PARSE IDEAS into { title, desc } objects
// ═══════════════════════════════════════════════════════════════════
function parseIdeas(rawIdeas) {
    return rawIdeas.map((raw, i) => {
        const sep = raw.indexOf(' — ') !== -1 ? ' — '
                  : raw.indexOf(' - ') !== -1 ? ' - '
                  : raw.indexOf('—') !== -1 ? '—'
                  : null;
        if (sep) {
            const idx = raw.indexOf(sep);
            return { title: raw.slice(0, idx).trim(), desc: raw.slice(idx + sep.length).trim() };
        }
        return { title: raw.slice(0, 60).trim(), desc: raw.trim() };
    });
}

// ═══════════════════════════════════════════════════════════════════
//  5. INTERACTIVE REVIEW
// ═══════════════════════════════════════════════════════════════════
async function reviewIdeas(ideas) {
    header('✏️  Review extracted ideas:');
    function printIdeas() {
        ideas.forEach((idea, i) => {
            console.log(`  ${C.dim}${String(i + 1).padStart(3)}.${C.reset} ${C.bold}${idea.title}${C.reset}`);
            if (idea.desc) console.log(`       ${C.dim}${idea.desc}${C.reset}`);
        });
    }
    printIdeas();

    while (true) {
        console.log(`\n  ${C.cyan}[Enter]${C.reset} Accept all  ${C.cyan}[e]${C.reset} Edit  ${C.cyan}[d]${C.reset} Delete  ${C.cyan}[a]${C.reset} Add  ${C.cyan}[r]${C.reset} Reprint`);
        const cmd = (await ask(`  ${C.cyan}> ${C.reset}`)).trim().toLowerCase();

        if (cmd === '' || cmd === 'y' || cmd === 'yes') break;

        if (cmd === 'r') { printIdeas(); continue; }

        if (cmd === 'e' || cmd.startsWith('e ')) {
            const num = parseInt(cmd.replace('e', '').trim()) || parseInt(await ask(`  Edit idea #: `));
            if (num < 1 || num > ideas.length) { warn('Invalid number'); continue; }
            const idea = ideas[num - 1];
            console.log(`  ${C.dim}Current: ${idea.title} — ${idea.desc}${C.reset}`);
            const newTitle = (await ask(`  New title ${C.dim}[keep]${C.reset}: `)).trim();
            const newDesc = (await ask(`  New description ${C.dim}[keep]${C.reset}: `)).trim();
            if (newTitle) idea.title = newTitle;
            if (newDesc) idea.desc = newDesc;
            success(`Updated idea #${num}`);
        }

        if (cmd === 'd' || cmd.startsWith('d ')) {
            const num = parseInt(cmd.replace('d', '').trim()) || parseInt(await ask(`  Delete idea #: `));
            if (num < 1 || num > ideas.length) { warn('Invalid number'); continue; }
            const removed = ideas.splice(num - 1, 1)[0];
            success(`Deleted: ${removed.title}`);
        }

        if (cmd === 'a') {
            const title = (await ask(`  Title: `)).trim();
            const desc = (await ask(`  Description: `)).trim();
            if (title) { ideas.push({ title, desc }); success(`Added: ${title}`); }
        }
    }
    success(`${ideas.length} ideas confirmed`);
    return ideas;
}

// ═══════════════════════════════════════════════════════════════════
//  6. CLUSTER IDEAS BY THEME
// ═══════════════════════════════════════════════════════════════════
async function clusterWithAI(ideas) {
    const provider = detectProvider();
    if (provider === 'local') return null;

    header('🎯 Clustering ideas with AI...');
    const prompt = `You are given a list of brainstormed ideas. Group them into 5-10 logical themes.

Return ONLY valid JSON in this exact format (no markdown, no code fences):
[
  {
    "theme": "Theme Name",
    "emoji": "🔍",
    "color": "#22d3ee",
    "ideas": [0, 3, 7]
  }
]

The "ideas" array contains zero-based indices into the list below. Use visually distinct hex colors.
Every idea must appear in exactly one theme.

IDEAS:
${ideas.map((idea, i) => `${i}. ${idea.title} — ${idea.desc}`).join('\n')}`;

    try {
        let resp;
        if (provider === 'openai') {
            resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'gpt-4o', max_tokens: 2000, temperature: 0.3,
                    messages: [{ role: 'user', content: prompt }] })
            });
        } else {
            const endpoint = process.env.AZURE_OPENAI_ENDPOINT.replace(/\/$/, '');
            const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
            const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2024-08-01-preview';
            resp = await fetch(`${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`, {
                method: 'POST',
                headers: { 'api-key': process.env.AZURE_OPENAI_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ max_tokens: 2000, temperature: 0.3,
                    messages: [{ role: 'user', content: prompt }] })
            });
        }

        if (!resp.ok) throw new Error(`API error ${resp.status}`);
        const json = await resp.json();
        let text = json.choices[0].message.content.trim();
        // Strip markdown code fences if present
        text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
        const clusters = JSON.parse(text);
        success(`${clusters.length} themes identified`);
        return clusters;
    } catch (e) {
        warn(`AI clustering failed: ${e.message}`);
        return null;
    }
}

function clusterLocally(ideas) {
    header('🎯 Clustering ideas by keyword matching...');

    const themes = [
        { theme: 'Transportation & Mobility', emoji: '🚗', color: '#60a5fa',
          keywords: ['traffic', 'parking', 'transit', 'vehicle', 'fleet', 'plow', 'pothole', 'road', 'driving', 'bus', 'route optim'] },
        { theme: 'Infrastructure & Maintenance', emoji: '🏗️', color: '#fbbf24',
          keywords: ['water main', 'pipe', 'maintenance', 'digital twin', 'construction', 'building', 'energy optim', 'infrastructure', 'hvac'] },
        { theme: 'Environment & Sustainability', emoji: '🌿', color: '#34d399',
          keywords: ['flood', 'stormwater', 'waste', 'tree', 'climate', 'water quality', 'graffiti', 'environment', 'green', 'recycl'] },
        { theme: 'Citizen Services & Engagement', emoji: '👥', color: '#c084fc',
          keywords: ['311', 'chatbot', 'self-service', 'portal', 'permit status', 'translation', 'accessible', 'citizen', 'resident'] },
        { theme: 'Planning & Governance', emoji: '📊', color: '#f472b6',
          keywords: ['budget', 'zoning', 'policy', 'land use', 'property', 'assessment', 'briefing', 'council', 'governance', 'valuation'] },
        { theme: 'Data Analytics & Intelligence', emoji: '🔍', color: '#22d3ee',
          keywords: ['sentiment', 'noise', 'park usage', 'analytics', 'consultation', 'meeting minutes', 'knowledge', 'summariz', 'pattern'] },
        { theme: 'Public Safety & Enforcement', emoji: '🛡️', color: '#f87171',
          keywords: ['emergency', 'dispatch', 'enforcement', 'bylaw', 'code enforcement', 'inspection', 'safety', 'violation'] },
        { theme: 'Social Services', emoji: '🤝', color: '#fde68a',
          keywords: ['homeless', 'shelter', 'youth', 'program recommend', 'social', 'resource matching'] },
    ];

    const assigned = new Set();
    const clusters = themes.map(t => ({ ...t, ideas: [] }));

    ideas.forEach((idea, i) => {
        const text = `${idea.title} ${idea.desc}`.toLowerCase();
        for (const cluster of clusters) {
            if (cluster.keywords.some(kw => text.includes(kw))) {
                cluster.ideas.push(i);
                assigned.add(i);
                return;
            }
        }
    });

    // Put unmatched ideas into the closest theme or a catch-all
    ideas.forEach((_, i) => {
        if (!assigned.has(i)) {
            clusters[clusters.length - 1].ideas.push(i); // last theme as catch-all
        }
    });

    // Remove empty themes and keywords from output
    const result = clusters.filter(c => c.ideas.length > 0).map(({ keywords, ...rest }) => rest);
    success(`${result.length} themes identified`);
    return result;
}

async function clusterIdeas(ideas) {
    let clusters = await clusterWithAI(ideas);
    if (!clusters) clusters = clusterLocally(ideas);
    return clusters;
}

// ═══════════════════════════════════════════════════════════════════
//  7. GENERATE HTML
// ═══════════════════════════════════════════════════════════════════
function generateHTML(title, ideas, clusters, outPath) {
    header('📊 Generating visualization...');
    const templatePath = path.join(__dirname, 'template.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // Build the D3 tree data
    const treeData = {
        name: title,
        desc: `${ideas.length} brainstormed ideas across ${clusters.length} themes`,
        type: 'root',
        children: clusters.map(c => ({
            name: c.theme,
            emoji: c.emoji,
            type: 'theme',
            color: c.color,
            children: c.ideas.map(idx => ({
                name: ideas[idx].title,
                desc: ideas[idx].desc,
                type: 'idea'
            }))
        }))
    };

    // Build card HTML
    const themeClasses = ['transport', 'infra', 'env', 'citizen', 'planning', 'analytics', 'safety', 'social',
                          'transport', 'infra', 'env', 'citizen']; // wrap around if > 8 themes
    let cardsHTML = '';
    clusters.forEach((c, ci) => {
        const cls = themeClasses[ci % themeClasses.length];
        const ideaItems = c.ideas.map(idx =>
            `<li><strong>${escHtml(ideas[idx].title)}</strong><span class="desc">${escHtml(ideas[idx].desc)}</span></li>`
        ).join('\n                ');
        cardsHTML += `
        <div class="theme-card theme-${cls}" style="--tc: ${c.color}">
            <div class="theme-header">
                <div class="theme-icon" style="background: ${c.color}22">${c.emoji}</div>
                <div class="theme-title" style="color: ${c.color}">${escHtml(c.theme)}</div>
                <span class="theme-badge" style="background: ${c.color}1a; color: ${c.color}">${c.ideas.length} ideas</span>
            </div>
            <ul class="idea-list">
                ${ideaItems}
            </ul>
        </div>`;
    });

    html = html.replace('/*__TREE_DATA__*/', JSON.stringify(treeData, null, 2));
    html = html.replace('__TITLE__', escHtml(title));
    html = html.replace('__TITLE__', escHtml(title));  // appears twice in template
    html = html.replace('__IDEA_COUNT__', String(ideas.length));
    html = html.replace('__THEME_COUNT__', String(clusters.length));
    html = html.replace('<!--__CARDS__-->', cardsHTML);

    fs.writeFileSync(outPath, html, 'utf8');
    success(`Output: ${outPath}`);
    return outPath;
}

function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════════════════
//  8. CACHE
// ═══════════════════════════════════════════════════════════════════
function getCachePath(pdfPath) {
    return pdfPath.replace(/\.pdf$/i, '.ideas.json');
}

function loadCache(pdfPath) {
    const cp = getCachePath(pdfPath);
    if (fs.existsSync(cp)) {
        try {
            return JSON.parse(fs.readFileSync(cp, 'utf8'));
        } catch { return null; }
    }
    return null;
}

function saveCache(pdfPath, ideas, clusters) {
    const cp = getCachePath(pdfPath);
    fs.writeFileSync(cp, JSON.stringify({ ideas, clusters, cachedAt: new Date().toISOString() }, null, 2));
    success(`Cache saved: ${path.basename(cp)}`);
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
    try {
        const { pdfPath, title, outPath } = await getInputs();

        // Check cache
        const cache = loadCache(pdfPath);
        let ideas, clusters;

        if (cache) {
            info(`Found cached results (${cache.ideas.length} ideas, ${cache.clusters.length} themes)`);
            const useCache = (await ask(`  ${C.cyan}Use cache? [Y/n]: ${C.reset}`)).trim().toLowerCase();
            if (useCache !== 'n' && useCache !== 'no') {
                ideas = cache.ideas;
                clusters = cache.clusters;
            }
        }

        if (!ideas) {
            // Extract images
            const images = await extractImages(pdfPath);

            // Read sticky notes
            const rawIdeas = await readImages(images);

            // Parse into title/desc
            ideas = parseIdeas(rawIdeas);

            // Interactive review
            ideas = await reviewIdeas(ideas);

            // Cluster
            clusters = await clusterIdeas(ideas);

            // Save cache
            saveCache(pdfPath, ideas, clusters);

            // Cleanup temp images
            const tmpDir = path.join(path.dirname(pdfPath), '.sticky-ideas-tmp');
            if (fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true });
                info('Cleaned up temp images');
            }
        }

        // Generate HTML
        const htmlPath = generateHTML(title, ideas, clusters, outPath);

        // Open in browser
        const { exec } = require('child_process');
        exec(`start "" "${htmlPath}"`);
        console.log(`\n${C.bold}${C.green}  🎉 Done! Visualization opened in your browser.${C.reset}\n`);

    } catch (e) {
        err(e.message);
        if (process.env.DEBUG) console.error(e);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();
