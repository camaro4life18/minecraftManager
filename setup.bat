@echo off
REM Minecraft Server Manager - Setup Script for Windows
REM This script helps set up the application locally or for deployment

echo.
echo 🎮 Minecraft Server Manager - Setup
echo ===================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed. Please install Docker Desktop first.
    pause
    exit /b 1
)

echo ✅ Docker is installed
echo.

REM Check if .env file exists
if not exist .env (
    echo 📝 Creating .env file from template...
    copy .env.example .env
    echo.
    echo ⚠️  Please edit .env with your Proxmox credentials
    echo.
    echo Edit the following in .env:
    echo   - PROXMOX_HOST: Your Proxmox server IP or hostname
    echo   - PROXMOX_USERNAME: Your Proxmox username
    echo   - PROXMOX_PASSWORD: Your Proxmox password
    echo.
    pause
    exit /b 0
)

echo 📦 Building Docker images...
docker-compose build

echo.
echo 🚀 Starting containers...
docker-compose up -d

echo.
echo ✅ Application started!
echo.
echo Access the application at:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000/api/health
echo.
echo To view logs:
echo   docker-compose logs -f
echo.
echo To stop:
echo   docker-compose down
echo.
pause
