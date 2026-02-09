#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const inputFile = args[0];

if (!inputFile || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node analyze-capture.js <jsonl-file> [options]

Options:
  --summary        Show summary statistics only
  --requests       Show all HTTP requests
  --responses      Show all HTTP responses
  --ax             Show accessibility tree snapshots
  --ax-stats       Show AX tree statistics only
  --filter URL     Filter by URL pattern
  --format json    Output as JSON instead of text

Examples:
  node analyze-capture.js payload/example_com_20240208_120000.jsonl
  node analyze-capture.js payload/example_com_20240208_120000.jsonl --summary
  node analyze-capture.js payload/example_com_20240208_120000.jsonl --ax-stats
  node analyze-capture.js payload/example_com_20240208_120000.jsonl --requests --filter "api"
`);
    process.exit(0);
}

// Options
const showSummary = args.includes('--summary');
const showRequests = args.includes('--requests');
const showResponses = args.includes('--responses');
const showAx = args.includes('--ax');
const showAxStats = args.includes('--ax-stats');
const formatJson = args.includes('--format') && args[args.indexOf('--format') + 1] === 'json';
const filterPattern = args.includes('--filter') ? args[args.indexOf('--filter') + 1] : null;

// Read and parse JSONL file
function parseJSONL(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.trim().split('\n');
    const data = [];
    
    for (let i = 0; i < lines.length; i++) {
        try {
            const obj = JSON.parse(lines[i]);
            data.push(obj);
        } catch (e) {
            console.error(`Error parsing line ${i + 1}:`, e.message);
        }
    }
    
    return data;
}

// Count nodes in AX tree
function countAxNodes(node, roleCount = {}) {
    if (!node) return 0;
    
    if (Array.isArray(node)) {
        return node.reduce((sum, n) => sum + countAxNodes(n, roleCount), 0);
    }
    
    // Handle both Playwright and CDP formats
    let role;
    if (typeof node.role === 'string') {
        role = node.role; // Playwright format
    } else if (node.role && node.role.value) {
        role = node.role.value; // CDP format
    }
    
    // Count this node's role
    if (role) {
        roleCount[role] = (roleCount[role] || 0) + 1;
    }
    
    let count = 1;
    
    // Handle children (Playwright format)
    if (node.children && Array.isArray(node.children)) {
        count += node.children.reduce((sum, child) => sum + countAxNodes(child, roleCount), 0);
    }
    
    // Handle childIds (CDP format) - note: we can't traverse without the full node map
    // For now, just count this node
    
    return count;
}

// Analyze data
function analyze(data) {
    const stats = {
        total: data.length,
        requests: [],
        responses: [],
        accessibility: [],
        byType: {},
        timeline: {
            first: null,
            last: null
        }
    };
    
    data.forEach(item => {
        const type = item.type;
        stats.byType[type] = (stats.byType[type] || 0) + 1;
        
        // Track timeline
        if (item.timestamp) {
            if (!stats.timeline.first || item.timestamp < stats.timeline.first) {
                stats.timeline.first = item.timestamp;
            }
            if (!stats.timeline.last || item.timestamp > stats.timeline.last) {
                stats.timeline.last = item.timestamp;
            }
        }
        
        // Filter by pattern if specified
        if (filterPattern && item.url && !item.url.includes(filterPattern)) {
            return;
        }
        
        switch (type) {
            case 'request':
                stats.requests.push(item);
                break;
            case 'response':
                stats.responses.push(item);
                break;
            case 'accessibility':
                stats.accessibility.push(item);
                break;
        }
    });
    
    return stats;
}

// Display functions
function displaySummary(stats) {
    console.log('\n' + '='.repeat(60));
    console.log('CAPTURE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total events: ${stats.total}`);
    console.log(`\nEvent types:`);
    Object.entries(stats.byType).forEach(([type, count]) => {
        console.log(`  ${type.padEnd(20)}: ${count}`);
    });
    
    console.log(`\nTimeline:`);
    if (stats.timeline.first && stats.timeline.last) {
        const start = new Date(stats.timeline.first);
        const end = new Date(stats.timeline.last);
        const duration = (end - start) / 1000;
        console.log(`  Start:    ${stats.timeline.first}`);
        console.log(`  End:      ${stats.timeline.last}`);
        console.log(`  Duration: ${duration.toFixed(2)}s`);
    }
    
    console.log(`\nHTTP Traffic:`);
    console.log(`  Requests:  ${stats.requests.length}`);
    console.log(`  Responses: ${stats.responses.length}`);
    
    if (stats.requests.length > 0) {
        const methods = {};
        stats.requests.forEach(req => {
            methods[req.method] = (methods[req.method] || 0) + 1;
        });
        console.log(`\n  Request methods:`);
        Object.entries(methods).forEach(([method, count]) => {
            console.log(`    ${method.padEnd(10)}: ${count}`);
        });
    }
    
    if (stats.responses.length > 0) {
        const statuses = {};
        stats.responses.forEach(res => {
            const statusClass = `${Math.floor(res.status / 100)}xx`;
            statuses[statusClass] = (statuses[statusClass] || 0) + 1;
        });
        console.log(`\n  Response statuses:`);
        Object.entries(statuses).forEach(([status, count]) => {
            console.log(`    ${status.padEnd(10)}: ${count}`);
        });
    }
    
    if (stats.accessibility.length > 0) {
        console.log(`\nAccessibility Snapshots: ${stats.accessibility.length}`);
        stats.accessibility.forEach((ax, idx) => {
            const roleCount = {};
            const nodeCount = countAxNodes(ax.tree, roleCount);
            console.log(`\n  Snapshot #${ax.snapshot_id} (${ax.label}):`);
            console.log(`    Timestamp: ${ax.timestamp}`);
            console.log(`    Method:    ${ax.method}`);
            console.log(`    Nodes:     ${nodeCount}`);
            
            const topRoles = Object.entries(roleCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);
            console.log(`    Top roles:`);
            topRoles.forEach(([role, count]) => {
                console.log(`      ${role.padEnd(20)}: ${count}`);
            });
        });
    }
    
    console.log('\n' + '='.repeat(60) + '\n');
}

function displayRequests(requests) {
    console.log('\n' + '='.repeat(60));
    console.log(`HTTP REQUESTS (${requests.length})`);
    console.log('='.repeat(60) + '\n');
    
    requests.forEach((req, idx) => {
        console.log(`[${idx + 1}] ${req.method} ${req.url}`);
        console.log(`    Time: ${req.timestamp}`);
        if (req.postData) {
            console.log(`    Body: ${req.postData.substring(0, 100)}${req.postData.length > 100 ? '...' : ''}`);
        }
        console.log('');
    });
}

function displayResponses(responses) {
    console.log('\n' + '='.repeat(60));
    console.log(`HTTP RESPONSES (${responses.length})`);
    console.log('='.repeat(60) + '\n');
    
    responses.forEach((res, idx) => {
        console.log(`[${idx + 1}] ${res.status} ${res.url}`);
        console.log(`    Time: ${res.timestamp}`);
        const contentType = res.headers['content-type'] || 'unknown';
        console.log(`    Type: ${contentType}`);
        if (res.body && res.body !== '[Binary or ignored content type]' && res.body !== '[Body unavailable]') {
            const preview = res.body.substring(0, 150);
            console.log(`    Body: ${preview}${res.body.length > 150 ? '...' : ''}`);
        }
        console.log('');
    });
}

function displayAxSnapshots(accessibility) {
    console.log('\n' + '='.repeat(60));
    console.log(`ACCESSIBILITY SNAPSHOTS (${accessibility.length})`);
    console.log('='.repeat(60) + '\n');
    
    accessibility.forEach((ax) => {
        console.log(`Snapshot #${ax.snapshot_id} - ${ax.label}`);
        console.log(`Time: ${ax.timestamp}`);
        console.log(`Method: ${ax.method}`);
        console.log('\nTree:');
        console.log(JSON.stringify(ax.tree, null, 2));
        console.log('\n' + '-'.repeat(60) + '\n');
    });
}

function displayAxStats(accessibility) {
    console.log('\n' + '='.repeat(60));
    console.log(`ACCESSIBILITY STATISTICS (${accessibility.length} snapshots)`);
    console.log('='.repeat(60) + '\n');
    
    accessibility.forEach((ax) => {
        const roleCount = {};
        const nodeCount = countAxNodes(ax.tree, roleCount);
        
        console.log(`Snapshot #${ax.snapshot_id} - ${ax.label}`);
        console.log(`  Time:   ${ax.timestamp}`);
        console.log(`  Method: ${ax.method}`);
        console.log(`  Nodes:  ${nodeCount}`);
        console.log(`\n  Role Distribution:`);
        
        const sorted = Object.entries(roleCount).sort((a, b) => b[1] - a[1]);
        sorted.forEach(([role, count]) => {
            const bar = '█'.repeat(Math.ceil(count / Math.max(...sorted.map(s => s[1])) * 30));
            console.log(`    ${role.padEnd(25)}: ${count.toString().padStart(4)} ${bar}`);
        });
        
        console.log('\n' + '-'.repeat(60) + '\n');
    });
}

// Main
try {
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }
    
    console.log(`Analyzing: ${inputFile}\n`);
    const data = parseJSONL(inputFile);
    const stats = analyze(data);
    
    if (formatJson) {
        console.log(JSON.stringify(stats, null, 2));
    } else {
        // Default: show summary
        if (!showRequests && !showResponses && !showAx && !showAxStats) {
            displaySummary(stats);
        } else {
            if (showSummary) displaySummary(stats);
            if (showRequests) displayRequests(stats.requests);
            if (showResponses) displayResponses(stats.responses);
            if (showAx) displayAxSnapshots(stats.accessibility);
            if (showAxStats) displayAxStats(stats.accessibility);
        }
    }
    
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}
