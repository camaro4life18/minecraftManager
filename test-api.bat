@echo off
REM Minecraft Server Manager - API Test Script (Windows)
REM This script tests if your backend is working correctly

setlocal enabledelayedexpansion

set API_URL=%1
if "!API_URL!"=="" set API_URL=http://localhost:5000

cls
echo.
echo ==========================================
echo   Minecraft Server Manager - API Tests
echo ==========================================
echo.
echo API URL: %API_URL%
echo.

REM Test 1: Health Check
echo [Test 1] Health Check
echo Testing: GET /api/health
curl -s -o nul -w "HTTP Status: %%{http_code}\n" %API_URL%/api/health
echo.

REM Test 2: Get Servers
echo [Test 2] List All Servers
echo Testing: GET /api/servers
echo.
curl -s %API_URL%/api/servers | find "vmid" >nul
if errorlevel 1 (
    echo FAIL - Could not retrieve servers
    echo.
    echo Possible causes:
    echo   1. Proxmox credentials in .env are incorrect
    echo   2. Proxmox host is not reachable  
    echo   3. Proxmox user doesn't have permissions
    echo.
    echo Check logs: docker-compose logs backend
    echo.
) else (
    echo PASS - Successfully retrieved servers
    echo.
)

REM Test 3: Docker Containers (if Docker is available)
where docker >nul 2>&1
if errorlevel 1 (
    echo Docker not found, skipping container tests
) else (
    echo [Test 3] Docker Containers
    docker ps --filter "name=minecraft-manager-backend" --format "table {{.Names}}" | find "minecraft" >nul
    if errorlevel 1 (
        echo WARNING - Backend container not running
    ) else (
        echo PASS - Backend container is running
    )
    echo.
)

echo ==========================================
echo   Test Complete
echo ==========================================
echo.
echo If all tests passed, open your browser to:
echo   http://localhost:3000
echo.
echo Troubleshooting:
echo   View logs: docker-compose logs -f backend
echo   Restart: docker-compose down ^&^& docker-compose up -d
echo.
pause
