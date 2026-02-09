# Getting Started with Accessibility Tree Capture

Complete guide to capturing HTTP traffic and accessibility trees using Chrome CDP and Playwright.

## What You Have

### Core Scripts
1. **capture-with-ax.js** - Main capture script with AX tree support
2. **analyze-capture.js** - Analyze captured data
3. **extract-ax-info.js** - Extract specific accessibility information

### Helper Scripts
4. **quickstart-ax.sh** - Interactive menu for common tasks
5. **chrome-profile-manager.sh** - Manage Chrome profiles (from previous files)

### Documentation
6. **AX-CAPTURE-GUIDE.md** - Comprehensive guide with examples
7. **AX-QUICK-REFERENCE.md** - Quick reference card
8. **README.md** - Original Chrome profile manager guide

## Installation

```bash
cd /Volumes/wwk_nvme/Users/wwkoon/code/chrome_cdp_test

# Install Node.js dependencies
npm install

# Make scripts executable
chmod +x *.sh
```

## Quick Start (3 Steps)

### Step 1: Start Chrome Profile

```bash
# Create a profile (one-time setup)
./chrome-profile-manager.sh create profile1 9222

# Start Chrome with the profile
./chrome-profile-manager.sh start profile1
```

You should see:
```
Starting Chrome with profile 'profile1' on port 9222...
Chrome started successfully
PID: 12345
CDP endpoint: http://localhost:9222
```

### Step 2: Capture Data

```bash
# Basic capture - captures HTTP traffic + one AX snapshot
node capture-with-ax.js profile1 example.com
```

The script will:
- Navigate to the URL
- Capture all HTTP requests/responses
- Take an accessibility tree snapshot after page loads
- Keep running (press Ctrl+C to stop and save)

Output:
```
============================================================
Profile: profile1
URL: https://example.com
AX Method: playwright
Output: payload/example_com_20240208_143022.jsonl
============================================================

Connecting to profile1...
Navigating to https://example.com...
✓ Page loaded and network traffic captured.

Capturing accessibility tree (initial_load)...
  ✓ Captured AX tree #1 (147 nodes)

============================================================
Session is running. Press Ctrl+C to stop and save.
============================================================
```

### Step 3: Analyze the Capture

```bash
# Find your capture file
ls -lt payload/

# Analyze it
node analyze-capture.js payload/example_com_20240208_143022.jsonl --summary
```

You'll see:
- Total events captured
- HTTP request/response counts
- Accessibility snapshots summary
- Role distribution in AX tree

## Common Usage Patterns

### Pattern 1: One-time Accessibility Audit

```bash
# 1. Start profile
./chrome-profile-manager.sh start profile1

# 2. Capture (save snapshots to separate files for easier review)
node capture-with-ax.js profile1 mywebsite.com --ax-files

# 3. Wait a few seconds, then press Ctrl+C

# 4. Check for accessibility violations
node extract-ax-info.js payload/mywebsite_com_*.jsonl --violations
```

**When to use**: Initial accessibility assessment of a static page

### Pattern 2: Monitor Dynamic Application

```bash
# Capture AX tree every 5 seconds
node capture-with-ax.js profile1 app.example.com --ax-watch 5000

# Interact with the app (click buttons, navigate, etc.)
# Let it run for a few minutes

# Press Ctrl+C when done

# Review the snapshots
node analyze-capture.js payload/app_example_com_*.jsonl --ax-stats
```

**When to use**: Single-page applications, dashboards, real-time apps

### Pattern 3: Focus on Specific Elements

```bash
# Only capture buttons, links, and headings
node capture-with-ax.js profile1 mysite.com --ax-roles button,link,heading

# Analyze heading structure
node extract-ax-info.js payload/mysite_com_*.jsonl --heading-structure

# Check for unlabeled buttons
node extract-ax-info.js payload/mysite_com_*.jsonl --unlabeled-buttons
```

**When to use**: Focused audits on specific element types

### Pattern 4: Detailed Analysis

```bash
# Use raw CDP for maximum detail
node capture-with-ax.js profile1 site.com --ax-cdp --ax-files

# Extract all interactive elements
node extract-ax-info.js payload/site_com_*.jsonl --interactive

# Review individual snapshots
cat payload/ax_snapshots/site_com_*/ax_1_*.json | jq .
```

**When to use**: Deep debugging, detailed accessibility analysis

## Using the Interactive Menu

```bash
./quickstart-ax.sh
```

This presents a menu:
```
1) Basic capture (one-time AX snapshot)
2) Watch mode (periodic snapshots every 5s)
3) Save AX snapshots to separate files
4) Filter by roles (buttons, links, headings only)
5) Use raw CDP for detailed tree
6) Full capture with all options
7) Custom URL
8) View existing captures
```

Choose an option and it will run the appropriate command for you.

## Understanding the Output

### JSONL File Structure

The main output file (`payload/example_com_*.jsonl`) contains one JSON object per line:

```jsonl
{"type":"request","timestamp":"...","url":"...","method":"GET",...}
{"type":"response","timestamp":"...","url":"...","status":200,...}
{"type":"accessibility","snapshot_id":1,"label":"initial_load","tree":{...}}
```

### Accessibility Tree Format

```json
{
  "type": "accessibility",
  "snapshot_id": 1,
  "label": "initial_load",
  "timestamp": "2024-02-08T14:30:23.789Z",
  "method": "playwright",
  "tree": {
    "role": "WebArea",
    "name": "Example Domain",
    "children": [
      {
        "role": "heading",
        "name": "Example Domain",
        "level": 1
      },
      {
        "role": "paragraph",
        "children": [...]
      }
    ]
  }
}
```

### Separate AX Files (with --ax-files)

```
payload/
  ├── example_com_20240208_143022.jsonl          # Main file (all events)
  └── ax_snapshots/
      └── example_com_20240208_143022/
          ├── ax_1_initial_load_1707405022789.json
          ├── ax_2_watch_1_1707405027789.json
          └── ax_3_watch_2_1707405032789.json
```

## Available Options

### Capture Options

| Option | Description | Example |
|--------|-------------|---------|
| `--ax-watch N` | Capture every N milliseconds | `--ax-watch 5000` |
| `--ax-files` | Save snapshots to separate files | `--ax-files` |
| `--ax-roles R` | Filter by roles (comma-separated) | `--ax-roles button,link` |
| `--ax-cdp` | Use raw CDP (more detailed) | `--ax-cdp` |

### Analysis Options

| Option | Description |
|--------|-------------|
| `--summary` | Show overall summary (default) |
| `--ax-stats` | Show AX tree statistics |
| `--ax` | Show full AX trees |
| `--requests` | Show HTTP requests |
| `--responses` | Show HTTP responses |
| `--filter "text"` | Filter by URL pattern |

### Extraction Options

| Option | Description |
|--------|-------------|
| `--violations` | Check for a11y violations (default) |
| `--unlabeled-buttons` | Find buttons without labels |
| `--heading-structure` | Extract heading hierarchy |
| `--form-fields` | List all form controls |
| `--interactive` | List interactive elements |

## Common Accessibility Checks

### 1. Find Unlabeled Buttons

```bash
node extract-ax-info.js payload/file.jsonl --unlabeled-buttons
```

Output:
```
UNLABELED BUTTONS
============================================================

Found 3 unlabeled button(s):

[1] Button
    Properties: {...}

[2] Button
    Properties: {...}
```

### 2. Check Heading Hierarchy

```bash
node extract-ax-info.js payload/file.jsonl --heading-structure
```

Output:
```
HEADING STRUCTURE
============================================================

Found 12 heading(s):

H1: Welcome to Our Site
  H2: Features
    H3: Feature 1
    H3: Feature 2
  H2: About Us

Heading Hierarchy Analysis:
Level distribution:
  H1: 1
  H2: 3
  H3: 8

Issues:
  ✓ No hierarchy issues found
```

### 3. Audit Form Fields

```bash
node extract-ax-info.js payload/file.jsonl --form-fields
```

Output:
```
FORM FIELDS
============================================================

Found 8 form field(s):

TEXTBOX (5):
  1. Email address [REQUIRED]
  2. Full name
  3. (unlabeled) [REQUIRED]
  ...

CHECKBOX (3):
  1. I agree to terms
  2. Newsletter signup
  ...

⚠ Warning: 1 unlabeled field(s) found
```

### 4. Check All Violations

```bash
node extract-ax-info.js payload/file.jsonl --violations
```

Output:
```
ACCESSIBILITY VIOLATIONS CHECK
============================================================

Found 5 issue(s):
  Errors:   3
  Warnings: 2

ERRORS:
  1. [button-name] 2 button(s) without accessible name
  2. [image-alt] 1 image(s) without alt text
  3. [label] 1 form field(s) without label

WARNINGS:
  1. [heading-order] First heading is H2, should be H1
  2. [heading-order] Heading hierarchy skips from H2 to H4
```

## Workflow Examples

### Example 1: Quick Audit

```bash
# Start Chrome
./chrome-profile-manager.sh start profile1

# Capture
node capture-with-ax.js profile1 https://mysite.com --ax-files

# Wait 5 seconds, press Ctrl+C

# Check violations
node extract-ax-info.js payload/mysite_com_*.jsonl
```

### Example 2: Monitor SPA Changes

```bash
# Start watching
node capture-with-ax.js profile1 https://spa.example.com --ax-watch 3000 --ax-files

# Interact with the app for 2 minutes
# - Click through navigation
# - Fill out forms
# - Trigger dynamic content

# Press Ctrl+C

# Review snapshots
ls payload/ax_snapshots/spa_example_com_*/

# Compare first and last snapshot
diff payload/ax_snapshots/spa_example_com_*/ax_1_*.json \
     payload/ax_snapshots/spa_example_com_*/ax_20_*.json
```

### Example 3: Focus on Interactive Elements

```bash
# Capture only buttons and links
node capture-with-ax.js profile1 mysite.com --ax-roles button,link --ax-files

# List all interactive elements
node extract-ax-info.js payload/mysite_com_*.jsonl --interactive

# Find unlabeled buttons
node extract-ax-info.js payload/mysite_com_*.jsonl --unlabeled-buttons
```

## Troubleshooting

### "Failed to capture AX tree"

**Cause**: Playwright's accessibility API might not work for some pages

**Solution**: Try using raw CDP
```bash
node capture-with-ax.js profile1 example.com --ax-cdp
```

### File is too large

**Cause**: Capturing too many snapshots or full page trees

**Solution 1**: Filter by roles
```bash
node capture-with-ax.js profile1 example.com --ax-roles button,link
```

**Solution 2**: Use separate files
```bash
node capture-with-ax.js profile1 example.com --ax-files
```

### Chrome won't start

**Check status**:
```bash
./chrome-profile-manager.sh status profile1
```

**Check logs**:
```bash
cat chrome-profiles/profile1/chrome.log
```

**Restart**:
```bash
./chrome-profile-manager.sh stop profile1
./chrome-profile-manager.sh start profile1
```

### Can't find captured files

**List all captures**:
```bash
ls -lt payload/
```

**Search by domain**:
```bash
ls payload/*example_com*
```

## Tips & Best Practices

1. **Start with basic capture** - Add options as you need them
2. **Use --ax-files for review** - Easier to inspect individual snapshots
3. **Filter by roles** - Reduces data size by 80-90%
4. **Watch interval: 3-5s** - Good balance for most SPAs
5. **Check violations first** - Quick way to find issues
6. **Keep sessions short** - 30-60 seconds is usually enough
7. **Stop other Chrome instances** - Avoid port conflicts

## Next Steps

1. **Try the quickstart script**: `./quickstart-ax.sh`
2. **Read the full guide**: `AX-CAPTURE-GUIDE.md`
3. **Check the reference**: `AX-QUICK-REFERENCE.md`
4. **Experiment with options**: Try different combinations
5. **Build custom analysis**: Use the captured data for your needs

## All Files Summary

| File | Purpose |
|------|---------|
| `capture-with-ax.js` | Main capture script |
| `analyze-capture.js` | Analyze captured JSONL files |
| `extract-ax-info.js` | Extract specific AX information |
| `quickstart-ax.sh` | Interactive menu |
| `chrome-profile-manager.sh` | Manage Chrome profiles |
| `chrome-profile-manager.js` | Playwright CDP manager |
| `AX-CAPTURE-GUIDE.md` | Comprehensive documentation |
| `AX-QUICK-REFERENCE.md` | Quick reference card |
| `README.md` | Original CDP manager guide |

## Support

For detailed examples, see: **AX-CAPTURE-GUIDE.md**  
For quick commands, see: **AX-QUICK-REFERENCE.md**  
For interactive help, run: `./quickstart-ax.sh`

Happy accessibility testing! 🎉
