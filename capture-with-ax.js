const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ChromeProfileManager = require('./chrome-profile-manager');

// Parse arguments
const args = process.argv.slice(2);
let profileName = 'profile1';
let rawUrl = 'www.perplexity.ai';
let axWatch = null;
let axFiles = false;
let axRoles = null;
let axMethod = 'playwright'; // 'playwright' or 'cdp'

// Simple argument parser
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const flag = args[i];
        if (flag === '--ax-watch') {
            axWatch = parseInt(args[++i]) || 5000;
        } else if (flag === '--ax-files') {
            axFiles = true;
        } else if (flag === '--ax-roles') {
            axRoles = args[++i].split(',').map(r => r.trim());
        } else if (flag === '--ax-cdp') {
            axMethod = 'cdp';
        } else if (flag === '--help' || flag === '-h') {
            showHelp();
            process.exit(0);
        }
    } else {
        if (!profileName || profileName === 'profile1') {
            profileName = args[i];
        } else if (!rawUrl || rawUrl === 'www.perplexity.ai') {
            rawUrl = args[i];
        }
    }
}

function showHelp() {
    console.log(`
Usage: node capture-with-ax.js [profile] [url] [options]

Arguments:
  profile          Chrome profile name (default: profile1)
  url              URL to visit (default: www.perplexity.ai)

Options:
  --ax-watch N     Capture AX tree every N milliseconds (e.g., 5000 for 5s)
  --ax-files       Save AX snapshots to separate files
  --ax-roles R     Filter AX tree by roles (comma-separated, e.g., button,link,heading)
  --ax-cdp         Use raw CDP instead of Playwright's snapshot (more detailed)
  -h, --help       Show this help message

Examples:
  # Basic capture (one AX snapshot after load)
  node capture-with-ax.js profile1 example.com

  # Watch mode (snapshot every 5 seconds)
  node capture-with-ax.js profile1 example.com --ax-watch 5000

  # Save AX snapshots to separate files
  node capture-with-ax.js profile1 example.com --ax-files

  # Filter by specific roles
  node capture-with-ax.js profile1 example.com --ax-roles button,link,heading

  # Use raw CDP for more detailed tree
  node capture-with-ax.js profile1 example.com --ax-cdp

  # Combine options
  node capture-with-ax.js profile1 example.com --ax-watch 3000 --ax-files --ax-cdp
`);
}

// Ensure URL has protocol
const url = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;

// Helper to slugify URL
function slugify(urlStr) {
    try {
        const u = new URL(urlStr);
        return u.hostname.replace(/[^a-z0-9]/gi, '_');
    } catch (e) {
        return urlStr.replace(/[^a-z0-9]/gi, '_');
    }
}

// Timestamp format: %Y%m%d_%H%M%S
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
const filename = `${slug}_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);
const axDir = axFiles ? path.join(outputDir, 'ax_snapshots', `${slug}_${timeStr}`) : null;

// Ensure directories
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}
if (axDir && !fs.existsSync(axDir)) {
    fs.mkdirSync(axDir, { recursive: true });
}

const manager = new ChromeProfileManager();
let axSnapshotCount = 0;

async function startProfile(name) {
    console.log(`Starting profile ${name}...`);
    try {
        const scriptPath = path.join(__dirname, 'chrome-profile-manager.sh');
        execSync(`"${scriptPath}" start ${name}`, { stdio: 'inherit' });
        console.log('Waiting for Chrome to initialize...');
        await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
        console.error("Error starting profile (might already be running):", e.message);
    }
}

// Filter AX tree by roles
function filterAxTreeByRoles(node, roles) {
    if (!node) return null;
    
    const filtered = { ...node };
    
    // Keep node if it matches one of the desired roles
    const keepNode = !roles || roles.includes(node.role);
    
    // Recursively filter children
    if (node.children && node.children.length > 0) {
        filtered.children = node.children
            .map(child => filterAxTreeByRoles(child, roles))
            .filter(child => child !== null);
    }
    
    // If node doesn't match and has no matching children, exclude it
    if (!keepNode && (!filtered.children || filtered.children.length === 0)) {
        return null;
    }
    
    return filtered;
}

// Capture AX tree using Playwright
async function captureAxTreePlaywright(page) {
    try {
        // Check if accessibility API is available
        if (!page.accessibility || typeof page.accessibility.snapshot !== 'function') {
            console.log('  → Playwright accessibility API not available, falling back to CDP');
            return null;
        }
        const snapshot = await page.accessibility.snapshot();
        return snapshot;
    } catch (e) {
        console.error('Error capturing AX tree (Playwright):', e.message);
        console.log('  → Falling back to CDP method');
        return null;
    }
}

// Capture AX tree using raw CDP
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

// Main AX tree capture function
async function captureAxTree(page, stream, label = 'initial') {
    axSnapshotCount++;
    const timestamp = new Date().toISOString();
    
    console.log(`Capturing accessibility tree (${label})...`);
    
    let tree;
    let usedMethod = axMethod;
    
    if (axMethod === 'cdp') {
        tree = await captureAxTreeCDP(page);
    } else {
        // Try Playwright first
        tree = await captureAxTreePlaywright(page);
        
        // Fall back to CDP if Playwright fails
        if (!tree) {
            console.log('  → Switching to CDP method');
            tree = await captureAxTreeCDP(page);
            usedMethod = 'cdp';
        }
    }
    
    if (!tree) {
        console.error('Failed to capture AX tree with both methods');
        return;
    }
    
    // Apply role filtering if specified (only works well with Playwright format)
    if (axRoles && usedMethod === 'playwright') {
        tree = filterAxTreeByRoles(tree, axRoles);
    }
    
    const data = {
        type: 'accessibility',
        method: usedMethod,
        snapshot_id: axSnapshotCount,
        label: label,
        timestamp: timestamp,
        tree: tree
    };
    
    // Write to main JSONL stream
    stream.write(JSON.stringify(data) + '\n');
    
    // Optionally save to separate file
    if (axFiles && axDir) {
        const axFilename = `ax_${axSnapshotCount}_${label}_${Date.now()}.json`;
        const axPath = path.join(axDir, axFilename);
        fs.writeFileSync(axPath, JSON.stringify(data, null, 2));
        console.log(`  → Saved to ${axFilename}`);
    }
    
    console.log(`  ✓ Captured AX tree #${axSnapshotCount} using ${usedMethod} (${countNodes(tree)} nodes)`);
}

// Count nodes in AX tree
function countNodes(node) {
    if (!node) return 0;
    if (Array.isArray(node)) return node.reduce((sum, n) => sum + countNodes(n), 0);
    let count = 1;
    if (node.children) {
        count += node.children.reduce((sum, child) => sum + countNodes(child), 0);
    }
    return count;
}

async function main() {
    await startProfile(profileName);

    console.log(`\n${'='.repeat(60)}`);
    console.log(`Profile: ${profileName}`);
    console.log(`URL: ${url}`);
    console.log(`AX Method: ${axMethod}`);
    if (axWatch) console.log(`AX Watch: Every ${axWatch}ms`);
    if (axFiles) console.log(`AX Files: ${axDir}`);
    if (axRoles) console.log(`AX Roles Filter: ${axRoles.join(', ')}`);
    console.log(`Output: ${outputPath}`);
    console.log(`${'='.repeat(60)}\n`);

    // Create a write stream
    const stream = fs.createWriteStream(outputPath, { flags: 'a' });
    let watchInterval = null;

    // Handle cleanup
    const cleanup = async () => {
        console.log('\n\nStopping capture...');
        if (watchInterval) {
            clearInterval(watchInterval);
        }
        stream.end();
        await manager.disconnectAll();
        console.log(`\nCapture complete!`);
        console.log(`  Main file: ${outputPath}`);
        if (axFiles && axDir) {
            console.log(`  AX snapshots: ${axDir}/`);
        }
        console.log(`  Total AX snapshots: ${axSnapshotCount}\n`);
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

        // Enable request/response interception
        page.on('request', request => {
            try {
                const data = {
                    type: 'request',
                    timestamp: new Date().toISOString(),
                    url: request.url(),
                    method: request.method(),
                    headers: request.headers(),
                    postData: request.postData()
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {
                console.error('Error logging request:', e.message);
            }
        });

        page.on('response', async response => {
            try {
                let body = null;
                const resourceType = response.request().resourceType();
                const contentType = response.headers()['content-type'] || '';

                if (['document', 'xhr', 'fetch', 'script', 'stylesheet'].includes(resourceType) ||
                    contentType.includes('json') || contentType.includes('text') || contentType.includes('xml')) {
                    try {
                        body = await response.text();
                    } catch (e) {
                        body = '[Body unavailable]';
                    }
                } else {
                    body = '[Binary or ignored content type]';
                }

                const data = {
                    type: 'response',
                    timestamp: new Date().toISOString(),
                    url: response.url(),
                    status: response.status(),
                    headers: response.headers(),
                    body: body
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {
                console.error('Error logging response:', e.message);
            }
        });

        // Navigate and wait for network idle
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        console.log('✓ Page loaded and network traffic captured.\n');

        // Capture initial AX tree
        await captureAxTree(page, stream, 'initial_load');

        // Set up periodic AX tree capture if requested
        if (axWatch) {
            console.log(`\n→ Starting AX tree watch (every ${axWatch}ms)...`);
            let watchCount = 0;
            watchInterval = setInterval(async () => {
                watchCount++;
                await captureAxTree(page, stream, `watch_${watchCount}`);
            }, axWatch);
        }

        console.log('\n' + '='.repeat(60));
        console.log('Session is running. Press Ctrl+C to stop and save.');
        console.log('='.repeat(60) + '\n');

        // Keep the process alive
        await new Promise(() => {});

    } catch (err) {
        console.error('Error:', err);
        stream.end();
        process.exit(1);
    }
}

main();
