#!/bin/bash

# Minecraft Server Manager - Setup Script
# This script helps set up the application locally or for deployment

set -e

echo "🎮 Minecraft Server Manager - Setup"
echo "=================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose are installed"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your Proxmox credentials"
    echo ""
    echo "Edit the following in .env:"
    echo "  - PROXMOX_HOST: Your Proxmox server IP or hostname"
    echo "  - PROXMOX_USERNAME: Your Proxmox username"
    echo "  - PROXMOX_PASSWORD: Your Proxmox password"
    echo ""
    exit 0
fi

echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting containers..."
docker-compose up -d

echo ""
echo "✅ Application started!"
echo ""
echo "Access the application at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000/api/health"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop:"
echo "  docker-compose down"
