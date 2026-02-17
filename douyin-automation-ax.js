const {
    execSync
} = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const ChromeProfileManager = require('./chrome-profile-manager');

// Parse arguments
const args = process.argv.slice(2);
let profileName = 'profile1';
let questionsFile = 'inputs/douyin.yml';
let axWatch = null;
let axFiles = false;
let axRoles = null;
let axMethod = 'playwright';
let waitBetweenQuestions = 3000; // Default 3 seconds between questions
let waitForResponse = 30000; // Default 30 seconds max wait for response
let headless = false;

// Simple argument parser
for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
        const flag = args[i];
        if (flag === '--questions' || flag === '-q') {
            questionsFile = args[++i];
        } else if (flag === '--ax-watch') {
            axWatch = parseInt(args[++i]) || 5000;
        } else if (flag === '--ax-files') {
            axFiles = true;
        } else if (flag === '--ax-roles') {
            axRoles = args[++i].split(',').map(r => r.trim());
        } else if (flag === '--ax-cdp') {
            axMethod = 'cdp';
        } else if (flag === '--wait-between') {
            waitBetweenQuestions = parseInt(args[++i]) || 3000;
        } else if (flag === '--wait-response') {
            waitForResponse = parseInt(args[++i]) || 30000;
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
Usage: node douyin-automation-ax.js [profile] [options]

Arguments:
  profile              Chrome profile name (default: profile1)

Options:
  -q, --questions FILE Questions YAML file (default: inputs/douyin.yml)
  --wait-between MS    Milliseconds to wait between questions (default: 3000)
  --wait-response MS   Max milliseconds to wait for response (default: 30000)
  --ax-watch N         Capture AX tree every N milliseconds
  --ax-files           Save AX snapshots to separate files
  --ax-roles R         Filter AX tree by roles (comma-separated)
  --ax-cdp             Use raw CDP instead of Playwright's snapshot
  --headless           Run Chrome in headless mode (default: false)
  -h, --help           Show this help message

YAML File Format:
  questions:
    - "什么是机器学习?"
    - "量子计算是什么?"
    - "如何设计API?"

Examples:
  # Basic usage
  node douyin-automation-ax.js profile1

  # Custom questions file
  node douyin-automation-ax.js profile1 --questions my-questions.yml

  # Adjust timing
  node douyin-automation-ax.js profile1 --wait-between 5000 --wait-response 60000

  # Save AX snapshots
  node douyin-automation-ax.js profile1 --ax-files --ax-cdp
`);
}

const url = 'https://www.douyin.com/aisearch';

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
const filename = `douyin_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);
const axDir = axFiles ? path.join(outputDir, 'ax_snapshots', `douyin_${timeStr}`) : null;

// Ensure directories
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
let questionCount = 0;

// Load questions from YAML
function loadQuestions(filepath) {
    try {
        const fileContent = fs.readFileSync(filepath, 'utf8');
        const data = yaml.load(fileContent);

        if (!data.questions || !Array.isArray(data.questions)) {
            throw new Error('YAML file must contain a "questions" array');
        }

        return data.questions;
    } catch (e) {
        console.error(`Error loading questions file: ${e.message}`);
        console.log('\nExpected format:');
        console.log('questions:');
        console.log('  - "Question 1"');
        console.log('  - "Question 2"');
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
        console.error("Error starting profile (might already be running):", e.message);
    }
}

// Filter AX tree by roles
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

// Capture AX tree using Playwright
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

    const entry = {
        type: 'ax_snapshot',
        label: label,
        timestamp: timestamp,
        method: usedMethod,
        tree: tree
    };

    stream.write(JSON.stringify(entry) + '\n');

    if (axFiles && axDir) {
        const axFilename = `${label}_${axSnapshotCount}.json`;
        const axPath = path.join(axDir, axFilename);
        fs.writeFileSync(axPath, JSON.stringify({
            label,
            timestamp,
            method: usedMethod,
            tree
        }, null, 2));
    }

    console.log(`  ✓ AX snapshot #${axSnapshotCount} (${label}) via ${usedMethod}`);
}

// Wait for response to complete
async function waitForResponseComplete(page, maxWait) {
    const startTime = Date.now();
    
    try {
        // Wait a bit for the response to start generating
        await new Promise(r => setTimeout(r, 2000));

        // Poll for response completion indicators
        while (Date.now() - startTime < maxWait) {
            const isComplete = await page.evaluate(() => {
                // Check for common Douyin AI search response indicators
                // Look for response container
                const responseContainer = document.querySelector('[class*="answer"]') || 
                                         document.querySelector('[class*="response"]') ||
                                         document.querySelector('[class*="result"]');
                
                if (!responseContainer) return false;

                // Check if there's a loading indicator
                const loading = document.querySelector('[class*="loading"]') ||
                               document.querySelector('[class*="generating"]') ||
                               document.querySelector('.spinner');
                
                // If no loading indicator and response exists, assume complete
                return !loading && responseContainer.textContent.length > 50;
            });

            if (isComplete) {
                console.log('  ✓ Response appears complete');
                return true;
            }

            await new Promise(r => setTimeout(r, 500));
        }

        console.log('  ⚠ Response timeout - continuing anyway');
        return false;
    } catch (e) {
        console.error(`  ✗ Error waiting for response: ${e.message}`);
        return false;
    }
}

// Ask a question
async function askQuestion(page, question, stream) {
    questionCount++;
    
    try {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`Question ${questionCount}: ${question}`);
        console.log('─'.repeat(60));

        // Wait a moment to ensure page is stable
        await new Promise(r => setTimeout(r, 1000));

        // Multiple selector strategies for the Douyin AI search input
        const inputSelectors = [
            '#input_ai_search',
            'div#input_ai_search',
            '[contenteditable="true"]#input_ai_search',
            'div.input_blVmyq',
            '[contenteditable="true"][data-placeholder*="AI"]',
            '[contenteditable="true"][data-placeholder*="答案"]'
        ];

        console.log('  → Finding input field...');
        let inputElement = null;
        let usedSelector = null;

        for (const selector of inputSelectors) {
            try {
                console.log(`     Trying: ${selector}...`);
                inputElement = await page.waitForSelector(selector, {
                    timeout: 5000,
                    state: 'visible'
                });
                if (inputElement) {
                    usedSelector = selector;
                    console.log(`  ✓ Found input: ${selector}`);
                    break;
                }
            } catch (e) {
                console.log(`     ✗ Not found: ${selector}`);
                continue;
            }
        }

        if (!inputElement) {
            // Last resort: check if ANY contenteditable exists
            console.log('  → Checking for any contenteditable element...');
            try {
                const anyEditable = await page.$('[contenteditable="true"]');
                if (anyEditable) {
                    console.log('  ⚠ Found a contenteditable but it did not match selectors');
                    inputElement = anyEditable;
                    usedSelector = '[contenteditable="true"]';
                } else {
                    throw new Error('Could not find input field with any known selector');
                }
            } catch (e) {
                throw new Error('Could not find input field with any known selector');
            }
        }

        // Clear any existing text
        console.log('  → Clearing input...');
        await page.evaluate((selector) => {
            const el = document.querySelector(selector);
            if (el) {
                // Clear all possible text content
                el.textContent = '';
                el.innerText = '';
                el.innerHTML = '';
                // Remove focus and refocus to reset state
                el.blur();
            }
        }, usedSelector);
        
        await new Promise(r => setTimeout(r, 200));

        // Focus and type the question
        console.log('  → Focusing and typing question...');
        await inputElement.click();
        await new Promise(r => setTimeout(r, 300));
        await page.keyboard.type(question, {
            delay: 80
        });

        // Wait a bit for any autocomplete to settle
        await new Promise(r => setTimeout(r, 500));

        // Capture AX tree before submit
        console.log('  → Capturing pre-submit state...');
        await captureAxTree(page, stream, `q${questionCount}_before_submit`);

        // Find and click submit button
        console.log('  → Finding submit button...');
        const buttonSelectors = [
            'button[class*="search"]',
            'button[class*="submit"]',
            'button[type="submit"]',
            '[class*="search"] button',
            'button[aria-label*="搜索"]',
            'button[aria-label*="提交"]'
        ];

        let submitButton = null;
        let usedButtonSelector = null;

        for (const selector of buttonSelectors) {
            try {
                submitButton = await page.waitForSelector(selector, {
                    timeout: 3000,
                    state: 'visible'
                });
                if (submitButton) {
                    usedButtonSelector = selector;
                    console.log(`  ✓ Found button: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!submitButton) {
            // Fallback: try pressing Enter
            console.log('  → Submit button not found, trying Enter key...');
            await page.evaluate((args) => {
                const el = document.querySelector(args.selector);
                if (el) el.focus();
            }, {
                selector: usedSelector
            });
            await page.keyboard.press('Enter');
        } else {
            // Click the button
            console.log('  → Clicking submit button...');
            await submitButton.click();
        }

        // Wait for response to start and complete
        const responseComplete = await waitForResponseComplete(page, waitForResponse);

        if (responseComplete) {
            // Capture AX tree after response
            console.log('  → Capturing response state...');
            await captureAxTree(page, stream, `q${questionCount}_after_response`);

            // Extract the response text
            console.log('  → Extracting response...');
            const responseText = await page.evaluate(() => {
                // Try multiple selectors for the answer container
                const selectors = [
                    '[class*="answer"]',
                    '[class*="response"]',
                    '[class*="result"]',
                    'main',
                    '[role="main"]'
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText && el.innerText.length > 50) {
                        return el.innerText;
                    }
                }

                // Fallback: get the whole page
                return document.body.innerText;
            });

            // Log the response
            const responseData = {
                type: 'response',
                question_id: questionCount,
                question: question,
                response: responseText.substring(0, 5000) + (responseText.length > 5000 ? '...' : ''),
                response_length: responseText.length,
                timestamp: new Date().toISOString()
            };
            stream.write(JSON.stringify(responseData) + '\n');

            console.log(`  ✓ Question ${questionCount} complete (response: ${responseText.length} chars)`);
        } else {
            console.log(`  ⚠ Question ${questionCount} may be incomplete`);
        }

        return true;
    } catch (e) {
        console.error(`  ✗ Error asking question: ${e.message}`);

        const errorData = {
            type: 'error',
            question_id: questionCount,
            question: question,
            error: e.message,
            timestamp: new Date().toISOString()
        };
        stream.write(JSON.stringify(errorData) + '\n');

        return false;
    }
}

async function main() {
    // Load questions
    console.log(`\nLoading questions from: ${questionsFile}`);
    const questions = loadQuestions(questionsFile);
    console.log(`✓ Loaded ${questions.length} question(s)\n`);

    await startProfile(profileName, headless);

    console.log(`${'='.repeat(60)}`);
    console.log(`Profile: ${profileName}`);
    console.log(`Questions: ${questions.length}`);
    console.log(`Wait between: ${waitBetweenQuestions}ms`);
    console.log(`Wait for response: ${waitForResponse}ms`);
    console.log(`Output: ${outputPath}`);
    if (axFiles) console.log(`AX Files: ${axDir}`);
    console.log(`${'='.repeat(60)}\n`);

    // Create a write stream
    const stream = fs.createWriteStream(outputPath, {
        flags: 'a'
    });

    // Handle cleanup
    const cleanup = async () => {
        console.log('\n\nStopping automation...');
        stream.end();
        await manager.disconnectAll();
        console.log(`\nComplete!`);
        console.log(`  Questions asked: ${questionCount}/${questions.length}`);
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
                    headers: request.headers()
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {
                // Ignore
            }
        });

        page.on('response', async response => {
            try {
                let body = null;
                const resourceType = response.request().resourceType();
                const contentType = response.headers()['content-type'] || '';

                if (['xhr', 'fetch'].includes(resourceType) ||
                    contentType.includes('json')) {
                    try {
                        body = await response.text();
                    } catch (e) {
                        body = '[Body unavailable]';
                    }
                }

                const data = {
                    type: 'response',
                    timestamp: new Date().toISOString(),
                    url: response.url(),
                    status: response.status(),
                    body: body
                };
                stream.write(JSON.stringify(data) + '\n');
            } catch (e) {
                // Ignore
            }
        });

        // Navigate with more lenient strategy for Douyin
        console.log('Attempting navigation with domcontentloaded strategy...');
        try {
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000
            });
            console.log('✓ Page navigation complete (domcontentloaded)');
        } catch (e) {
            console.log('⚠ Navigation with domcontentloaded failed, trying load strategy...');
            await page.goto(url, {
                waitUntil: 'load',
                timeout: 60000
            });
            console.log('✓ Page navigation complete (load)');
        }

        // Wait for page to settle
        console.log('Waiting for page to settle...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('✓ Page loaded\n');

        // Wait for the search input to be available
        console.log('Waiting for search interface to load...');
        try {
            await page.waitForSelector('#input_ai_search', {
                timeout: 30000,
                state: 'visible'
            });
            console.log('✓ Search interface ready (#input_ai_search found)\n');
        } catch (e) {
            console.log('⚠ #input_ai_search not found, trying alternative selectors...');
            try {
                await page.waitForSelector('[contenteditable="true"]', {
                    timeout: 10000,
                    state: 'visible'
                });
                console.log('✓ Found contenteditable element\n');
            } catch (e2) {
                console.log('⚠ Search interface not detected, continuing anyway...\n');
            }
        }

        // Capture initial state
        console.log('Capturing initial page state...');
        await captureAxTree(page, stream, 'initial_load');

        // Wait a bit for any animations to settle
        await new Promise(r => setTimeout(r, 2000));

        // Process each question
        for (let i = 0; i < questions.length; i++) {
            const question = questions[i];

            const success = await askQuestion(page, question, stream);

            // Wait between questions (except after the last one)
            if (i < questions.length - 1) {
                console.log(`\n  ⏸  Waiting ${waitBetweenQuestions}ms before next question...`);
                await new Promise(r => setTimeout(r, waitBetweenQuestions));
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`All ${questions.length} questions completed!`);
        console.log('='.repeat(60));

        // Final cleanup
        await cleanup();

    } catch (err) {
        console.error('\n✗ Error:', err);
        stream.end();
        process.exit(1);
    }
}

main();
