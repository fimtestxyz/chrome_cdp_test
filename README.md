# Chrome Profile Manager with CDP

A comprehensive solution for managing multiple Chrome profiles with Chrome DevTools Protocol (CDP) and Playwright on Mac.

## Features

- ✅ Create and manage multiple Chrome profiles
- ✅ Start/stop Chrome instances with remote debugging enabled
- ✅ Connect to Chrome via CDP using Playwright
- ✅ Full browser automation capabilities
- ✅ Cookie and localStorage management
- ✅ Screenshot capture
- ✅ Multi-profile support

## Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Make the shell script executable:**
```bash
chmod +x chrome-profile-manager.sh
```

## Quick Start

### 1. Create a Chrome Profile

```bash
# Create a profile named "profile1" on port 9222 (default)
./chrome-profile-manager.sh create profile1

# Create a profile on custom port
./chrome-profile-manager.sh create profile2 9223
```

### 2. Start Chrome with the Profile

```bash
./chrome-profile-manager.sh start profile1
```

This will:
- Start Chrome with remote debugging enabled
- Open on the specified port (9222 by default)
- Keep the profile data in `./chrome-profiles/profile1/`

### 3. Use Playwright to Control Chrome

```javascript
const ChromeProfileManager = require('./chrome-profile-manager');

const manager = new ChromeProfileManager();

// Navigate to a URL
await manager.navigate('profile1', 'https://example.com');

// Take a screenshot
await manager.screenshot('profile1', './screenshot.png');

// Get page title
const title = await manager.getTitle('profile1');
console.log('Title:', title);

// Clean up
await manager.disconnectAll();
```

## Shell Script Commands

### Create a Profile
```bash
./chrome-profile-manager.sh create <profile-name> [port]
```
Example: `./chrome-profile-manager.sh create myprofile 9222`

### Start a Profile
```bash
./chrome-profile-manager.sh start <profile-name>
```
Example: `./chrome-profile-manager.sh start myprofile`

### Stop a Profile
```bash
./chrome-profile-manager.sh stop <profile-name>
```
Example: `./chrome-profile-manager.sh stop myprofile`

### List All Profiles
```bash
./chrome-profile-manager.sh list
```

### Check Profile Status
```bash
./chrome-profile-manager.sh status [profile-name]
```
Example: `./chrome-profile-manager.sh status myprofile`

### Remove a Profile
```bash
./chrome-profile-manager.sh remove <profile-name>
```
Example: `./chrome-profile-manager.sh remove myprofile`

## Playwright API

### Initialize Manager

```javascript
const ChromeProfileManager = require('./chrome-profile-manager');
const manager = new ChromeProfileManager();
```

### Navigation

```javascript
// Navigate to URL
await manager.navigate('profile1', 'https://google.com');

// Get current URL
const url = await manager.getURL('profile1');

// Get page title
const title = await manager.getTitle('profile1');
```

### Screenshots

```javascript
await manager.screenshot('profile1', './output.png', {
  screenshotOptions: {
    fullPage: true
  }
});
```

### Element Interaction

```javascript
// Wait for element
await manager.waitForSelector('profile1', '#search-box');

// Click element
await manager.click('profile1', 'button.submit');

// Type text
await manager.type('profile1', 'input[name="q"]', 'search query');
```

### Cookies

```javascript
// Get all cookies
const cookies = await manager.getCookies('profile1');

// Set cookies
await manager.setCookies('profile1', [
  {
    name: 'session',
    value: 'abc123',
    domain: 'example.com',
    path: '/'
  }
]);

// Clear cookies
await manager.clearCookies('profile1');
```

### LocalStorage

```javascript
// Get localStorage
const storage = await manager.getLocalStorage('profile1');

// Set localStorage
await manager.setLocalStorage('profile1', {
  'key1': 'value1',
  'key2': 'value2'
});
```

### JavaScript Evaluation

```javascript
// Evaluate JavaScript
const result = await manager.evaluate('profile1', () => {
  return {
    title: document.title,
    url: window.location.href,
    links: document.querySelectorAll('a').length
  };
});
```

### Custom Execution

```javascript
// Execute custom code with full access
await manager.execute('profile1', async ({ browser, context, page }) => {
  // Your custom code here
  const links = await page.$$eval('a', anchors => 
    anchors.map(a => a.href)
  );
  console.log('Links:', links);
});
```

### Working with Multiple Pages

```javascript
// Get all pages
const pages = await manager.getAllPages('profile1');
console.log('Number of pages:', pages.length);

// Close a specific page
await manager.closePage('profile1', 0); // Close first page
```

### Connection Management

```javascript
// Connect to profile
const browser = await manager.connect('profile1');

// Disconnect from specific profile
await manager.disconnect('profile1');

// Disconnect from all profiles
await manager.disconnectAll();
```

### List Profiles

```javascript
const profiles = await manager.listProfiles();
console.log('Available profiles:', profiles);
// Output: [{ name: 'profile1', port: 9222, created: '2024-...' }]
```

## Running Examples

Run the provided examples:

```bash
# Make sure Chrome is started first
./chrome-profile-manager.sh start profile1

# Run examples
npm run example
```

Or run directly:
```bash
node example.js
```

## Directory Structure

```
chrome_cdp_test/
├── chrome-profile-manager.sh    # Shell script for profile management
├── chrome-profile-manager.js    # Playwright manager class
├── example.js                   # Usage examples
├── package.json                 # Node.js dependencies
├── README.md                    # This file
├── chrome-profiles/             # Profile data (created automatically)
│   ├── profile1/
│   │   ├── config.json
│   │   └── [Chrome user data]
│   └── profile2/
│       └── ...
└── .pids/                       # Process IDs (created automatically)
    ├── profile1.pid
    └── profile2.pid
```

## Troubleshooting

### Chrome won't start
- Check if Chrome is installed at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Check if the port is already in use: `lsof -i :9222`
- Check the log file: `cat chrome-profiles/profile1/chrome.log`

### Can't connect with Playwright
- Make sure Chrome is running: `./chrome-profile-manager.sh status profile1`
- Verify the CDP endpoint is accessible: `curl http://localhost:9222/json/version`
- Check if the profile exists: `./chrome-profile-manager.sh list`

### Port conflicts
- Create profiles with different ports:
  ```bash
  ./chrome-profile-manager.sh create profile1 9222
  ./chrome-profile-manager.sh create profile2 9223
  ./chrome-profile-manager.sh create profile3 9224
  ```

## Advanced Usage

### Using with Different Chrome Paths

If Chrome is installed in a different location, edit the shell script:

```bash
# Edit chrome-profile-manager.sh
CHROME_PATH="/path/to/your/chrome"
```

### Debugging

View Chrome logs:
```bash
tail -f chrome-profiles/profile1/chrome.log
```

Get WebSocket URL:
```javascript
const wsUrl = await manager.getWebSocketURL('profile1');
console.log('WebSocket URL:', wsUrl);
```

## Notes

- Each profile maintains its own cookies, localStorage, extensions, and browsing data
- Profiles are independent and can run simultaneously on different ports
- Chrome must be running (via the shell script) before Playwright can connect
- The shell script handles process management and cleanup

## License

MIT
