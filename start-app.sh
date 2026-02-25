#!/bin/bash

# Minecraft Server Manager - Start Application (Unix/Linux/macOS)
# This script starts both backend and frontend for local development

echo ""
echo "============================================================"
echo "    🎮 Minecraft Server Manager - Starting Application"
echo "============================================================"
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please run setup.sh first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d backend/node_modules ]; then
    echo "❌ Backend dependencies not installed. Please run setup.sh first."
    exit 1
fi

if [ ! -d frontend/node_modules ]; then
    echo "❌ Frontend dependencies not installed. Please run setup.sh first."
    exit 1
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found. Please run setup.sh first."
    exit 1
fi

echo "✅ All requirements met. Starting application..."
echo ""
echo "The application will start in the background."
echo "Both services will output logs here."
echo ""
echo "Press Ctrl+C to stop both services."
echo ""
read -p "Press Enter to continue..." dummy

# Create a function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    wait 2>/dev/null || true
    echo "✅ Services stopped"
}

# Set trap to run cleanup on exit
trap cleanup EXIT INT TERM

# Start backend in background
echo "Starting backend..."
cd backend
npm run dev:backend &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 3

# Start frontend in background
echo "Starting frontend..."
cd frontend
npm run dev:frontend &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Both services are starting..."
echo ""
echo "🌐 Access the application:"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:5000"
echo ""
echo "🔐 Login with:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "Services are running. Press Ctrl+C to stop them."
echo ""

# Wait for both processes
wait
