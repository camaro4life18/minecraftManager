#!/bin/bash
# Test script to validate plugin upgrade functionality
# Run this on the minecraft server as: sudo -n -u minecraft bash test-plugin-upgrade.sh

set -e

MINECRAFT_PATH="/opt/minecraft/paper"
PLUGIN_NAME="bluemap-5.11-paper.jar"
SLUG="bluemap"

echo "=== Plugin Upgrade Test ==="
echo "Minecraft Path: $MINECRAFT_PATH"
echo "Plugin: $PLUGIN_NAME"
echo "Slug: $SLUG"
echo ""

# Test 1: Check if plugin exists
echo "[1] Checking if plugin exists..."
if [ -f "$MINECRAFT_PATH/plugins/$PLUGIN_NAME" ]; then
    echo "✓ Plugin found"
    ls -lh "$MINECRAFT_PATH/plugins/$PLUGIN_NAME"
else
    echo "✗ Plugin not found at $MINECRAFT_PATH/plugins/$PLUGIN_NAME"
    exit 1
fi
echo ""

# Test 2: Create temp directory and test permissions
echo "[2] Testing write permissions to minecraft directory..."
TEMP_TEST="$MINECRAFT_PATH/test-write-$$"
if touch "$TEMP_TEST" 2>/dev/null; then
    rm "$TEMP_TEST"
    echo "✓ Write permissions OK"
else
    echo "✗ Cannot write to $MINECRAFT_PATH"
    exit 1
fi
echo ""

# Test 3: Test curl download with verbose output
echo "[3] Testing curl download from Hangar..."
DOWNLOAD_URL="https://hangar.papermc.io/api/v1/projects/$SLUG/latest/download"
TEMP_JAR="$MINECRAFT_PATH/test-download-$$.jar"

echo "URL: $DOWNLOAD_URL"
echo "Temp file: $TEMP_JAR"

# Run curl with verbose output to see what's happening
if curl -v -L -f -o "$TEMP_JAR" "$DOWNLOAD_URL" 2>&1 | tee /tmp/curl-output.txt; then
    echo ""
    echo "✓ Download succeeded"
    if [ -f "$TEMP_JAR" ]; then
        SIZE=$(ls -lh "$TEMP_JAR" | awk '{print $5}')
        echo "  Downloaded file size: $SIZE"
        # Check if it's a valid JAR file
        if file "$TEMP_JAR" | grep -q "Java"; then
            echo "✓ File is a valid JAR"
        else
            echo "⚠ File might not be a valid JAR"
            file "$TEMP_JAR"
        fi
        rm "$TEMP_JAR"
    else
        echo "✗ File not created despite curl success"
    fi
else
    CURL_EXIT=$?
    echo ""
    echo "✗ Download failed with exit code $CURL_EXIT"
    echo ""
    echo "Curl output saved to /tmp/curl-output.txt"
    cat /tmp/curl-output.txt
    exit 1
fi
echo ""

# Test 4: Simulate full upgrade
echo "[4] Simulating full upgrade process..."
BACKUP_PATH="$MINECRAFT_PATH/plugins/$PLUGIN_NAME.test-backup"
TEMP_PATH="$MINECRAFT_PATH/test-upgrade-$$.jar"

echo "  - Downloading to temp file: $TEMP_PATH"
if ! curl -L -f -o "$TEMP_PATH" "$DOWNLOAD_URL"; then
    echo "✗ Download failed during simulation"
    exit 1
fi

echo "  - Creating backup: $BACKUP_PATH"
if ! cp "$MINECRAFT_PATH/plugins/$PLUGIN_NAME" "$BACKUP_PATH"; then
    echo "✗ Backup failed"
    rm "$TEMP_PATH"
    exit 1
fi

echo "  - Moving new file to plugins"
if ! mv "$TEMP_PATH" "$MINECRAFT_PATH/plugins/$PLUGIN_NAME.test"; then
    echo "✗ Move failed"
    rm "$BACKUP_PATH"
    rm "$TEMP_PATH" 2>/dev/null || true
    exit 1
fi

echo "  - Cleaning up test files"
rm "$MINECRAFT_PATH/plugins/$PLUGIN_NAME.test"
rm "$BACKUP_PATH"

echo "✓ Full upgrade simulation succeeded"
echo ""
echo "=== All tests passed! ==="
