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
let questionsFile = 'inputs/perplexity.yml';
let axWatch = null;
let axFiles = false;
let axRoles = null;
let axMethod = 'playwright';
let waitBetweenQuestions = 3000; // Default 3 seconds between questions
let waitForResponse = 30000; // Default 30 seconds max wait for response

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
Usage: node perplexity-automation.js [profile] [options]

Arguments:
  profile              Chrome profile name (default: profile1)

Options:
  -q, --questions FILE Questions YAML file (default: inputs/perplexity.yml)
  --wait-between MS    Milliseconds to wait between questions (default: 3000)
  --wait-response MS   Max milliseconds to wait for response (default: 30000)
  --ax-watch N         Capture AX tree every N milliseconds
  --ax-files           Save AX snapshots to separate files
  --ax-roles R         Filter AX tree by roles (comma-separated)
  --ax-cdp             Use raw CDP instead of Playwright's snapshot
  -h, --help           Show this help message

YAML File Format:
  questions:
    - "What is machine learning?"
    - "Explain quantum computing"
    - "Best practices for API design"

Examples:
  # Basic usage
  node perplexity-automation.js profile1

  # Custom questions file
  node perplexity-automation.js profile1 --questions my-questions.yml

  # Adjust timing
  node perplexity-automation.js profile1 --wait-between 5000 --wait-response 60000

  # Save AX snapshots
  node perplexity-automation.js profile1 --ax-files --ax-cdp
`);
}

const url = 'https://www.perplexity.ai';

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
const filename = `perplexity_${timeStr}.jsonl`;
const outputDir = path.join(__dirname, 'payload');
const outputPath = path.join(outputDir, filename);
const axDir = axFiles ? path.join(outputDir, 'ax_snapshots', `perplexity_${timeStr}`) : null;

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

async function startProfile(name) {
    console.log(`Starting profile ${name}...`);
    try {
        const scriptPath = path.join(__dirname, 'chrome-profile-manager.sh');
        execSync(`"${scriptPath}" start ${name}`, {
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

    const data = {
        type: 'accessibility',
        method: usedMethod,
        snapshot_id: axSnapshotCount,
        question_id: questionCount,
        label: label,
        timestamp: timestamp,
        tree: tree
    };

    stream.write(JSON.stringify(data) + '\n');

    if (axFiles && axDir) {
        const axFilename = `ax_${axSnapshotCount}_q${questionCount}_${label}_${Date.now()}.json`;
        const axPath = path.join(axDir, axFilename);
        fs.writeFileSync(axPath, JSON.stringify(data, null, 2));
    }

    console.log(`  ✓ Captured AX tree #${axSnapshotCount} (${countNodes(tree)} nodes)`);
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

// Wait for Perplexity response to complete
async function waitForResponseComplete(page, timeout = 30000) {
    const startTime = Date.now();

    console.log('  ⏳ Waiting for response...');

    try {
        // Wait a minimum of 2 seconds for response to start
        await new Promise(r => setTimeout(r, 2000));

        // Use MutationObserver to detect when answer content changes
        const answerComplete = await page.evaluate((maxTimeout) => {
            return new Promise((resolve) => {
                // Try to find answer container
                const containerSelectors = [
                    '[data-testid="answers"]',
                    '[data-testid*="answer"]',
                    'div.results',
                    'main',
                    'div[role="main"]',
                    'body'
                ];

                let container = null;
                for (const sel of containerSelectors) {
                    container = document.querySelector(sel);
                    if (container) break;
                }

                if (!container) {
                    resolve(false);
                    return;
                }

                let lastText = container.innerText || '';
                let stableCount = 0;
                let changeDetected = false;

                const observer = new MutationObserver(() => {
                    const currentText = container.innerText || '';

                    // Detect if content has changed
                    if (currentText !== lastText) {
                        changeDetected = true;
                        stableCount = 0;
                        lastText = currentText;
                    } else if (changeDetected) {
                        // Content has stopped changing
                        stableCount++;
                        if (stableCount >= 5) {
                            // Stable for 5 checks (~2.5 seconds)
                            observer.disconnect();
                            resolve(true);
                        }
                    }
                });

                observer.observe(container, {
                    childList: true,
                    subtree: true,
                    characterData: true
                });

                // Check every 500ms
                const checkInterval = setInterval(() => {
                    const currentText = container.innerText || '';
                    if (currentText !== lastText) {
                        changeDetected = true;
                        stableCount = 0;
                        lastText = currentText;
                    } else if (changeDetected) {
                        stableCount++;
                        if (stableCount >= 5) {
                            clearInterval(checkInterval);
                            observer.disconnect();
                            resolve(true);
                        }
                    }
                }, 500);

                // Timeout
                setTimeout(() => {
                    clearInterval(checkInterval);
                    observer.disconnect();
                    resolve(changeDetected); // Return true if any change was detected
                }, maxTimeout);
            });
        }, timeout - 2000);

        if (answerComplete) {
            console.log('  ✓ Response complete');
            return true;
        } else {
            console.log('  ⚠ Timeout or no response detected');
            return false;
        }
    } catch (e) {
        console.error('  ✗ Error waiting for response:', e.message);
        return false;
    }
}

// Ask a question on Perplexity
async function askQuestion(page, question, stream) {
    questionCount++;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`Question ${questionCount}: ${question}`);
    console.log('─'.repeat(60));

    // Log the question
    const questionData = {
        type: 'question',
        question_id: questionCount,
        question: question,
        timestamp: new Date().toISOString()
    };
    stream.write(JSON.stringify(questionData) + '\n');

    try {
        // Find the input field - Perplexity uses contenteditable <p> inside div#ask-input
        console.log('  → Finding input field...');
        const inputSelectors = [
            'div#ask-input > p',
            'div[aria-placeholder*="Ask"]',
            'div#ask-input p[contenteditable]',
            '[contenteditable][placeholder*="Ask"]',

        ];

        let inputElement = null;
        let usedSelector = null;

        for (const selector of inputSelectors) {
            try {
                inputElement = await page.waitForSelector(selector, {
                    timeout: 5000
                });
                if (inputElement) {
                    usedSelector = selector;
                    console.log(`  ✓ Found input: ${selector}`);
                    break;
                }
            } catch (e) {
                continue;
            }
        }

        if (!inputElement) {
            throw new Error('Could not find input field');
        }

        // Clear any existing text
        await page.evaluate((args) => {
            const el = document.querySelector(args.selector);
            if (el) {
                if (el.isContentEditable) {
                    el.textContent = '';
                } else if ('value' in el) {
                    el.value = '';
                }
            }
        }, {
            selector: usedSelector
        });

        await new Promise(r => setTimeout(r, 300));

        // Type the question using the appropriate method
        console.log('  → Typing question...');
        await page.evaluate((args) => {
            const el = document.querySelector(args.selector);
            if (!el) return;

            // For contenteditable elements
            if (el.isContentEditable) {
                el.focus();
                el.textContent = args.text;
                el.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    cancelable: true,
                    data: args.text,
                    inputType: 'insertText'
                }));
            }
            // For textarea/input elements
            else if ('value' in el) {
                el.focus();
                el.value = args.text;
                el.dispatchEvent(new Event('input', {
                    bubbles: true
                }));
            }
        }, {
            selector: usedSelector,
            text: question
        });

        // Wait a moment for input to register
        await new Promise(r => setTimeout(r, 500));

        // Capture AX tree before submit
        console.log('  → Capturing pre-submit state...');
        await captureAxTree(page, stream, `q${questionCount}_before_submit`);

        // Find and click submit button
        console.log('  → Finding submit button...');
        const buttonSelectors = [
            'button[data-testid="submit-button"]',
            'button[aria-label*="Submit"]',
            'button[type="submit"]',
            'div#ask-input button'
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
                    '[data-testid="answers"]',
                    '[data-testid*="answer"]',
                    'div.results',
                    'main',
                    'div[role="main"]'
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el && el.innerText) {
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

    await startProfile(profileName);

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

        // Navigate and wait for page load
        await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: 60000
        });

        console.log('✓ Page loaded\n');

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