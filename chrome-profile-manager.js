const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

class ChromeProfileManager {
  constructor(baseDir = __dirname) {
    this.baseDir = baseDir;
    this.profilesDir = path.join(baseDir, 'chrome-profiles');
    this.browsers = new Map(); // Store active browser connections
  }

  /**
   * Get profile configuration
   */
  async getProfileConfig(profileName) {
    const configPath = path.join(this.profilesDir, profileName, 'config.json');
    try {
      const data = await fs.readFile(configPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Profile '${profileName}' not found or invalid config`);
    }
  }

  /**
   * List all available profiles
   */
  async listProfiles() {
    try {
      const entries = await fs.readdir(this.profilesDir, { withFileTypes: true });
      const profiles = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          try {
            const config = await this.getProfileConfig(entry.name);
            profiles.push({
              name: entry.name,
              port: config.port,
              created: config.created
            });
          } catch (error) {
            // Skip invalid profiles
          }
        }
      }

      return profiles;
    } catch (error) {
      return [];
    }
  }

  /**
   * Connect to Chrome instance via CDP
   */
  async connect(profileName, options = {}) {
    const config = await this.getProfileConfig(profileName);
    const cdpEndpoint = `http://localhost:${config.port}`;

    try {
      // Connect to existing Chrome instance
      const browser = await chromium.connectOverCDP(cdpEndpoint, {
        timeout: options.timeout || 30000,
      });

      // Store browser instance
      this.browsers.set(profileName, browser);

      console.log(`✓ Connected to Chrome profile '${profileName}' on port ${config.port}`);
      
      return browser;
    } catch (error) {
      throw new Error(`Failed to connect to profile '${profileName}': ${error.message}\nMake sure Chrome is running with: ./chrome-profile-manager.sh start ${profileName}`);
    }
  }

  /**
   * Get or create a new page in the browser
   */
  async getPage(profileName, options = {}) {
    let browser = this.browsers.get(profileName);

    if (!browser) {
      browser = await this.connect(profileName);
    }

    const contexts = browser.contexts();
    let context;

    if (contexts.length > 0) {
      // Use existing context
      context = contexts[0];
    } else {
      // Create new context
      context = await browser.newContext(options.contextOptions || {});
    }

    const pages = context.pages();
    let page;

    if (options.newPage || pages.length === 0) {
      page = await context.newPage();
    } else {
      page = pages[0];
    }

    return { browser, context, page };
  }

  /**
   * Execute a function on a specific profile
   */
  async execute(profileName, callback, options = {}) {
    const { browser, context, page } = await this.getPage(profileName, options);

    try {
      const result = await callback({ browser, context, page });
      return result;
    } catch (error) {
      console.error(`Error executing on profile '${profileName}':`, error);
      throw error;
    }
  }

  /**
   * Navigate to URL
   */
  async navigate(profileName, url, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      await page.goto(url, options.navigationOptions || {});
      return page;
    }, options);
  }

  /**
   * Take screenshot
   */
  async screenshot(profileName, outputPath, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      await page.screenshot({ 
        path: outputPath,
        ...options.screenshotOptions 
      });
      console.log(`✓ Screenshot saved to ${outputPath}`);
      return outputPath;
    }, options);
  }

  /**
   * Evaluate JavaScript in the page
   */
  async evaluate(profileName, script, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      return await page.evaluate(script);
    }, options);
  }

  /**
   * Get all cookies
   */
  async getCookies(profileName, options = {}) {
    return this.execute(profileName, async ({ context }) => {
      return await context.cookies();
    }, options);
  }

  /**
   * Set cookies
   */
  async setCookies(profileName, cookies, options = {}) {
    return this.execute(profileName, async ({ context }) => {
      await context.addCookies(cookies);
      console.log(`✓ Added ${cookies.length} cookie(s)`);
    }, options);
  }

  /**
   * Clear cookies
   */
  async clearCookies(profileName, options = {}) {
    return this.execute(profileName, async ({ context }) => {
      await context.clearCookies();
      console.log(`✓ Cookies cleared`);
    }, options);
  }

  /**
   * Get local storage
   */
  async getLocalStorage(profileName, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      return await page.evaluate(() => {
        return Object.keys(localStorage).reduce((acc, key) => {
          acc[key] = localStorage.getItem(key);
          return acc;
        }, {});
      });
    }, options);
  }

  /**
   * Set local storage
   */
  async setLocalStorage(profileName, data, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      await page.evaluate((items) => {
        Object.keys(items).forEach(key => {
          localStorage.setItem(key, items[key]);
        });
      }, data);
      console.log(`✓ Set ${Object.keys(data).length} local storage item(s)`);
    }, options);
  }

  /**
   * Wait for selector
   */
  async waitForSelector(profileName, selector, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      return await page.waitForSelector(selector, options.selectorOptions);
    }, options);
  }

  /**
   * Click element
   */
  async click(profileName, selector, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      await page.click(selector, options.clickOptions);
      console.log(`✓ Clicked: ${selector}`);
    }, options);
  }

  /**
   * Type text
   */
  async type(profileName, selector, text, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      await page.fill(selector, text, options.typeOptions);
      console.log(`✓ Typed into: ${selector}`);
    }, options);
  }

  /**
   * Get page title
   */
  async getTitle(profileName, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      return await page.title();
    }, options);
  }

  /**
   * Get page URL
   */
  async getURL(profileName, options = {}) {
    return this.execute(profileName, async ({ page }) => {
      return page.url();
    }, options);
  }

  /**
   * Get all pages in a profile
   */
  async getAllPages(profileName) {
    const browser = this.browsers.get(profileName);
    if (!browser) {
      throw new Error(`Not connected to profile '${profileName}'`);
    }

    const contexts = browser.contexts();
    const allPages = [];

    for (const context of contexts) {
      allPages.push(...context.pages());
    }

    return allPages;
  }

  /**
   * Close specific page
   */
  async closePage(profileName, pageIndex = 0, options = {}) {
    return this.execute(profileName, async ({ context }) => {
      const pages = context.pages();
      if (pages[pageIndex]) {
        await pages[pageIndex].close();
        console.log(`✓ Closed page ${pageIndex}`);
      }
    }, options);
  }

  /**
   * Disconnect from profile
   */
  async disconnect(profileName) {
    const browser = this.browsers.get(profileName);
    if (browser) {
      await browser.close();
      this.browsers.delete(profileName);
      console.log(`✓ Disconnected from profile '${profileName}'`);
    }
  }

  /**
   * Disconnect from all profiles
   */
  async disconnectAll() {
    const promises = Array.from(this.browsers.keys()).map(name => 
      this.disconnect(name)
    );
    await Promise.all(promises);
    console.log('✓ Disconnected from all profiles');
  }

  /**
   * Get CDP endpoint URL
   */
  async getCDPEndpoint(profileName) {
    const config = await this.getProfileConfig(profileName);
    return `http://localhost:${config.port}`;
  }

  /**
   * Get WebSocket debugger URL
   */
  async getWebSocketURL(profileName) {
    const config = await this.getProfileConfig(profileName);
    const endpoint = `http://localhost:${config.port}`;
    
    try {
      const response = await fetch(`${endpoint}/json/version`);
      const data = await response.json();
      return data.webSocketDebuggerUrl;
    } catch (error) {
      throw new Error(`Failed to get WebSocket URL: ${error.message}`);
    }
  }
}

module.exports = ChromeProfileManager;
