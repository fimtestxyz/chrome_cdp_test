const ChromeProfileManager = require('./chrome-profile-manager');
const path = require('path');

const url = 'https://www.douyin.com/aisearch';
const profileName = process.argv[2] || 'profile1';

async function diagnose() {
    console.log('\n=== Douyin Page Diagnostic Tool ===\n');

    const manager = new ChromeProfileManager();

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

        console.log('Waiting for page to settle...');
        await new Promise(r => setTimeout(r, 5000));

        console.log('\n--- Page Title ---');
        const title = await page.title();
        console.log(title);

        console.log('\n--- Checking for Input Elements ---\n');

        // Check for contenteditable divs
        const contentEditables = await page.evaluate(() => {
            const els = document.querySelectorAll('[contenteditable="true"]');
            return Array.from(els).map(el => ({
                tag: el.tagName,
                id: el.id || null,
                classes: el.className || null,
                placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || null,
                text: el.innerText ? el.innerText.substring(0, 50) : null,
                visible: el.offsetParent !== null
            }));
        });

        console.log('ContentEditable elements:');
        console.log(JSON.stringify(contentEditables, null, 2));

        // Check for input fields
        const inputs = await page.evaluate(() => {
            const els = document.querySelectorAll('input[type="text"], input:not([type]), textarea');
            return Array.from(els).map(el => ({
                tag: el.tagName,
                type: el.type || null,
                id: el.id || null,
                name: el.name || null,
                classes: el.className || null,
                placeholder: el.getAttribute('placeholder') || null,
                visible: el.offsetParent !== null
            }));
        });

        console.log('\nStandard input/textarea elements:');
        console.log(JSON.stringify(inputs, null, 2));

        // Check for elements with "search", "input", "ask" in id or class
        const searchRelated = await page.evaluate(() => {
            const all = document.querySelectorAll('*');
            const matches = [];

            for (const el of all) {
                const id = el.id || '';
                const classes = el.className || '';
                const combined = (id + ' ' + classes).toLowerCase();

                if (combined.includes('search') ||
                    combined.includes('input') ||
                    combined.includes('ask') ||
                    combined.includes('query')) {

                    // Skip if too many matches
                    if (matches.length < 20) {
                        matches.push({
                            tag: el.tagName,
                            id: el.id || null,
                            classes: typeof el.className === 'string' ? el.className : null,
                            contenteditable: el.getAttribute('contenteditable'),
                            placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || null,
                            visible: el.offsetParent !== null
                        });
                    }
                }
            }

            return matches;
        });

        console.log('\nElements with search/input/ask/query in id/class:');
        console.log(JSON.stringify(searchRelated, null, 2));

        // Check for buttons
        const buttons = await page.evaluate(() => {
            const btns = document.querySelectorAll('button');
            return Array.from(btns).slice(0, 30).map(btn => ({
                id: btn.id || null,
                classes: btn.className || null,
                type: btn.type || null,
                text: btn.innerText ? btn.innerText.substring(0, 50) : null,
                ariaLabel: btn.getAttribute('aria-label') || null,
                visible: btn.offsetParent !== null
            }));
        });

        console.log('\nButton elements (first 30):');
        console.log(JSON.stringify(buttons, null, 2));

        // Get full page HTML (truncated)
        console.log('\n--- Page Structure Sample ---');
        const bodyHtml = await page.evaluate(() => {
            return document.body.innerHTML.substring(0, 2000);
        });
        console.log(bodyHtml);

        // Take a screenshot
        const screenshotPath = path.join(__dirname, 'payload', 'douyin_diagnostic.png');
        await page.screenshot({
            path: screenshotPath,
            fullPage: false
        });
        console.log(`\n✓ Screenshot saved to: ${screenshotPath}`);

        // Save full HTML
        const htmlPath = path.join(__dirname, 'payload', 'douyin_diagnostic.html');
        const fullHtml = await page.content();
        require('fs').writeFileSync(htmlPath, fullHtml);
        console.log(`✓ Full HTML saved to: ${htmlPath}`);

        console.log('\n--- Diagnostic Complete ---');
        console.log('Please review the output above to find the correct selectors.\n');

        await manager.disconnectAll();
        process.exit(0);

    } catch (err) {
        console.error('\n✗ Error:', err);
        await manager.disconnectAll();
        process.exit(1);
    }
}

diagnose();