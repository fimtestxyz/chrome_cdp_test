const {
    execSync
} = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ChromeProfileManager = require('./chrome-profile-manager');

const args = process.argv.slice(2);
let profileName = 'profile1';
let targetsFile = 'inputs/google_maps.yml';
let axWatch = null;
let axFiles = false;
let axRoles = null;
let axMethod = 'playwright';
let waitBetweenTargets = 3000;
let waitForResults = 30000;
let headless = false;
let defaultTarget = 'restaurant near novena singapore';

for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const flag = args[i];
        if (flag === '--targets' || flag === '-t') {
            targetsFile = args[++i];
        } else if (flag === '--target') {
            defaultTarget = args[++i];
            targetsFile = null;
        } else if (flag === '--ax-watch') {
            axWatch = parseInt(args[++i]) || 5000;
        } else if (flag === '--ax-files') {
            axFiles = true;
        } else if (flag === '--ax-roles') {
            axRoles = args[++i].split(',').map(r => r.trim());
        } else if (flag === '--ax-cdp') {
            axMethod = 'cdp';
        } else if (flag === '--wait-between') {
            waitBetweenTargets = parseInt(args[++i]) || 3000;
        } else if (flag === '--wait-results') {
            waitForResults = parseInt(args[++i]) || 30000;
        } else if (flag === '--headless') {
            headless = true;
        } else if (flag === '--help' || flag === '-h') {
            showHelp();
            process.exit(0);
        }
    } else {
        if (!profileName || profileName === 'profile1') {
            profileName = args[i];
        }
    }
}

function showHelp() {
    console.log(`
Usage: node google-maps-ax.js [profile] [options]

Arguments:
  profile              Chrome profile name (default: profile1)

Options:
  -t, --targets FILE   Targets YAML file (default: inputs/google_maps.yml)
  --target TEXT        Single search target (e.g., "hotels in singapore")
  --wait-between MS    Milliseconds to wait between targets (default: 3000)
  --wait-results MS    Max milliseconds to wait for results (default: 30000)
  --ax-watch N         Capture AX tree every N milliseconds
  --ax-files           Save AX snapshots to separate files
  --ax-roles R         Filter AX tree by roles (comma-separated)
  --ax-cdp             Use raw CDP instead of Playwright's snapshot
  --headless           Run Chrome in headless mode (default: false)
  -h, --help           Show this help message

YAML File Format:
  targets:
    - "restaurant near novena singapore"
    - "hospitals in central singapore"

Examples:
  node google-maps-ax.js profile1
  node google-maps-ax.js profile1 --target "cafes in orchard"
  node google-maps-ax.js profile1 --ax-files --ax-cdp
`);
}

const baseUrl = 'https://www.google.com/maps/search/';

function slugify(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.hostname.replace(/[^a-z0-9]/gi, '_');
    } catch (e) {
        return urlStr.replace(/[^a-z0-9]/gi, '_');
    }
}

function getTimestamp() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const HH = pad(now.getHours());
    const MM = pad(now.getMinutes());
    const SS = pad(now.getSeconds());
    return `${yyyy}${mm}${dd}_${HH}${MM}${SS}`;
}

const timeStr = getTimestamp();
const filename = `google_maps_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);
const axDir = axFiles ? path.join(outputDir, 'ax_snapshots', `google_maps_${timeStr}`) : null;

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
if (axDir && !fs.existsSync(axDir)) {
    fs.mkdirSync(axDir, {
        recursive: true
    });
}

const manager = new ChromeProfileManager();
let axSnapshotCount = 0;
let targetCount = 0;

function loadTargets() {
    if (!targetsFile) return [defaultTarget];
    try {
        if (!fs.existsSync(targetsFile)) {
            console.warn(`Targets file ${targetsFile} not found, using default target.`);
            return [defaultTarget];
        }
        const fileContent = fs.readFileSync(targetsFile, 'utf8');
        const data = yaml.load(fileContent);

        if (!data.targets || !Array.isArray(data.targets)) {
            throw new Error('YAML file must contain a "targets" array');
        }

        return data.targets;
    } catch (e) {
        console.error(`Error loading targets file: ${e.message}`);
        process.exit(1);
    }
}

async function startProfile(name, isHeadless) {
    console.log(`Starting profile ${name}...`);
    try {
        const scriptPath = path.join(__dirname, 'chrome-profile-manager.sh');
        let command = `"${scriptPath}" start ${name}`;
        if (isHeadless) {
            command += ' --headless';
        }
        execSync(command, {
            stdio: 'inherit'
        });
        console.log('Waiting for Chrome to initialize...');
        await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
        console.error('Error starting profile (might already be running):', e.message);
    }
}

function filterAxTreeByRoles(node, roles) {
    if (!node) return null;

    const filtered = {
        ...node
    };
    const keepNode = !roles || roles.includes(node.role);

    if (node.children && node.children.length > 0) {
        filtered.children = node.children
            .map(child => filterAxTreeByRoles(child, roles))
            .filter(child => child !== null);
    }

    if (!keepNode && (!filtered.children || filtered.children.length === 0)) {
        return null;
    }

    return filtered;
}

async function captureAxTreePlaywright(page) {
    try {
        if (!page.accessibility || typeof page.accessibility.snapshot !== 'function') {
            return null;
        }
        const snapshot = await page.accessibility.snapshot();
        return snapshot;
    } catch (e) {
        return null;
    }
}

async function captureAxTreeCDP(page) {
    try {
        const client = await page.context().newCDPSession(page);
        await client.send('Accessibility.enable');
        const result = await client.send('Accessibility.getFullAXTree');
        await client.send('Accessibility.disable');
        await client.detach();
        return result.nodes || result;
    } catch (e) {
        console.error('Error capturing AX tree (CDP):', e.message);
        return null;
    }
}

async function captureAxTree(page, stream, label = 'initial') {
    axSnapshotCount++;
    const timestamp = new Date().toISOString();

    let tree;
    let usedMethod = axMethod;

    if (axMethod === 'cdp') {
        tree = await captureAxTreeCDP(page);
    } else {
        tree = await captureAxTreePlaywright(page);
        if (!tree) {
            tree = await captureAxTreeCDP(page);
            usedMethod = 'cdp';
        }
    }

    if (!tree) {
        console.error('  ⚠ Failed to capture AX tree');
        return;
    }

    if (axRoles && usedMethod === 'playwright') {
        tree = filterAxTreeByRoles(tree, axRoles);
    }

    const data = {
        type: 'accessibility',
        method: usedMethod,
        snapshot_id: axSnapshotCount,
        target_id: targetCount,
        label: label,
        timestamp: timestamp,
        tree: tree
    };

    stream.write(JSON.stringify(data) + '\n');

    if (axFiles && axDir) {
        const axFilename = `ax_${axSnapshotCount}_t${targetCount}_${label}_${Date.now()}.json`;
        const axPath = path.join(axDir, axFilename);
        fs.writeFileSync(axPath, JSON.stringify(data, null, 2));
    }

    console.log(`  ✓ Captured AX tree #${axSnapshotCount} (${countNodes(tree)} nodes)`);
}

function countNodes(node) {
    if (!node) return 0;
    if (Array.isArray(node)) return node.reduce((sum, n) => sum + countNodes(n), 0);
    let count = 1;
    if (node.children) {
        count += node.children.reduce((sum, child) => sum + countNodes(child), 0);
    }
    return count;
}

async function scrollResults(page, stream, labelPrefix) {
    console.log('  → Scrolling to the end of the list...');
    
    let lastItemCount = 0;
    let sameCountRetries = 0;
    const maxRetries = 3;
    let iteration = 0;

    while (sameCountRetries < maxRetries) {
        iteration++;
        const scrollState = await page.evaluate(async () => {
            const feed = document.querySelector('div[role="feed"]');
            if (!feed) return { status: 'no_feed' };

            // Find all result items. Maps usually uses articles or specific link patterns.
            const items = feed.querySelectorAll('div[role="article"], a[aria-label]');
            if (items.length === 0) return { status: 'no_items', count: 0 };

            const lastItem = items[items.length - 1];
            lastItem.scrollIntoView();
            if (lastItem instanceof HTMLElement) {
                lastItem.focus();
            }

            const reachedEnd = document.body.innerText.includes("You've reached the end of the list") || 
                               document.body.innerText.includes("No more results");

            return { 
                status: 'success', 
                count: items.length, 
                reachedEnd 
            };
        });

        if (scrollState.status !== 'success') {
            console.log(`  ⚠ Scrolling stopped: ${scrollState.status}`);
            break;
        }

        console.log(`  → Iteration ${iteration}: Found ${scrollState.count} items...`);

        if (scrollState.reachedEnd) {
            console.log('  ✓ Reached the end of the list (detected end text).');
            break;
        }

        if (scrollState.count === lastItemCount) {
            sameCountRetries++;
            console.log(`  → No new items (retry ${sameCountRetries}/${maxRetries})...`);
        } else {
            sameCountRetries = 0;
            lastItemCount = scrollState.count;
        }

        await new Promise(r => setTimeout(r, 2500)); // Wait for lazy loading

        // Capture AX tree periodically during long scrolls
        if (iteration % 5 === 0) {
            await captureAxTree(page, stream, `${labelPrefix}_scroll_${iteration}`);
        }
    }
}

async function performSearch(page, target, stream) {
    targetCount++;
    const searchUrl = `${baseUrl}${encodeURIComponent(target)}/`;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Target ${targetCount}: ${target}`);
    console.log(`URL: ${searchUrl}`);
    console.log('─'.repeat(60));

    const targetData = {
        type: 'target_start',
        target_id: targetCount,
        target: target,
        url: searchUrl,
        timestamp: new Date().toISOString()
    };
    stream.write(JSON.stringify(targetData) + '\n');

    try {
        console.log('  → Navigating to search results...');
        await page.goto(searchUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('  ⏳ Waiting for results to load...');
        const resultSelectors = [
            'div[role="feed"]',
            'div[aria-label^="Results for"]',
            'div[role="main"]'
        ];

        try {
            await Promise.race(resultSelectors.map(s => page.waitForSelector(s, { timeout: 20000 })));
            console.log('  ✓ Results container detected');
        } catch (e) {
            console.log('  ⚠ Results container not explicitly found, proceeding...');
        }

        await new Promise(r => setTimeout(r, 3000));

        // Start scrolling to the end
        await scrollResults(page, stream, `t${targetCount}`);

        console.log('  → Capturing final results state...');
        await captureAxTree(page, stream, `t${targetCount}_final_results`);

        console.log('  → Extracting result names...');
        const results = await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('a[aria-label]'))
                .map(a => a.getAttribute('aria-label'))
                .filter(label => label && label.length > 3);
            return labels.slice(0, 10);
        });

        const resultData = {
            type: 'results_info',
            target_id: targetCount,
            target: target,
            found_labels: results,
            timestamp: new Date().toISOString()
        };
        stream.write(JSON.stringify(resultData) + '\n');

        console.log(`  ✓ Target ${targetCount} complete (${results.length} labels found)`);
        return true;
    } catch (e) {
        console.error(`  ✗ Error processing target: ${e.message}`);
        return false;
    }
}

async function main() {
    const targets = loadTargets();
    console.log(`\n✓ Loaded ${targets.length} target(s)\n`);

    await startProfile(profileName, headless);

    console.log(`${'='.repeat(60)}`);
    console.log(`Profile: ${profileName}`);
    console.log(`Targets: ${targets.length}`);
    console.log(`Output: ${outputPath}`);
    if (axFiles) console.log(`AX Files: ${axDir}`);
    console.log(`${'='.repeat(60)}\n`);

    const stream = fs.createWriteStream(outputPath, {
        flags: 'a'
    });

    const cleanup = async () => {
        console.log('\n\nStopping automation...');
        stream.end();
        await manager.disconnectAll();
        console.log(`\nComplete!`);
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        console.log(`Connecting to ${profileName}...`);
        const browser = await manager.connect(profileName);

        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        const page = await context.newPage();

        page.on('request', request => {
            try {
                const data = {
                    type: 'request',
                    timestamp: new Date().toISOString(),
                    url: request.url(),
                    method: request.method()
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {}
        });

        page.on('response', async response => {
            try {
                const data = {
                    type: 'response',
                    timestamp: new Date().toISOString(),
                    url: response.url(),
                    status: response.status()
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {}
        });

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            await performSearch(page, target, stream);

            if (i < targets.length - 1) {
                console.log(`\n  ⏸  Waiting ${waitBetweenTargets}ms before next target...`);
                await new Promise(r => setTimeout(r, waitBetweenTargets));
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`All ${targets.length} targets completed!`);
        console.log('='.repeat(60));

        await cleanup();
    } catch (err) {
        console.error('\n✗ Error:', err);
        stream.end();
        process.exit(1);
    }
}

main();
