const {
    execSync
} = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ChromeProfileManager = require('./chrome-profile-manager');

const args = process.argv.slice(2);
let profileName = 'profile1';
let targetsFile = 'inputs/x.yml';
let axWatch = null;
let axFiles = false;
let axRoles = null;
let axMethod = 'playwright';
let waitBetweenTargets = 3000;
let waitForResults = 30000;
let headless = false;
let defaultTarget = 'AI agents automation';
let scrollN = 3;
let scrollM = 2;

for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const flag = args[i];
        if (flag === '--targets' || flag === '-t') {
            targetsFile = args[++i];
        } else if (flag === '--target') {
            defaultTarget = args[++i];
            targetsFile = null; // Use single target
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
        } else if (flag === '--scroll-n') {
            scrollN = parseInt(args[++i]) || 3;
        } else if (flag === '--scroll-m') {
            scrollM = parseInt(args[++i]) || 2;
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
Usage: node x-ax.js [profile] [options]

Arguments:
  profile              Chrome profile name (default: profile1)

Options:
  -t, --targets FILE   Targets YAML file (default: inputs/x.yml)
  --target TEXT        Single search target (overrides --targets file)
  --wait-between MS    Milliseconds to wait between targets (default: 3000)
  --wait-results MS    Max milliseconds to wait for results (default: 30000)
  --scroll-n N         Number of times to scroll down (default: 3)
  --scroll-m M         Capture AX tree every M scrolls (default: 2)
  --ax-watch N         Capture AX tree every N milliseconds
  --ax-files           Save AX snapshots to separate files
  --ax-roles R         Filter AX tree by roles (comma-separated)
  --ax-cdp             Use raw CDP instead of Playwright's snapshot
  --headless           Run Chrome in headless mode (default: false)
  -h, --help           Show this help message

YAML File Format:
  targets:
    - "AI agents"
    - "Playwright automation"

Examples:
  node x-ax.js profile1 --target "OpenAI"
  node x-ax.js profile1 --targets my-targets.yml
  node x-ax.js profile1 --ax-files --ax-cdp
`);
}

const url = 'https://x.com/home';

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

const slug = slugify(url);
const timeStr = getTimestamp();
const filename = `x_search_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);
const axDir = axFiles ? path.join(outputDir, 'ax_snapshots', `x_${timeStr}`) : null;

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
let searchCount = 0;

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
        search_id: searchCount,
        label: label,
        timestamp: timestamp,
        tree: tree
    };

    stream.write(JSON.stringify(data) + '\n');

    if (axFiles && axDir) {
        const axFilename = `ax_${axSnapshotCount}_s${searchCount}_${label}_${Date.now()}.json`;
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

async function waitForResultsLoaded(page, timeout = 30000) {
    console.log('  ⏳ Waiting for search results...');
    try {
        // Wait for results to appear in the primary column
        await page.waitForSelector('[data-testid="tweet"]', { timeout });
        console.log('  ✓ Results loaded');
        return true;
    } catch (e) {
        console.log('  ⚠ Timeout or no results detected');
        return false;
    }
}

async function scrollPage(page, stream, n, m, labelPrefix) {
    console.log(`  → Scrolling down ${n} times (capture every ${m})...`);
    for (let i = 1; i <= n; i++) {
        await page.evaluate(() => {
            window.scrollBy(0, window.innerHeight);
        });
        await new Promise(r => setTimeout(r, 1500)); // Wait for content to load

        if (i % m === 0) {
            console.log(`  → Capturing AX state at scroll ${i}...`);
            await captureAxTree(page, stream, `${labelPrefix}_scroll_${i}`);
        }
    }
}

async function performSearch(page, target, stream) {
    searchCount++;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Search ${searchCount}: ${target}`);
    console.log('─'.repeat(60));

    const searchData = {
        type: 'search_start',
        search_id: searchCount,
        target: target,
        timestamp: new Date().toISOString()
    };
    stream.write(JSON.stringify(searchData) + '\n');

    try {
        console.log('  → Finding search input...');
        const searchInputSelector = '[data-testid="SearchBox_Search_Input"]';
        
        // Wait for search box to be visible
        await page.waitForSelector(searchInputSelector, { timeout: 10000 });
        
        console.log('  → Typing search target...');
        await page.fill(searchInputSelector, target);
        
        await new Promise(r => setTimeout(r, 500));

        console.log('  → Capturing pre-submit state...');
        await captureAxTree(page, stream, `s${searchCount}_before_submit`);

        console.log('  → Pressing Enter...');
        await page.keyboard.press('Enter');

        const resultsLoaded = await waitForResultsLoaded(page, waitForResults);

        if (resultsLoaded) {
            console.log('  → Capturing initial results state...');
            await captureAxTree(page, stream, `s${searchCount}_after_results`);

            // Perform scrolling
            if (scrollN > 0) {
                await scrollPage(page, stream, scrollN, scrollM, `s${searchCount}`);
            }

            console.log('  → Extracting top result text...');
            const resultsText = await page.evaluate(() => {
                const tweets = document.querySelectorAll('[data-testid="tweetText"]');
                return Array.from(tweets).slice(0, 5).map(t => t.innerText).join('\n---\n');
            });

            const resultData = {
                type: 'search_result',
                search_id: searchCount,
                target: target,
                results_summary: resultsText.substring(0, 5000),
                timestamp: new Date().toISOString()
            };
            stream.write(JSON.stringify(resultData) + '\n');

            console.log(`  ✓ Search ${searchCount} complete`);
        } else {
            console.log(`  ⚠ Search ${searchCount} results not found or timed out`);
        }

        return true;
    } catch (e) {
        console.error(`  ✗ Error performing search: ${e.message}`);
        return false;
    }
}

async function main() {
    const targets = loadTargets();
    console.log(`✓ Loaded ${targets.length} target(s)\n`);

    await startProfile(profileName, headless);

    console.log(`${'='.repeat(60)}`);
    console.log(`Profile: ${profileName}`);
    console.log(`Targets: ${targets.length}`);
    console.log(`Output: ${outputPath}`);
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

        console.log(`Navigating to ${url}...`);
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });

        console.log('Waiting for X interface to be ready...');
        await page.waitForSelector('[data-testid="SearchBox_Search_Input"]', { timeout: 30000 });

        console.log('✓ Page loaded');
        await captureAxTree(page, stream, 'initial_load');

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            await performSearch(page, target, stream);

            if (i < targets.length - 1) {
                console.log(`\n  ⏸  Waiting ${waitBetweenTargets}ms before next search...`);
                await new Promise(r => setTimeout(r, waitBetweenTargets));
                // Navigate back home to reset search box if needed, or just clear it
                await page.goto(url, { waitUntil: 'domcontentloaded' });
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`All ${targets.length} searches completed!`);
        console.log('='.repeat(60));

        await cleanup();
    } catch (err) {
        console.error('\n✗ Error:', err);
        stream.end();
        process.exit(1);
    }
}

main();
