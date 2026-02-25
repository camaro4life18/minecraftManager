@echo off
REM Minecraft Server Manager - Complete Setup Script for Windows
REM Installs: Node.js, Docker, PostgreSQL, and all dependencies
REM Run this script as Administrator for best results

setlocal enabledelayedexpansion

echo.
echo ============================================================
echo    🎮 Minecraft Server Manager - Windows Setup
echo ============================================================
echo.
echo This script will install all required dependencies:
echo   - Node.js and npm
echo   - Docker Desktop
echo   - PostgreSQL
echo   - Project dependencies
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ⚠️  This script works best when run as Administrator.
    echo Please restart PowerShell/CMD as Administrator.
    echo.
    pause
)

echo.
echo Step 1: Checking for Node.js...
echo ════════════════════════════════════
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js not found. Installing Node.js...
    echo.
    echo Please download and install Node.js from: https://nodejs.org/
    echo Install with default settings, then re-run this script.
    echo.
    start https://nodejs.org/
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('node --version') do echo ✅ Node.js found: %%i
)

echo.
echo Step 2: Checking for npm...
echo ════════════════════════════════════
npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ npm not found. Please reinstall Node.js.
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('npm --version') do echo ✅ npm found: %%i
)

echo.
echo Step 3: Checking for Git...
echo ════════════════════════════════════
git --version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  Git not found. This is recommended for version control.
    echo Download from: https://git-scm.com/
) else (
    for /f "tokens=*" %%i in ('git --version') do echo ✅ Git found: %%i
)

echo.
echo Step 4: Checking for Docker Desktop...
echo ════════════════════════════════════
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker Desktop not found. Installing...
    echo.
    echo Please download and install Docker Desktop from:
    echo   https://www.docker.com/products/docker-desktop
    echo.
    echo After installation completes, re-run this script.
    echo.
    start https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
) else (
    for /f "tokens=*" %%i in ('docker --version') do echo ✅ Docker found: %%i
)

echo.
echo Step 5: Checking for PostgreSQL...
echo ════════════════════════════════════
psql --version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  PostgreSQL client not found (optional for local dev).
    echo You can still run with Docker PostgreSQL.
    echo Install from: https://www.postgresql.org/download/windows/
) else (
    for /f "tokens=*" %%i in ('psql --version') do echo ✅ PostgreSQL found: %%i
)

echo.
echo Step 6: Setting up environment variables...
echo ════════════════════════════════════
if not exist .env (
    echo 📝 Creating .env file from template...
    copy .env.example .env
    echo ✅ .env file created
    echo.
    echo ⚠️  IMPORTANT: Edit .env with your Proxmox credentials:
    echo    - PROXMOX_HOST: Your Proxmox IP/hostname
    echo    - PROXMOX_USERNAME: Your Proxmox API user
    echo    - PROXMOX_PASSWORD: Your Proxmox password
    echo.
) else (
    echo ✅ .env file already exists
)

echo.
echo Step 7: Installing backend dependencies...
echo ════════════════════════════════════
cd backend
if exist node_modules (
    echo ✅ Backend dependencies already installed
) else (
    echo 📦 Installing backend npm packages...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install backend dependencies
        pause
        exit /b 1
    )
    echo ✅ Backend dependencies installed
)
cd ..

echo.
echo Step 8: Installing frontend dependencies...
echo ════════════════════════════════════
cd frontend
if exist node_modules (
    echo ✅ Frontend dependencies already installed
) else (
    echo 📦 Installing frontend npm packages...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install frontend dependencies
        pause
        exit /b 1
    )
    echo ✅ Frontend dependencies installed
)
cd ..

echo.
echo Step 9: Building Docker images...
echo ════════════════════════════════════
docker-compose build
if errorlevel 1 (
    echo ❌ Failed to build Docker images
    pause
    exit /b 1
)
echo ✅ Docker images built successfully

echo.
echo ============================================================
echo    ✅ Setup Complete!
echo ============================================================
echo.
echo 🚀 To start the application:
echo.
echo Option 1: Using Docker Compose (Recommended)
echo   docker-compose up
echo.
echo Option 2: Running locally (requires PostgreSQL running)
echo   Terminal 1: npm run dev:backend
echo   Terminal 2: npm run dev:frontend
echo.
echo 📱 Access the application:
echo   Frontend: http://localhost:3000
echo   Backend:  http://localhost:5000
echo.
echo 🔐 Default Admin Account:
echo   Username: admin
echo   Password: admin123
echo   ⚠️  Change this in production!
echo.
echo 📚 Documentation:
echo   - README.md: Project overview
echo   - QUICKSTART.md: Quick start guide
echo   - DEPLOYMENT.md: Production deployment
echo   - DEVELOPMENT.md: Development setup
echo.
echo Happy coding! 🎮
echo.
pause
echo To view logs:
echo   docker-compose logs -f
echo.
echo To stop:
echo   docker-compose down
echo.
pause
