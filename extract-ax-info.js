#!/usr/bin/env node

/**
 * Example: Extract specific information from accessibility tree captures
 * 
 * This script demonstrates how to process AX tree data for common tasks:
 * - Find all buttons without labels
 * - Extract all headings and their hierarchy
 * - Find form fields without labels
 * - Check for proper ARIA usage
 */

const fs = require('fs');
const path = require('path');

const inputFile = process.argv[2];

if (!inputFile || process.argv.includes('--help')) {
    console.log(`
Usage: node extract-ax-info.js <jsonl-file> [options]

Options:
  --unlabeled-buttons    Find buttons without accessible names
  --heading-structure    Extract heading hierarchy
  --form-fields          List all form controls
  --interactive          List all interactive elements
  --violations           Check for common a11y violations

Examples:
  node extract-ax-info.js payload/example_com_20240208_143022.jsonl --unlabeled-buttons
  node extract-ax-info.js payload/example_com_20240208_143022.jsonl --heading-structure
  node extract-ax-info.js payload/example_com_20240208_143022.jsonl --violations
`);
    process.exit(0);
}

const checkUnlabeledButtons = process.argv.includes('--unlabeled-buttons');
const checkHeadingStructure = process.argv.includes('--heading-structure');
const checkFormFields = process.argv.includes('--form-fields');
const checkInteractive = process.argv.includes('--interactive');
const checkViolations = process.argv.includes('--violations');

// Parse JSONL file
function parseJSONL(filepath) {
    const content = fs.readFileSync(filepath, 'utf8');
    const lines = content.trim().split('\n');
    const axData = [];
    
    for (const line of lines) {
        try {
            const obj = JSON.parse(line);
            if (obj.type === 'accessibility') {
                axData.push(obj);
            }
        } catch (e) {
            // Skip invalid lines
        }
    }
    
    return axData;
}

// Helper to get role from node (handles both formats)
function getRole(node) {
    if (!node) return null;
    if (typeof node.role === 'string') return node.role; // Playwright
    if (node.role && node.role.value) return node.role.value; // CDP
    return null;
}

// Helper to get name from node (handles both formats)
function getName(node) {
    if (!node) return null;
    if (typeof node.name === 'string') return node.name; // Playwright
    if (node.name && node.name.value) return node.name.value; // CDP
    return null;
}

// Helper to get children (handles both formats)
function getChildren(node) {
    if (!node) return [];
    if (node.children && Array.isArray(node.children)) return node.children; // Playwright
    // CDP format uses childIds, which requires the full node map - skip for now
    return [];
}

// Find nodes by role
function findNodesByRole(node, role, results = []) {
    if (!node) return results;
    
    if (Array.isArray(node)) {
        node.forEach(n => findNodesByRole(n, role, results));
        return results;
    }
    
    const nodeRole = getRole(node);
    if (nodeRole === role) {
        results.push(node);
    }
    
    const children = getChildren(node);
    children.forEach(child => findNodesByRole(child, role, results));
    
    return results;
}

// Find nodes by multiple criteria
function findNodes(node, predicate, results = [], depth = 0) {
    if (!node) return results;
    
    if (Array.isArray(node)) {
        node.forEach(n => findNodes(n, predicate, results, depth));
        return results;
    }
    
    if (predicate(node)) {
        results.push({ node, depth });
    }
    
    const children = getChildren(node);
    children.forEach(child => findNodes(child, predicate, results, depth + 1));
    
    return results;
}

// Extract unlabeled buttons
function extractUnlabeledButtons(tree) {
    const buttons = findNodesByRole(tree, 'button');
    const unlabeled = buttons.filter(btn => {
        const name = getName(btn);
        return !name || name.trim() === '';
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('UNLABELED BUTTONS');
    console.log('='.repeat(60) + '\n');
    
    if (unlabeled.length === 0) {
        console.log('✓ No unlabeled buttons found!');
    } else {
        console.log(`Found ${unlabeled.length} unlabeled button(s):\n`);
        unlabeled.forEach((btn, idx) => {
            console.log(`[${idx + 1}] Button`);
            const desc = btn.description || (btn.name && btn.name.sources ? 'Has name sources' : '');
            if (desc) console.log(`    Description: ${desc}`);
            console.log(`    Properties:`, JSON.stringify(btn, null, 2).substring(0, 200));
            console.log('');
        });
    }
}

// Extract heading structure
function extractHeadingStructure(tree) {
    const headings = findNodes(tree, n => getRole(n) === 'heading');
    
    console.log('\n' + '='.repeat(60));
    console.log('HEADING STRUCTURE');
    console.log('='.repeat(60) + '\n');
    
    if (headings.length === 0) {
        console.log('No headings found.');
    } else {
        console.log(`Found ${headings.length} heading(s):\n`);
        headings.forEach(({ node, depth }) => {
            const level = node.level || '?';
            const indent = '  '.repeat(depth);
            const name = getName(node) || '(unnamed)';
            console.log(`${indent}H${level}: ${name}`);
        });
    }
    
    // Check for proper hierarchy
    console.log('\n' + '-'.repeat(60));
    console.log('Heading Hierarchy Analysis:');
    console.log('-'.repeat(60) + '\n');
    
    const levels = headings.map(h => h.node.level).filter(l => l);
    const levelCounts = {};
    levels.forEach(l => levelCounts[l] = (levelCounts[l] || 0) + 1);
    
    console.log('Level distribution:');
    Object.entries(levelCounts).sort((a, b) => a[0] - b[0]).forEach(([level, count]) => {
        console.log(`  H${level}: ${count}`);
    });
    
    // Check for skipped levels
    const sortedLevels = [...new Set(levels)].sort((a, b) => a - b);
    console.log('\nIssues:');
    let hasIssues = false;
    
    if (sortedLevels.length > 0 && sortedLevels[0] !== 1) {
        console.log(`  ⚠ First heading is H${sortedLevels[0]}, should be H1`);
        hasIssues = true;
    }
    
    for (let i = 1; i < sortedLevels.length; i++) {
        if (sortedLevels[i] - sortedLevels[i - 1] > 1) {
            console.log(`  ⚠ Skipped from H${sortedLevels[i - 1]} to H${sortedLevels[i]}`);
            hasIssues = true;
        }
    }
    
    if (!hasIssues) {
        console.log('  ✓ No hierarchy issues found');
    }
}

// Extract form fields
function extractFormFields(tree) {
    const formRoles = ['textbox', 'combobox', 'checkbox', 'radio', 'searchbox', 'spinbutton', 'slider'];
    const fields = [];
    
    formRoles.forEach(role => {
        const nodes = findNodesByRole(tree, role);
        nodes.forEach(node => fields.push({ ...node, fieldRole: role }));
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('FORM FIELDS');
    console.log('='.repeat(60) + '\n');
    
    if (fields.length === 0) {
        console.log('No form fields found.');
    } else {
        console.log(`Found ${fields.length} form field(s):\n`);
        
        const byRole = {};
        fields.forEach(field => {
            const role = getRole(field) || field.fieldRole;
            if (!byRole[role]) byRole[role] = [];
            byRole[role].push(field);
        });
        
        Object.entries(byRole).forEach(([role, items]) => {
            console.log(`\n${role.toUpperCase()} (${items.length}):`);
            items.forEach((field, idx) => {
                const label = getName(field) || '(unlabeled)';
                const required = field.required ? ' [REQUIRED]' : '';
                const invalid = field.invalid === 'true' ? ' [INVALID]' : '';
                console.log(`  ${idx + 1}. ${label}${required}${invalid}`);
            });
        });
        
        // Check for unlabeled fields
        const unlabeled = fields.filter(f => {
            const name = getName(f);
            return !name || name.trim() === '';
        });
        if (unlabeled.length > 0) {
            console.log(`\n⚠ Warning: ${unlabeled.length} unlabeled field(s) found`);
        }
    }
}

// Extract interactive elements
function extractInteractive(tree) {
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'tab', 'menuitem'];
    const elements = [];
    
    interactiveRoles.forEach(role => {
        const nodes = findNodesByRole(tree, role);
        nodes.forEach(node => elements.push({ ...node, role }));
    });
    
    console.log('\n' + '='.repeat(60));
    console.log('INTERACTIVE ELEMENTS');
    console.log('='.repeat(60) + '\n');
    
    console.log(`Found ${elements.length} interactive element(s):\n`);
    
    const byRole = {};
    elements.forEach(el => {
        if (!byRole[el.role]) byRole[el.role] = [];
        byRole[el.role].push(el);
    });
    
    console.log('Distribution by role:');
    Object.entries(byRole).sort((a, b) => b[1].length - a[1].length).forEach(([role, items]) => {
        console.log(`  ${role.padEnd(15)}: ${items.length}`);
    });
}

// Check for common violations
function checkA11yViolations(tree) {
    console.log('\n' + '='.repeat(60));
    console.log('ACCESSIBILITY VIOLATIONS CHECK');
    console.log('='.repeat(60) + '\n');
    
    const violations = [];
    
    // 1. Unlabeled buttons
    const buttons = findNodesByRole(tree, 'button');
    const unlabeledButtons = buttons.filter(btn => {
        const name = getName(btn);
        return !name || name.trim() === '';
    });
    if (unlabeledButtons.length > 0) {
        violations.push({
            severity: 'error',
            rule: 'button-name',
            message: `${unlabeledButtons.length} button(s) without accessible name`,
            count: unlabeledButtons.length
        });
    }
    
    // 2. Images without alt text
    const images = findNodesByRole(tree, 'img');
    const unlabeledImages = images.filter(img => {
        const name = getName(img);
        return !name || name.trim() === '';
    });
    if (unlabeledImages.length > 0) {
        violations.push({
            severity: 'error',
            rule: 'image-alt',
            message: `${unlabeledImages.length} image(s) without alt text`,
            count: unlabeledImages.length
        });
    }
    
    // 3. Links without text
    const links = findNodesByRole(tree, 'link');
    const unlabeledLinks = links.filter(link => {
        const name = getName(link);
        return !name || name.trim() === '';
    });
    if (unlabeledLinks.length > 0) {
        violations.push({
            severity: 'error',
            rule: 'link-name',
            message: `${unlabeledLinks.length} link(s) without text`,
            count: unlabeledLinks.length
        });
    }
    
    // 4. Form fields without labels
    const formRoles = ['textbox', 'combobox', 'checkbox', 'radio'];
    const formFields = [];
    formRoles.forEach(role => formFields.push(...findNodesByRole(tree, role)));
    const unlabeledFields = formFields.filter(f => {
        const name = getName(f);
        return !name || name.trim() === '';
    });
    if (unlabeledFields.length > 0) {
        violations.push({
            severity: 'error',
            rule: 'label',
            message: `${unlabeledFields.length} form field(s) without label`,
            count: unlabeledFields.length
        });
    }
    
    // 5. Heading hierarchy
    const headings = findNodes(tree, n => getRole(n) === 'heading');
    const levels = headings.map(h => h.node.level).filter(l => l);
    const sortedLevels = [...new Set(levels)].sort((a, b) => a - b);
    
    if (sortedLevels.length > 0 && sortedLevels[0] !== 1) {
        violations.push({
            severity: 'warning',
            rule: 'heading-order',
            message: `First heading is H${sortedLevels[0]}, should be H1`,
            count: 1
        });
    }
    
    for (let i = 1; i < sortedLevels.length; i++) {
        if (sortedLevels[i] - sortedLevels[i - 1] > 1) {
            violations.push({
                severity: 'warning',
                rule: 'heading-order',
                message: `Heading hierarchy skips from H${sortedLevels[i - 1]} to H${sortedLevels[i]}`,
                count: 1
            });
            break;
        }
    }
    
    // Summary
    if (violations.length === 0) {
        console.log('✓ No violations found!\n');
    } else {
        const errors = violations.filter(v => v.severity === 'error');
        const warnings = violations.filter(v => v.severity === 'warning');
        
        console.log(`Found ${violations.length} issue(s):`);
        console.log(`  Errors:   ${errors.length}`);
        console.log(`  Warnings: ${warnings.length}`);
        console.log('');
        
        if (errors.length > 0) {
            console.log('ERRORS:');
            errors.forEach((v, idx) => {
                console.log(`  ${idx + 1}. [${v.rule}] ${v.message}`);
            });
            console.log('');
        }
        
        if (warnings.length > 0) {
            console.log('WARNINGS:');
            warnings.forEach((v, idx) => {
                console.log(`  ${idx + 1}. [${v.rule}] ${v.message}`);
            });
            console.log('');
        }
    }
}

// Main
try {
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: File not found: ${inputFile}`);
        process.exit(1);
    }
    
    const axData = parseJSONL(inputFile);
    
    if (axData.length === 0) {
        console.error('No accessibility data found in file.');
        process.exit(1);
    }
    
    console.log(`\nAnalyzing: ${inputFile}`);
    console.log(`Found ${axData.length} accessibility snapshot(s)\n`);
    
    // Use the most recent (last) snapshot
    const snapshot = axData[axData.length - 1];
    console.log(`Using snapshot #${snapshot.snapshot_id} (${snapshot.label})`);
    console.log(`Timestamp: ${snapshot.timestamp}`);
    
    const tree = snapshot.tree;
    
    // Default: check violations
    if (!checkUnlabeledButtons && !checkHeadingStructure && !checkFormFields && !checkInteractive && !checkViolations) {
        checkA11yViolations(tree);
    } else {
        if (checkUnlabeledButtons) extractUnlabeledButtons(tree);
        if (checkHeadingStructure) extractHeadingStructure(tree);
        if (checkFormFields) extractFormFields(tree);
        if (checkInteractive) extractInteractive(tree);
        if (checkViolations) checkA11yViolations(tree);
    }
    
    console.log('');
    
} catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
}
