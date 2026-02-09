# Accessibility Tree Capture - Quick Reference Card

## Installation

```bash
cd /Volumes/wwk_nvme/Users/wwkoon/code/chrome_cdp_test
npm install  # Install dependencies (playwright)
chmod +x *.sh  # Make scripts executable
```

## Quick Start (3 Steps)

```bash
# 1. Create and start profile
./chrome-profile-manager.sh create profile1 9222
./chrome-profile-manager.sh start profile1

# 2. Capture accessibility tree
node capture-with-ax.js profile1 example.com

# 3. Analyze the capture
node analyze-capture.js payload/example_com_*.jsonl --summary
```

## Command Syntax

```bash
node capture-with-ax.js [profile] [url] [options]
```

## Common Commands

### Basic Capture
```bash
node capture-with-ax.js profile1 example.com
# → Captures HTTP traffic + one AX snapshot after page load
```

### Watch Mode (Periodic Snapshots)
```bash
node capture-with-ax.js profile1 example.com --ax-watch 5000
# → Captures AX tree every 5 seconds
```

### Save Snapshots to Files
```bash
node capture-with-ax.js profile1 example.com --ax-files
# → Saves each snapshot as separate JSON file
```

### Filter by Roles
```bash
node capture-with-ax.js profile1 example.com --ax-roles button,link,heading
# → Only captures specified roles (reduces data size)
```

### Use Raw CDP
```bash
node capture-with-ax.js profile1 example.com --ax-cdp
# → Uses Chrome DevTools Protocol for more detailed tree
```

### Combine Options
```bash
node capture-with-ax.js profile1 example.com --ax-watch 3000 --ax-files --ax-cdp
# → Watch every 3s, save files, use CDP
```

## Analyzing Captures

### Show Summary
```bash
node analyze-capture.js payload/file.jsonl
# or
node analyze-capture.js payload/file.jsonl --summary
```

### Show AX Statistics
```bash
node analyze-capture.js payload/file.jsonl --ax-stats
# → Shows role distribution, node counts
```

### View Full AX Trees
```bash
node analyze-capture.js payload/file.jsonl --ax
# → Dumps complete accessibility trees
```

### Show HTTP Requests
```bash
node analyze-capture.js payload/file.jsonl --requests
```

### Show HTTP Responses
```bash
node analyze-capture.js payload/file.jsonl --responses
```

### Filter by URL
```bash
node analyze-capture.js payload/file.jsonl --requests --filter "api"
# → Only shows requests with "api" in URL
```

## Extract Specific Information

### Check for Violations
```bash
node extract-ax-info.js payload/file.jsonl
# → Checks for common a11y violations (default)
```

### Find Unlabeled Buttons
```bash
node extract-ax-info.js payload/file.jsonl --unlabeled-buttons
```

### Extract Heading Structure
```bash
node extract-ax-info.js payload/file.jsonl --heading-structure
# → Shows heading hierarchy (H1, H2, H3...)
```

### List Form Fields
```bash
node extract-ax-info.js payload/file.jsonl --form-fields
# → Shows all textbox, checkbox, etc.
```

### List Interactive Elements
```bash
node extract-ax-info.js payload/file.jsonl --interactive
# → Shows buttons, links, form controls
```

## Interactive Mode

```bash
./quickstart-ax.sh
# → Interactive menu with all common options
```

## Output Files

### Main Capture File
```
payload/example_com_20240208_143022.jsonl
```
Contains all events in JSONL format:
- `type: "request"` - HTTP requests
- `type: "response"` - HTTP responses
- `type: "accessibility"` - AX tree snapshots

### Separate AX Snapshot Files (with --ax-files)
```
payload/ax_snapshots/example_com_20240208_143022/
  ├── ax_1_initial_load_1707405022789.json
  ├── ax_2_watch_1_1707405027789.json
  └── ax_3_watch_2_1707405032789.json
```

## Common Workflows

### 1. One-time Audit
```bash
./chrome-profile-manager.sh start profile1
node capture-with-ax.js profile1 mysite.com --ax-files
node extract-ax-info.js payload/mysite_*.jsonl --violations
```

### 2. Track Dynamic Changes
```bash
node capture-with-ax.js profile1 app.example.com --ax-watch 5000
# Let it run while you interact with the app
# Press Ctrl+C when done
node analyze-capture.js payload/app_example_com_*.jsonl --ax-stats
```

### 3. Focus on Interactive Elements
```bash
node capture-with-ax.js profile1 form.example.com --ax-roles button,link,textbox,checkbox
node extract-ax-info.js payload/form_example_com_*.jsonl --form-fields
```

### 4. Compare Before/After
```bash
# Before changes
node capture-with-ax.js profile1 site.com/old --ax-files
mv payload/site_com_*.jsonl before.jsonl

# After changes
node capture-with-ax.js profile1 site.com/new --ax-files
mv payload/site_com_*.jsonl after.jsonl

# Compare
diff <(node analyze-capture.js before.jsonl --ax-stats) \
     <(node analyze-capture.js after.jsonl --ax-stats)
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+C` | Stop capture and save |

## Tips

1. **Start simple**: Begin with basic capture, add options as needed
2. **Use --ax-files**: Easier to review individual snapshots
3. **Filter roles**: Reduces data size significantly
4. **Watch interval**: 3-5s is good for most SPAs
5. **Check violations first**: Use `extract-ax-info.js` for quick audit

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Failed to capture AX tree" | Try `--ax-cdp` flag |
| File too large | Use `--ax-roles` to filter |
| Too many snapshots | Increase `--ax-watch` interval |
| Chrome not starting | Check: `./chrome-profile-manager.sh status profile1` |
| Can't find captures | Check: `ls payload/` |

## npm Scripts

```bash
npm run capture     # alias for node capture-with-ax.js
npm run analyze     # alias for node analyze-capture.js
npm test            # run test suite
npm run example     # run examples
```

## File Descriptions

| File | Purpose |
|------|---------|
| `capture-with-ax.js` | Main capture script |
| `analyze-capture.js` | Analyze captured data |
| `extract-ax-info.js` | Extract specific AX info |
| `quickstart-ax.sh` | Interactive menu |
| `AX-CAPTURE-GUIDE.md` | Full documentation |

## Help

```bash
# Show capture options
node capture-with-ax.js --help

# Show analysis options
node analyze-capture.js --help

# Show extraction options
node extract-ax-info.js --help
```

## Examples

See `AX-CAPTURE-GUIDE.md` for comprehensive examples and use cases.
