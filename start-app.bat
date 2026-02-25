@echo off
REM Minecraft Server Manager - Start Application (Windows)
REM This script starts both backend and frontend for local development

echo.
echo ============================================================
echo    🎮 Minecraft Server Manager - Starting Application
echo ============================================================
echo.

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed. Please run setup.bat first.
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist backend\node_modules (
    echo ❌ Backend dependencies not installed. Please run setup.bat first.
    pause
    exit /b 1
)

if not exist frontend\node_modules (
    echo ❌ Frontend dependencies not installed. Please run setup.bat first.
    pause
    exit /b 1
)

REM Check if .env file exists
if not exist .env (
    echo ❌ .env file not found. Please run setup.bat first.
    pause
    exit /b 1
)

echo ✅ All requirements met. Starting application...
echo.
echo The application will open in two separate windows:
echo   - Backend API (Terminal 1): http://localhost:5000
echo   - Frontend (Terminal 2): http://localhost:3000
echo.
echo Press Ctrl+C in either window to stop that service.
echo.
pause

REM Start backend in a new window
start "Minecraft Manager - Backend" cmd /k "cd backend && npm run dev:backend"

REM Give backend time to start
timeout /t 3 /nobreak

REM Start frontend in a new window
start "Minecraft Manager - Frontend" cmd /k "cd frontend && npm run dev:frontend"

echo.
echo ✅ Both services are starting...
echo.
echo 🌐 Access the application:
echo    Frontend: http://localhost:3000
echo    Backend:  http://localhost:5000
echo.
echo 🔐 Login with:
echo    Username: admin
echo    Password: admin123
echo.
