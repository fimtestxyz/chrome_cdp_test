const {
    execSync
} = require('child_process');
const fs = require('fs');
const path = require('path');
const ChromeProfileManager = require('./chrome-profile-manager');

// Parse arguments
const args = process.argv.slice(2);
let profileName = 'profile1';
let headless = false;

// Simple argument parser
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const flag = args[i];
        if (flag === '--headless') {
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
Usage: node marinetraffic.js [profile] [options]

Arguments:
  profile              Chrome profile name (default: profile1)

Options:
  --headless           Run Chrome in headless mode (default: false)
  -h, --help           Show this help message

Description:
  Navigates to MarineTraffic and logs all network traffic matching 
  https://www.marinetraffic.com/getData/*/ into the marinetraffic/ folder.
`);
}

const url = 'https://www.marinetraffic.com';

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
    const MS = now.getMilliseconds().toString().padStart(3, '0');
    return `${yyyy}${mm}${dd}_${HH}${MM}${SS}_${MS}`;
}

const outputDir = path.join(__dirname, 'marinetraffic');

// Ensure directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, {
        recursive: true
    });
}

const manager = new ChromeProfileManager();

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
        console.error("Error starting profile (might already be running):", e.message);
    }
}

async function main() {
    await startProfile(profileName, headless);

    console.log(`${'='.repeat(60)}`);
    console.log(`Profile: ${profileName}`);
    console.log(`Target: ${url}`);
    console.log(`Output Directory: ${outputDir}`);
    console.log(`${'='.repeat(60)}\n`);

    // Create a main log file for all intercepted requests
    const mainLogPath = path.join(outputDir, `traffic_log_${getTimestamp().split('_')[0]}.jsonl`);
    const stream = fs.createWriteStream(mainLogPath, {
        flags: 'a'
    });

    // Handle cleanup
    const cleanup = async () => {
        console.log('\n\nStopping automation...');
        stream.end();
        await manager.disconnectAll();
        console.log(`\nComplete!`);
        console.log(`  Main log: ${mainLogPath}`);
        console.log(`  Data files saved in: ${outputDir}/\n`);
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    try {
        console.log(`Connecting to ${profileName}...`);
        const browser = await manager.connect(profileName);

        // Handle manual browser closure
        browser.on('disconnected', () => {
            console.log('\nBrowser disconnected (Chrome was closed).');
            cleanup();
        });

        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();
        
        // Use an existing page if available, otherwise create a new one
        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        console.log('Setting up network interception...');

        // Enable request interception (optional, but good for logging)
        page.on('request', request => {
            const reqUrl = request.url();
            if (reqUrl.includes('/getData/') || reqUrl.includes('get_info_window_json')) {
                const data = {
                    type: 'request',
                    timestamp: new Date().toISOString(),
                    url: reqUrl,
                    method: request.method(),
                    headers: request.headers()
                };
                stream.write(JSON.stringify(data) + '\n');
            }
        });

        page.on('response', async response => {
            const resUrl = response.url();
            const isGetData = resUrl.includes('/getData/');
            const isInfoWindow = resUrl.includes('get_info_window_json');

            if (isGetData || isInfoWindow) {
                console.log(`  → Intercepted: ${resUrl}`);
                
                try {
                    let body = null;
                    const contentType = response.headers()['content-type'] || '';

                    if (contentType.includes('json') || contentType.includes('text') || contentType.includes('javascript')) {
                        try {
                            body = await response.text();
                        } catch (e) {
                            body = '[Body unavailable]';
                        }
                    } else {
                        body = '[Binary/Non-text data]';
                    }

                    const timestamp = getTimestamp();
                    const urlObj = new URL(resUrl);
                    
                    let prefix = 'data';
                    let sanitizedPath = '';

                    if (isInfoWindow) {
                        prefix = 'info_window';
                        const id = urlObj.searchParams.get('id') || 'unknown';
                        sanitizedPath = `ship_${id}`;
                    } else {
                        // Create a sanitized filename from the URL path for getData
                        sanitizedPath = urlObj.pathname
                            .replace(/^\/getData\//, '')
                            .replace(/[^a-z0-9]/gi, '_')
                            .substring(0, 50);
                    }
                    
                    const filename = `${prefix}_${timestamp}_${sanitizedPath}.json`;
                    const filePath = path.join(outputDir, filename);

                    const responseData = {
                        url: resUrl,
                        timestamp: new Date().toISOString(),
                        status: response.status(),
                        headers: response.headers(),
                        body: body
                    };

                    // Save individual file
                    fs.writeFileSync(filePath, JSON.stringify(responseData, null, 2));
                    
                    // Also log to the main stream
                    const logEntry = {
                        type: 'response',
                        category: isInfoWindow ? 'info_window' : 'get_data',
                        timestamp: responseData.timestamp,
                        url: resUrl,
                        status: responseData.status,
                        file: filename,
                        bodyLength: body.length
                    };
                    stream.write(JSON.stringify(logEntry) + '\n');
                    
                    console.log(`  ✓ Saved to ${filename}`);
                } catch (e) {
                    console.error(`  ✗ Error processing response from ${resUrl}: ${e.message}`);
                }
            }
        });

        console.log(`Navigating to ${url}...`);
        
        // Navigate and wait for page load
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        console.log('✓ Page loaded. Monitoring traffic...');
        console.log('Press Ctrl+C to stop.');

        // Keep the process running
        // We don't want to exit immediately after goto, as traffic continues
        // We can just wait indefinitely or for a long time
        await new Promise(() => {}); 

    } catch (err) {
        console.error('\n✗ Error:', err);
        stream.end();
        process.exit(1);
    }
}

main();
