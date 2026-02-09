# Accessibility Tree Capture Guide

Complete guide for capturing HTTP traffic and accessibility trees using Chrome CDP.

## Quick Start

### 1. Basic Capture (One-time AX snapshot)

```bash
# Start Chrome profile
./chrome-profile-manager.sh start profile1

# Capture traffic + initial AX tree
node capture-with-ax.js profile1 example.com
```

Press `Ctrl+C` to stop and save.

### 2. Watch Mode (Periodic AX snapshots)

```bash
# Capture AX tree every 5 seconds
node capture-with-ax.js profile1 example.com --ax-watch 5000
```

### 3. Save AX Snapshots to Separate Files

```bash
# Easier to review individual snapshots
node capture-with-ax.js profile1 example.com --ax-files
```

## Command Reference

### Basic Syntax

```bash
node capture-with-ax.js [profile] [url] [options]
```

### Arguments

| Argument | Description | Default |
|----------|-------------|---------|
| `profile` | Chrome profile name | `profile1` |
| `url` | URL to visit | `www.perplexity.ai` |

### Options

| Option | Description | Example |
|--------|-------------|---------|
| `--ax-watch N` | Capture AX tree every N milliseconds | `--ax-watch 5000` |
| `--ax-files` | Save AX snapshots to separate JSON files | `--ax-files` |
| `--ax-roles R` | Filter AX tree by roles (comma-separated) | `--ax-roles button,link,heading` |
| `--ax-cdp` | Use raw CDP instead of Playwright (more detailed) | `--ax-cdp` |
| `-h, --help` | Show help message | `-h` |

## Examples

### Example 1: Basic Capture

```bash
./chrome-profile-manager.sh start profile1
node capture-with-ax.js profile1 https://example.com
```

**Output:**
- `payload/example_com_20240208_143022.jsonl` - All events (requests, responses, AX tree)

### Example 2: Watch Dynamic Page

```bash
# Capture snapshots every 3 seconds to track dynamic changes
node capture-with-ax.js profile1 https://app.example.com --ax-watch 3000
```

Useful for:
- Single-page applications (SPAs)
- Real-time dashboards
- Chat applications
- Dynamic forms

### Example 3: Focus on Specific Roles

```bash
# Only capture buttons, links, and headings
node capture-with-ax.js profile1 https://example.com --ax-roles button,link,heading
```

Common role filters:
- `button,link` - Interactive elements
- `heading,article` - Content structure
- `textbox,combobox,checkbox` - Form controls
- `alert,status` - ARIA live regions

### Example 4: Detailed CDP Capture

```bash
# Use raw CDP for maximum detail
node capture-with-ax.js profile1 https://example.com --ax-cdp
```

CDP provides:
- More node properties
- Internal Chrome IDs
- Lower-level accessibility info

### Example 5: Complete Analysis Workflow

```bash
# 1. Start profile
./chrome-profile-manager.sh start profile1

# 2. Capture with all options
node capture-with-ax.js profile1 https://example.com \
  --ax-watch 5000 \
  --ax-files \
  --ax-cdp

# 3. Let it run for 30 seconds, then Ctrl+C

# 4. Analyze the data
node analyze-capture.js payload/example_com_20240208_143022.jsonl --summary
```

### Example 6: Multiple URLs

```bash
# Capture different sites with same profile
node capture-with-ax.js profile1 https://site1.com --ax-files
# Ctrl+C when done

node capture-with-ax.js profile1 https://site2.com --ax-files
# Ctrl+C when done
```

## Output Structure

### JSONL Format (Main File)

Each line is a JSON object with a `type` field:

```jsonl
{"type":"request","timestamp":"2024-02-08T14:30:22.123Z","url":"https://example.com","method":"GET",...}
{"type":"response","timestamp":"2024-02-08T14:30:22.456Z","url":"https://example.com","status":200,...}
{"type":"accessibility","snapshot_id":1,"label":"initial_load","timestamp":"2024-02-08T14:30:23.789Z","tree":{...}}
{"type":"accessibility","snapshot_id":2,"label":"watch_1","timestamp":"2024-02-08T14:30:28.789Z","tree":{...}}
```

### Accessibility Tree Structure

**Playwright format:**
```json
{
  "role": "WebArea",
  "name": "Example Page",
  "children": [
    {
      "role": "heading",
      "name": "Welcome",
      "level": 1
    },
    {
      "role": "button",
      "name": "Click me"
    }
  ]
}
```

**CDP format (more detailed):**
```json
{
  "nodeId": "1",
  "role": { "type": "role", "value": "rootWebArea" },
  "name": { "type": "computedString", "value": "Example Page" },
  "properties": [...],
  "childIds": ["2", "3"]
}
```

### Separate AX Files (with `--ax-files`)

```
payload/
  ax_snapshots/
    example_com_20240208_143022/
      ax_1_initial_load_1707405022789.json
      ax_2_watch_1_1707405027789.json
      ax_3_watch_2_1707405032789.json
```

## Analyzing Captured Data

### Summary Statistics

```bash
node analyze-capture.js payload/example_com_20240208_143022.jsonl
```

Shows:
- Total events
- Event type distribution
- Timeline and duration
- HTTP traffic summary
- AX snapshot overview

### View All Requests

```bash
node analyze-capture.js payload/example_com_20240208_143022.jsonl --requests
```

### View All Responses

```bash
node analyze-capture.js payload/example_com_20240208_143022.jsonl --responses
```

### View AX Tree Details

```bash
# Full tree dumps
node analyze-capture.js payload/example_com_20240208_143022.jsonl --ax

# Just statistics
node analyze-capture.js payload/example_com_20240208_143022.jsonl --ax-stats
```

### Filter by URL Pattern

```bash
# Only show API calls
node analyze-capture.js payload/example_com_20240208_143022.jsonl --requests --filter api

# Only show specific domain
node analyze-capture.js payload/example_com_20240208_143022.jsonl --responses --filter cdn.example.com
```

### Export as JSON

```bash
node analyze-capture.js payload/example_com_20240208_143022.jsonl --format json > analysis.json
```

## Common Use Cases

### Use Case 1: Accessibility Audit

```bash
# Capture initial page state
node capture-with-ax.js profile1 https://myapp.com --ax-files

# Analyze role distribution
node analyze-capture.js payload/myapp_com_*.jsonl --ax-stats
```

Look for:
- Missing headings (`heading` role)
- Unlabeled buttons (`button` without name)
- Improper ARIA usage
- Missing landmarks

### Use Case 2: SPA State Tracking

```bash
# Watch every 2 seconds for 1 minute
node capture-with-ax.js profile1 https://spa.example.com --ax-watch 2000 --ax-files

# Then manually interact with the app while it captures
# Press Ctrl+C when done

# Compare snapshots to see DOM changes
```

### Use Case 3: Form Accessibility

```bash
# Focus on form controls
node capture-with-ax.js profile1 https://form.example.com \
  --ax-roles textbox,combobox,checkbox,radio,button \
  --ax-files
```

### Use Case 4: API + AX Correlation

```bash
# Capture both HTTP and AX changes
node capture-with-ax.js profile1 https://api-driven-app.com --ax-watch 3000

# Analyze to correlate API responses with UI updates
node analyze-capture.js payload/api_driven_app_*.jsonl --summary
```

## Tips & Best Practices

### 1. Watch Interval Selection

- **Fast (1-2s)**: Animations, real-time updates
- **Medium (3-5s)**: General SPAs, periodic updates
- **Slow (10s+)**: Static pages, manual testing

### 2. Managing Large Captures

```bash
# Split by time or event count
# Use --ax-files to make individual snapshots easier to review
node capture-with-ax.js profile1 example.com --ax-watch 5000 --ax-files
```

### 3. Role Filtering Performance

```bash
# Filtering reduces data size significantly
node capture-with-ax.js profile1 example.com --ax-roles button,link,heading
```

### 4. Comparing Snapshots

```bash
# Use separate files for easier diff
node capture-with-ax.js profile1 example.com --ax-files

# Then use diff tools
diff payload/ax_snapshots/.../ax_1_initial_load_*.json \
     payload/ax_snapshots/.../ax_2_watch_1_*.json
```

### 5. Debugging Failed Captures

If AX tree capture fails:
1. Check Chrome is running: `./chrome-profile-manager.sh status profile1`
2. Try Playwright method first (default)
3. If Playwright fails, try CDP: `--ax-cdp`
4. Check Chrome logs: `cat chrome-profiles/profile1/chrome.log`

## Workflow Examples

### Workflow 1: One-time Accessibility Audit

```bash
# Setup
./chrome-profile-manager.sh create audit-profile 9222
./chrome-profile-manager.sh start audit-profile

# Capture
node capture-with-ax.js audit-profile https://mysite.com --ax-files

# Analyze
node analyze-capture.js payload/mysite_com_*.jsonl --ax-stats

# Review individual snapshot
cat payload/ax_snapshots/mysite_com_*/ax_1_initial_load_*.json | jq .
```

### Workflow 2: Compare Before/After Changes

```bash
# Capture before
node capture-with-ax.js profile1 https://mysite.com/old-version --ax-files
mv payload/mysite_com_*.jsonl payload/before.jsonl

# Make changes to site...

# Capture after
node capture-with-ax.js profile1 https://mysite.com/new-version --ax-files
mv payload/mysite_com_*.jsonl payload/after.jsonl

# Compare
node analyze-capture.js payload/before.jsonl --ax-stats > before-stats.txt
node analyze-capture.js payload/after.jsonl --ax-stats > after-stats.txt
diff before-stats.txt after-stats.txt
```

### Workflow 3: Monitor Dynamic Application

```bash
# Start capture with watch mode
node capture-with-ax.js profile1 https://dashboard.example.com \
  --ax-watch 5000 \
  --ax-files

# Manually interact with the dashboard for 5 minutes
# (click buttons, navigate, trigger updates)

# Press Ctrl+C

# Analyze timeline
node analyze-capture.js payload/dashboard_example_com_*.jsonl --summary

# Review specific snapshots
ls payload/ax_snapshots/dashboard_example_com_*/
```

## Troubleshooting

### Problem: "Failed to capture AX tree"

**Solution:**
```bash
# Try CDP method
node capture-with-ax.js profile1 example.com --ax-cdp
```

### Problem: Too much data / file too large

**Solution:**
```bash
# Use role filtering
node capture-with-ax.js profile1 example.com --ax-roles button,link

# Or use separate files
node capture-with-ax.js profile1 example.com --ax-files
```

### Problem: Watch mode captures too many snapshots

**Solution:**
```bash
# Increase interval
node capture-with-ax.js profile1 example.com --ax-watch 10000

# Or capture manually (no --ax-watch)
```

### Problem: Can't find captured files

**Solution:**
```bash
# Check payload directory
ls -lah payload/

# Check with timestamps
ls -lt payload/

# Find by domain
ls payload/*example_com*
```

## Advanced Tips

### Custom Processing

```javascript
// process-ax.js - Custom AX tree processing
const fs = require('fs');

const data = fs.readFileSync('payload/example_com_20240208_143022.jsonl', 'utf8');
const lines = data.trim().split('\n');

lines.forEach(line => {
  const obj = JSON.parse(line);
  if (obj.type === 'accessibility') {
    // Your custom processing
    console.log(`Snapshot ${obj.snapshot_id}: ${countButtons(obj.tree)} buttons`);
  }
});

function countButtons(node) {
  if (!node) return 0;
  let count = node.role === 'button' ? 1 : 0;
  if (node.children) {
    count += node.children.reduce((sum, child) => sum + countButtons(child), 0);
  }
  return count;
}
```

### Integration with CI/CD

```bash
#!/bin/bash
# ax-audit.sh - Run accessibility audit in CI

./chrome-profile-manager.sh create ci-profile 9222
./chrome-profile-manager.sh start ci-profile

node capture-with-ax.js ci-profile $SITE_URL --ax-files

# Analyze
node analyze-capture.js payload/*.jsonl --ax-stats > audit-report.txt

# Check for violations
node check-violations.js payload/*.jsonl

./chrome-profile-manager.sh stop ci-profile
```

## Reference

### All Capture Options

```bash
node capture-with-ax.js profile1 example.com \
  --ax-watch 5000 \      # Periodic capture every 5s
  --ax-files \           # Save to separate files
  --ax-roles button,link \ # Filter by roles
  --ax-cdp               # Use raw CDP
```

### All Analyze Options

```bash
node analyze-capture.js payload/file.jsonl \
  --summary \            # Show summary
  --requests \           # Show requests
  --responses \          # Show responses
  --ax \                 # Show full AX trees
  --ax-stats \           # Show AX statistics
  --filter "pattern" \   # Filter by URL
  --format json          # JSON output
```

## Next Steps

1. Start with basic capture to understand the data format
2. Use watch mode for dynamic pages
3. Add role filtering to reduce data size
4. Use separate files for easier review
5. Build custom analysis tools for your specific needs
