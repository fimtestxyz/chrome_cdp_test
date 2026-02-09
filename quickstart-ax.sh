#!/bin/bash

# Quick Start Script for Accessibility Tree Capture
# Shows common usage patterns

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  Accessibility Tree Capture - Quick Start                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if profile exists
if [ ! -d "chrome-profiles/profile1" ]; then
    echo "Creating test profile..."
    ./chrome-profile-manager.sh create profile1 9222
    echo ""
fi

# Check if Chrome is running
if ! ./chrome-profile-manager.sh status profile1 | grep -q "Running"; then
    echo "Starting Chrome with profile1..."
    ./chrome-profile-manager.sh start profile1
    echo ""
    sleep 2
fi

echo "Choose a demo:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1) Basic capture (one-time AX snapshot)"
echo "2) Watch mode (periodic snapshots every 5s)"
echo "3) Save AX snapshots to separate files"
echo "4) Filter by roles (buttons, links, headings only)"
echo "5) Use raw CDP for detailed tree"
echo "6) Full capture with all options"
echo "7) Custom URL"
echo "8) View existing captures"
echo ""
read -p "Enter choice (1-8): " choice
echo ""

URL="example.com"

case $choice in
    1)
        echo "Running: Basic capture..."
        echo "Command: node capture-with-ax.js profile1 $URL"
        echo ""
        node capture-with-ax.js profile1 $URL
        ;;
    2)
        echo "Running: Watch mode (every 5 seconds)..."
        echo "Command: node capture-with-ax.js profile1 $URL --ax-watch 5000"
        echo ""
        echo "TIP: Interact with the page to see changes. Press Ctrl+C to stop."
        echo ""
        node capture-with-ax.js profile1 $URL --ax-watch 5000
        ;;
    3)
        echo "Running: Save to separate files..."
        echo "Command: node capture-with-ax.js profile1 $URL --ax-files"
        echo ""
        node capture-with-ax.js profile1 $URL --ax-files
        ;;
    4)
        echo "Running: Filter by roles (button, link, heading)..."
        echo "Command: node capture-with-ax.js profile1 $URL --ax-roles button,link,heading"
        echo ""
        node capture-with-ax.js profile1 $URL --ax-roles button,link,heading
        ;;
    5)
        echo "Running: Raw CDP capture..."
        echo "Command: node capture-with-ax.js profile1 $URL --ax-cdp"
        echo ""
        node capture-with-ax.js profile1 $URL --ax-cdp
        ;;
    6)
        echo "Running: Full capture with all options..."
        echo "Command: node capture-with-ax.js profile1 $URL --ax-watch 5000 --ax-files --ax-cdp"
        echo ""
        echo "TIP: This will watch every 5s and save snapshots. Press Ctrl+C to stop."
        echo ""
        node capture-with-ax.js profile1 $URL --ax-watch 5000 --ax-files --ax-cdp
        ;;
    7)
        read -p "Enter URL (e.g., github.com): " custom_url
        echo ""
        echo "Running: Basic capture for $custom_url..."
        echo "Command: node capture-with-ax.js profile1 $custom_url"
        echo ""
        node capture-with-ax.js profile1 "$custom_url"
        ;;
    8)
        echo "Existing captures in payload/:"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo ""
        
        if [ ! -d "payload" ] || [ -z "$(ls -A payload 2>/dev/null)" ]; then
            echo "No captures found. Run a capture first!"
        else
            ls -lth payload/*.jsonl 2>/dev/null | head -10 || echo "No .jsonl files found"
            echo ""
            
            # Find most recent file
            LATEST=$(ls -t payload/*.jsonl 2>/dev/null | head -1)
            
            if [ -n "$LATEST" ]; then
                echo "Most recent: $LATEST"
                echo ""
                read -p "Analyze this file? (y/n): " analyze
                
                if [ "$analyze" = "y" ] || [ "$analyze" = "Y" ]; then
                    echo ""
                    echo "Analysis options:"
                    echo "1) Summary"
                    echo "2) AX statistics"
                    echo "3) Requests"
                    echo "4) Full AX trees"
                    echo ""
                    read -p "Choose (1-4): " analysis_choice
                    echo ""
                    
                    case $analysis_choice in
                        1) node analyze-capture.js "$LATEST" --summary ;;
                        2) node analyze-capture.js "$LATEST" --ax-stats ;;
                        3) node analyze-capture.js "$LATEST" --requests ;;
                        4) node analyze-capture.js "$LATEST" --ax ;;
                        *) node analyze-capture.js "$LATEST" --summary ;;
                    esac
                fi
            fi
        fi
        
        echo ""
        exit 0
        ;;
    *)
        echo "Invalid choice. Exiting."
        exit 1
        ;;
esac

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Capture complete! Next steps:"
echo ""
echo "1. View all captures:"
echo "   ls -lth payload/"
echo ""
echo "2. Analyze the capture:"
echo "   node analyze-capture.js payload/[filename].jsonl --summary"
echo ""
echo "3. View AX statistics:"
echo "   node analyze-capture.js payload/[filename].jsonl --ax-stats"
echo ""
echo "For more options, see: AX-CAPTURE-GUIDE.md"
echo ""
