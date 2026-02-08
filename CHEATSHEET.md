# Chrome Profile Manager - Quick Reference

## Shell Commands

### Profile Management
```bash
# Create new profile
./chrome-profile-manager.sh create <name> [port]

# Start profile
./chrome-profile-manager.sh start <name>

# Stop profile
./chrome-profile-manager.sh stop <name>

# List all profiles
./chrome-profile-manager.sh list

# Check status
./chrome-profile-manager.sh status [name]

# Remove profile
./chrome-profile-manager.sh remove <name>
```

### Common Examples
```bash
# Create and start
./chrome-profile-manager.sh create myprofile 9222
./chrome-profile-manager.sh start myprofile

# Multiple profiles
./chrome-profile-manager.sh create profile1 9222
./chrome-profile-manager.sh create profile2 9223
./chrome-profile-manager.sh start profile1
./chrome-profile-manager.sh start profile2
```

## Playwright API

### Basic Setup
```javascript
const ChromeProfileManager = require('./chrome-profile-manager');
const manager = new ChromeProfileManager();

// Always clean up when done
await manager.disconnectAll();
```

### Navigation
```javascript
await manager.navigate('profile1', 'https://example.com');
const url = await manager.getURL('profile1');
const title = await manager.getTitle('profile1');
```

### Element Interaction
```javascript
await manager.waitForSelector('profile1', '#myElement');
await manager.click('profile1', 'button.submit');
await manager.type('profile1', 'input[name="search"]', 'text');
```

### Screenshots
```javascript
await manager.screenshot('profile1', './output.png');
await manager.screenshot('profile1', './full.png', {
  screenshotOptions: { fullPage: true }
});
```

### Data Management
```javascript
// Cookies
const cookies = await manager.getCookies('profile1');
await manager.setCookies('profile1', [...]);
await manager.clearCookies('profile1');

// LocalStorage
const storage = await manager.getLocalStorage('profile1');
await manager.setLocalStorage('profile1', { key: 'value' });
```

### JavaScript Execution
```javascript
const result = await manager.evaluate('profile1', () => {
  return document.title;
});
```

### Custom Code
```javascript
await manager.execute('profile1', async ({ browser, context, page }) => {
  // Full access to Playwright objects
  const links = await page.$$eval('a', a => a.map(el => el.href));
  console.log(links);
});
```

### Multiple Pages
```javascript
const pages = await manager.getAllPages('profile1');
await manager.closePage('profile1', 0);
```

## Workflow Example

```bash
# Terminal 1: Start Chrome
./chrome-profile-manager.sh create myprofile 9222
./chrome-profile-manager.sh start myprofile
```

```javascript
// Terminal 2: Run automation
const manager = new ChromeProfileManager();

try {
  await manager.navigate('myprofile', 'https://example.com');
  await manager.screenshot('myprofile', './screenshot.png');
  const title = await manager.getTitle('myprofile');
  console.log('Title:', title);
} finally {
  await manager.disconnectAll();
}
```

## Troubleshooting

### Can't connect to Chrome
```bash
# Check if Chrome is running
./chrome-profile-manager.sh status profile1

# Verify endpoint
curl http://localhost:9222/json/version

# Check logs
cat chrome-profiles/profile1/chrome.log
```

### Port conflicts
```bash
# Check port usage
lsof -i :9222

# Use different port
./chrome-profile-manager.sh create profile2 9223
```

### Profile not found
```bash
# List all profiles
./chrome-profile-manager.sh list

# Create if missing
./chrome-profile-manager.sh create profile1
```

## Tips & Tricks

1. **Start Chrome before connecting**: Always start the Chrome profile with the shell script before using Playwright

2. **Multiple profiles**: Each profile is independent - you can run many simultaneously on different ports

3. **Persistent data**: Each profile maintains its own cookies, localStorage, and browsing data

4. **Error handling**: Always wrap Playwright code in try/finally to ensure cleanup

5. **Debugging**: Check `chrome-profiles/[name]/chrome.log` for Chrome errors

## Quick Test

```bash
# 1. Run setup
./setup.sh

# 2. Start Chrome
./chrome-profile-manager.sh start profile1

# 3. Run tests (in new terminal)
npm test

# 4. Run examples
npm run example

# 5. Stop when done
./chrome-profile-manager.sh stop profile1
```

## File Locations

- Profiles: `./chrome-profiles/`
- PIDs: `./.pids/`
- Logs: `./chrome-profiles/[name]/chrome.log`
- Screenshots: `./` (by default)

## Common Patterns

### Login and Save Session
```javascript
await manager.navigate('profile1', 'https://example.com/login');
await manager.type('profile1', '#username', 'myuser');
await manager.type('profile1', '#password', 'mypass');
await manager.click('profile1', 'button[type="submit"]');
// Session saved in profile!
```

### Scraping Multiple Pages
```javascript
const urls = ['url1', 'url2', 'url3'];
for (const url of urls) {
  await manager.navigate('profile1', url);
  const data = await manager.evaluate('profile1', () => {
    return { title: document.title };
  });
  console.log(data);
}
```

### Monitor Changes
```javascript
await manager.execute('profile1', async ({ page }) => {
  page.on('response', response => {
    console.log('Response:', response.url());
  });
  await page.goto('https://example.com');
});
```
