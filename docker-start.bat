@echo off
REM Minecraft Server Manager - Start with Docker (Windows)
REM This script starts the entire application stack using Docker Compose

echo.
echo ============================================================
echo    🎮 Minecraft Server Manager - Docker Startup
echo ============================================================
echo.

REM Check if Docker is installed
docker --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Docker is not installed or not running.
    echo Please install Docker Desktop and ensure it's running.
    echo Download from: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)

echo ✅ Docker is running
echo.

REM Check if docker-compose is available
docker-compose --version >nul 2>&1
if errorlevel 1 (
    docker compose --version >nul 2>&1
    if errorlevel 1 (
        echo ❌ Docker Compose is not installed.
        pause
        exit /b 1
    )
    set COMPOSE_CMD=docker compose
) else (
    set COMPOSE_CMD=docker-compose
)

echo ✅ Docker Compose is available
echo.

REM Check if .env exists
if not exist .env (
    echo ⚠️  .env file not found!
    echo Please run setup.bat first to create configuration files.
    pause
    exit /b 1
)

echo 📦 Building images and starting services...
echo.

REM Build and start
%COMPOSE_CMD% up

REM After user stops it (Ctrl+C), ask if they want to keep containers
echo.
echo ============================================================
echo    Services stopped.
echo ============================================================
echo.
echo Do you want to remove the containers? (y/n)
set /p CLEANUP=
if /i "%CLEANUP%"=="y" (
    echo Cleaning up containers...
    %COMPOSE_CMD% down
    echo ✅ Containers removed
) else (
    echo Containers left running. Use 'docker-compose down' to stop them.
)

echo.
