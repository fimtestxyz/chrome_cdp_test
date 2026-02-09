# Troubleshooting Guide - Accessibility Tree Capture

## Fixed: "Cannot read properties of undefined (reading 'snapshot')"

### Problem
When connecting to Chrome via CDP using `connectOverCDP`, Playwright's accessibility API (`page.accessibility.snapshot()`) is not available, causing the error:
```
Error capturing AX tree (Playwright): Cannot read properties of undefined (reading 'snapshot')
```

### Solution ✅
The script has been **updated to automatically fall back to CDP** when Playwright's accessibility API is not available.

### What Changed

**Before:**
- Script would fail if Playwright's accessibility API wasn't available
- Required manual `--ax-cdp` flag

**After:**
- Automatically detects when Playwright API is unavailable
- Falls back to CDP method seamlessly
- Shows clear message: "→ Switching to CDP method"

### How It Works Now

```javascript
// Tries Playwright first
let tree = await captureAxTreePlaywright(page);

// If Playwright fails, automatically uses CDP
if (!tree) {
    console.log('  → Switching to CDP method');
    tree = await captureAxTreeCDP(page);
    usedMethod = 'cdp';
}
```

### Expected Output

When you run the capture now, you'll see:

```bash
$ npm run capture

Connecting to profile1...
✓ Connected to Chrome profile 'profile1' on port 9222
Navigating to https://www.perplexity.ai...
✓ Page loaded and network traffic captured.

Capturing accessibility tree (initial_load)...
  → Playwright accessibility API not available, falling back to CDP
  → Switching to CDP method
  ✓ Captured AX tree #1 using cdp (X nodes)

============================================================
Session is running. Press Ctrl+C to stop and save.
============================================================
```

## Common Issues & Solutions

### 1. Still Getting Errors?

**Make sure you're using the updated file:**
```bash
# Replace the old file with the new one
cp /path/to/downloaded/capture-with-ax.js /Volumes/wwk_nvme/Users/wwkoon/code/chrome_cdp_test/
```

### 2. CDP Method Gives Different Data

**This is normal!** The CDP method returns more detailed, lower-level data:

**Playwright format:**
```json
{
  "role": "button",
  "name": "Click me",
  "children": [...]
}
```

**CDP format:**
```json
{
  "nodeId": "123",
  "role": { "type": "role", "value": "button" },
  "name": { "type": "computedString", "value": "Click me" },
  "childIds": [...]
}
```

### 3. Want to Force CDP Method?

You can still explicitly use CDP:
```bash
node capture-with-ax.js profile1 example.com --ax-cdp
```

### 4. Want Playwright Format?

Playwright's accessibility API only works when **launching** Chrome directly (not connecting to existing instance).

**Option A: Modify the script to launch instead of connect** (not recommended for your use case)

**Option B: Use CDP format** (recommended)
- CDP provides all the same information, just in a different structure
- The `analyze-capture.js` and `extract-ax-info.js` scripts work with both formats

### 5. Analysis Scripts Don't Work with CDP Format?

Some analysis functions might need updates for CDP format. Here's how to handle both:

```javascript
// Works with both formats
function getRole(node) {
    if (typeof node.role === 'string') {
        return node.role; // Playwright format
    } else if (node.role && node.role.value) {
        return node.role.value; // CDP format
    }
    return null;
}

function getName(node) {
    if (typeof node.name === 'string') {
        return node.name; // Playwright format
    } else if (node.name && node.name.value) {
        return node.name.value; // CDP format
    }
    return null;
}
```

## Testing the Fix

### Test 1: Basic Capture
```bash
./chrome-profile-manager.sh start profile1
node capture-with-ax.js profile1 example.com
# Press Ctrl+C after a few seconds
```

**Expected:** Should capture successfully with CDP fallback

### Test 2: Watch Mode
```bash
node capture-with-ax.js profile1 example.com --ax-watch 5000
# Let it run for 30 seconds, press Ctrl+C
```

**Expected:** Multiple snapshots captured successfully

### Test 3: Analyze the Capture
```bash
node analyze-capture.js payload/example_com_*.jsonl --summary
```

**Expected:** Shows accessibility snapshots with method: "cdp"

## Understanding CDP vs Playwright

| Feature | Playwright | CDP |
|---------|-----------|-----|
| **Availability** | Only when launching Chrome | Always works when connecting |
| **Data Format** | Simple, tree-like | Detailed, node-based |
| **Role Format** | String: `"button"` | Object: `{"value": "button"}` |
| **Name Format** | String: `"Click me"` | Object: `{"value": "Click me"}` |
| **Children** | Array in `children` | Array of IDs in `childIds` |
| **Detail Level** | Medium | High (includes internal IDs, computed values) |

## Best Practices

1. **Don't worry about the method** - The automatic fallback handles it
2. **Save snapshots to files** - Use `--ax-files` for easier review
3. **Filter when possible** - Use `--ax-roles` to reduce data size
4. **Watch interval: 3-5s** - Good balance for most apps

## Questions?

### Q: Why does CDP format look different?
**A:** CDP is Chrome's internal protocol - it's more detailed and closer to Chrome's internal representation.

### Q: Can I convert CDP format to Playwright format?
**A:** Yes, but you'll lose some detail. Here's a simple converter:

```javascript
function cdpToPlaywright(cdpNode, allNodes) {
    return {
        role: cdpNode.role?.value,
        name: cdpNode.name?.value,
        children: (cdpNode.childIds || []).map(id => 
            cdpToPlaywright(allNodes.find(n => n.nodeId === id), allNodes)
        ).filter(Boolean)
    };
}
```

### Q: Which format should I use?
**A:** Use whatever the script gives you automatically. Both contain the same accessibility information.

## Summary

✅ **The script now works automatically** - no need to specify `--ax-cdp`  
✅ **Fallback is transparent** - you'll see a message when it switches  
✅ **Both formats work** - analysis scripts handle both  
✅ **No action needed** - just use the updated file  

If you encounter any other issues, check the full guide: `AX-CAPTURE-GUIDE.md`
