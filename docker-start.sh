#!/bin/bash

# Minecraft Server Manager - Start with Docker (Unix/Linux/macOS)
# This script starts the entire application stack using Docker Compose

echo ""
echo "============================================================"
echo "    🎮 Minecraft Server Manager - Docker Startup"
echo "============================================================"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not running."
    echo "Please install Docker and ensure it's running."
    echo "Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Check if docker-compose is available
COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif command -v docker &> /dev/null && docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose is not installed."
    exit 1
fi

echo "✅ Using: $COMPOSE_CMD"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Please run setup.sh first to create configuration files."
    exit 1
fi

echo "📦 Building images and starting services..."
echo "Press Ctrl+C to stop the services"
echo ""

# Build and start
$COMPOSE_CMD up

# After user stops it (Ctrl+C), ask if they want to keep containers
echo ""
echo "============================================================"
echo "    Services stopped"
echo "============================================================"
echo ""
read -p "Do you want to remove the containers? (y/n) " CLEANUP

if [[ "$CLEANUP" =~ ^[Yy]$ ]]; then
    echo "Cleaning up containers..."
    $COMPOSE_CMD down
    echo "✅ Containers removed"
else
    echo "Containers left running. Use '$COMPOSE_CMD down' to stop them."
fi

echo ""
