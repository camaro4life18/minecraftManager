#!/bin/bash

# This script configures passwordless sudo for the minecraft server management
# Run this once on the Minecraft server (192.168.1.234) as root or via sudo

echo "🔧 Configuring passwordless sudo for minecraft server management..."

# Allow joseph user to run minecraft user commands without password
echo "Adding sudoers rule for joseph user..."
echo 'joseph ALL=(minecraft) NOPASSWD: ALL' | sudo tee /etc/sudoers.d/joseph-minecraft > /dev/null

# Set proper permissions on sudoers file
sudo chmod 0440 /etc/sudoers.d/joseph-minecraft

# Verify the configuration
echo "✓ Verifying sudoers configuration..."
sudo -l -U joseph | grep minecraft && echo "✓ Configuration successful!" || echo "❌ Configuration failed!"

echo ""
echo "✓ Setup complete! The backend can now run minecraft commands without password prompts."
