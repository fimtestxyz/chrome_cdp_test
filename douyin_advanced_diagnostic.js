const ChromeProfileManager = require('./chrome-profile-manager');
const path = require('path');
const fs = require('fs');

const url = 'https://www.douyin.com/aisearch';
const profileName = process.argv[2] || 'profile1';

async function advancedDiagnostic() {
    console.log('\n=== Advanced Douyin Diagnostic ===\n');
    
    const manager = new ChromeProfileManager();
    const outputDir = path.join(__dirname, 'payload');
    
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
        
        console.log('Waiting 5 seconds for page to settle...');
        await new Promise(r => setTimeout(r, 5000));
        
        // Take screenshot immediately
        console.log('\n1. Taking screenshot...');
        const screenshotPath = path.join(outputDir, 'douyin_advanced_diagnostic.png');
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`   ✓ Saved to: ${screenshotPath}`);
        
        // Check page title and URL
        console.log('\n2. Page Info:');
        const title = await page.title();
        const currentUrl = page.url();
        console.log(`   Title: ${title}`);
        console.log(`   URL: ${currentUrl}`);
        
        // Check for iframes
        console.log('\n3. Checking for iframes...');
        const iframeInfo = await page.evaluate(() => {
            const iframes = document.querySelectorAll('iframe');
            return {
                count: iframes.length,
                details: Array.from(iframes).map((iframe, i) => ({
                    index: i,
                    id: iframe.id || null,
                    class: iframe.className || null,
                    src: iframe.src || null,
                    name: iframe.name || null
                }))
            };
        });
        
        console.log(`   Found ${iframeInfo.count} iframe(s)`);
        if (iframeInfo.count > 0) {
            console.log('   Details:', JSON.stringify(iframeInfo.details, null, 2));
        }
        
        // Try to search in iframes
        if (iframeInfo.count > 0) {
            console.log('\n4. Searching for input in iframes...');
            const frames = page.frames();
            console.log(`   Total frames: ${frames.length}`);
            
            for (let i = 0; i < frames.length; i++) {
                const frame = frames[i];
                try {
                    const frameUrl = frame.url();
                    console.log(`   Frame ${i}: ${frameUrl}`);
                    
                    // Try to find input in this frame
                    const inputInFrame = await frame.$('#input_ai_search');
                    if (inputInFrame) {
                        console.log(`   ✓✓✓ FOUND #input_ai_search in frame ${i}! ✓✓✓`);
                    }
                    
                    const editableInFrame = await frame.$('[contenteditable="true"]');
                    if (editableInFrame) {
                        console.log(`   ✓✓✓ FOUND contenteditable in frame ${i}! ✓✓✓`);
                    }
                } catch (e) {
                    console.log(`   Frame ${i} error: ${e.message}`);
                }
            }
        }
        
        // Check for shadow DOM
        console.log('\n5. Checking for Shadow DOM...');
        const shadowInfo = await page.evaluate(() => {
            const allElements = document.querySelectorAll('*');
            const shadowHosts = [];
            
            allElements.forEach(el => {
                if (el.shadowRoot) {
                    const inputInShadow = el.shadowRoot.querySelector('#input_ai_search');
                    const editableInShadow = el.shadowRoot.querySelector('[contenteditable="true"]');
                    
                    shadowHosts.push({
                        host: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ')[0] : ''),
                        hasInputAiSearch: !!inputInShadow,
                        hasContenteditable: !!editableInShadow
                    });
                }
            });
            
            return shadowHosts;
        });
        
        if (shadowInfo.length > 0) {
            console.log(`   Found ${shadowInfo.length} shadow DOM host(s):`);
            console.log(JSON.stringify(shadowInfo, null, 2));
        } else {
            console.log('   No shadow DOM found');
        }
        
        // Check what contenteditable elements exist
        console.log('\n6. All contenteditable elements on page:');
        const allEditables = await page.evaluate(() => {
            const editables = document.querySelectorAll('[contenteditable="true"]');
            return {
                count: editables.length,
                details: Array.from(editables).map(el => ({
                    tag: el.tagName,
                    id: el.id || null,
                    class: el.className || null,
                    placeholder: el.getAttribute('data-placeholder') || el.getAttribute('placeholder') || null,
                    visible: el.offsetParent !== null,
                    text: el.innerText?.substring(0, 30) || null
                }))
            };
        });
        
        console.log(`   Found ${allEditables.count} contenteditable element(s)`);
        if (allEditables.count > 0) {
            console.log(JSON.stringify(allEditables.details, null, 2));
        }
        
        // Check page visibility state
        console.log('\n7. Page state:');
        const pageState = await page.evaluate(() => ({
            visibilityState: document.visibilityState,
            readyState: document.readyState,
            bodyExists: !!document.body,
            bodyVisible: document.body ? document.body.offsetParent !== null : false
        }));
        console.log(JSON.stringify(pageState, null, 2));
        
        // Check for any error messages or overlays
        console.log('\n8. Checking for error messages or overlays:');
        const errorCheck = await page.evaluate(() => {
            const body = document.body.innerText || '';
            const keywords = ['验证', '登录', 'login', 'verify', '错误', 'error', '403', '404', '无法访问', 'blocked'];
            
            const found = keywords.filter(kw => body.toLowerCase().includes(kw.toLowerCase()));
            
            return {
                bodyTextLength: body.length,
                suspiciousKeywords: found,
                bodyPreview: body.substring(0, 200)
            };
        });
        
        console.log(JSON.stringify(errorCheck, null, 2));
        
        // Try different wait strategies
        console.log('\n9. Trying to wait for #input_ai_search with different strategies:');
        
        // Strategy 1: Wait for selector
        try {
            console.log('   Strategy 1: waitForSelector with attached state...');
            await page.waitForSelector('#input_ai_search', { 
                timeout: 5000, 
                state: 'attached' 
            });
            console.log('   ✓ Found with attached state!');
        } catch (e) {
            console.log(`   ✗ ${e.message}`);
        }
        
        // Strategy 2: Direct query
        try {
            console.log('   Strategy 2: Direct $ query...');
            const el = await page.$('#input_ai_search');
            console.log(`   Result: ${el ? '✓ FOUND' : '✗ Not found'}`);
        } catch (e) {
            console.log(`   ✗ ${e.message}`);
        }
        
        // Strategy 3: Evaluate
        try {
            console.log('   Strategy 3: page.evaluate check...');
            const exists = await page.evaluate(() => {
                const el = document.querySelector('#input_ai_search');
                return {
                    exists: !!el,
                    visible: el ? el.offsetParent !== null : false,
                    id: el ? el.id : null,
                    class: el ? el.className : null
                };
            });
            console.log(`   Result:`, JSON.stringify(exists, null, 2));
        } catch (e) {
            console.log(`   ✗ ${e.message}`);
        }
        
        // Get full page HTML
        console.log('\n10. Saving full page HTML...');
        const htmlPath = path.join(outputDir, 'douyin_advanced_diagnostic.html');
        const fullHtml = await page.content();
        fs.writeFileSync(htmlPath, fullHtml);
        console.log(`   ✓ Saved to: ${htmlPath}`);
        console.log(`   HTML length: ${fullHtml.length} characters`);
        
        // Console logs and errors
        console.log('\n11. Capturing console messages for 3 seconds...');
        const consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push({
                type: msg.type(),
                text: msg.text()
            });
        });
        
        await new Promise(r => setTimeout(r, 3000));
        
        if (consoleLogs.length > 0) {
            console.log(`   Captured ${consoleLogs.length} console messages:`);
            consoleLogs.forEach(log => {
                console.log(`   [${log.type}] ${log.text}`);
            });
        } else {
            console.log('   No console messages captured');
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('DIAGNOSTIC COMPLETE');
        console.log('='.repeat(60));
        console.log(`\nFiles saved:`);
        console.log(`  Screenshot: ${screenshotPath}`);
        console.log(`  HTML: ${htmlPath}`);
        console.log(`\nPress Ctrl+C to exit (browser will stay open for manual inspection)`);
        
        // Keep alive for manual inspection
        await new Promise(() => {});
        
    } catch (err) {
        console.error('\n✗ Error:', err);
        await manager.disconnectAll();
        process.exit(1);
    }
}

process.on('SIGINT', async () => {
    console.log('\n\nExiting...');
    process.exit(0);
});

advancedDiagnostic();
