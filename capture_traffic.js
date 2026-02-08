const {
    execSync
} = require('child_process');
const fs = require('fs');
const path = require('path');
const ChromeProfileManager = require('./chrome-profile-manager');

// Args
const args = process.argv.slice(2);
const profileName = args[0] || 'profile1';
const rawUrl = args[1] || 'www.perplexity.ai';

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
const now = new Date();
const pad = n => n.toString().padStart(2, '0');
const yyyy = now.getFullYear();
const mm = pad(now.getMonth() + 1);
const dd = pad(now.getDate());
const HH = pad(now.getHours());
const MM = pad(now.getMinutes());
const SS = pad(now.getSeconds());
const timeStr = `${yyyy}${mm}${dd}_${HH}${MM}${SS}`;

const slug = slugify(url);
const filename = `${slug}_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);

// Ensure payload dir
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir);
}

const manager = new ChromeProfileManager();

async function startProfile(name) {
    console.log(`Starting profile ${name}...`);
    try {
        // Use the shell script to start
        // We assume the script is in the current directory or provide full path
        const scriptPath = path.join(__dirname, 'chrome-profile-manager.sh');
        execSync(`"${scriptPath}" start ${name}`);

        // Wait a bit for it to actually initialize
        console.log('Waiting for Chrome to initialize...');
        await new Promise(r => setTimeout(r, 3000));
    } catch (e) {
        console.error("Error starting profile (might already be running):", e.message);
    }
}

async function main() {
    await startProfile(profileName);

    console.log(`Connecting to ${profileName}...`);

    // Create a write stream
    const stream = fs.createWriteStream(outputPath, {
        flags: 'a'
    });

    // Handle cleanup
    const cleanup = async () => {
        console.log('\nStopping capture...');
        stream.end();
        await manager.disconnectAll();
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        // Connect to the profile
        // Note: ChromeProfileManager.connect() connects to the browser. 
        // We then need to use .execute() or .getPage() to interact.
        // However, .execute() gets a new page or existing context.

        // Let's manually manage the page to ensure we attach listeners before navigation
        const browser = await manager.connect(profileName);

        // Get existing pages or create new one
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
                // Only try to get body for text-based resources to avoid performance issues/errors
                const resourceType = response.request().resourceType();
                const contentType = response.headers()['content-type'] || '';

                if (['document', 'xhr', 'fetch', 'script', 'stylesheet'].includes(resourceType) ||
                    contentType.includes('json') || contentType.includes('text') || contentType.includes('xml')) {
                    try {
                        // This might fail if response is closed or redirected
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

        console.log('Page loaded and network traffic captured.');
        console.log(`Traffic saved to ${outputPath}`);
        console.log('Session is running. Press Ctrl+C to stop capturing and exit.');

        // Keep the process alive
        await new Promise(() => {});

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

main();