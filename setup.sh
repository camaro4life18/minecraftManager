#!/bin/bash

# Minecraft Server Manager - Complete Setup Script for Unix/Linux/macOS
# Installs: Node.js, Docker, PostgreSQL, and all dependencies
# Run with: bash setup.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo "    🎮 Minecraft Server Manager - Unix Setup"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}Step $1: $2${NC}"
    echo "════════════════════════════════════"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Main setup
print_header

echo "This script will install all required dependencies:"
echo "  - Node.js and npm"
echo "  - Docker and Docker Compose"
echo "  - PostgreSQL"
echo "  - Project dependencies"
echo ""

# Step 1: Check/Install Node.js
print_step "1" "Checking for Node.js"

if ! command -v node &> /dev/null; then
    print_error "Node.js not found"
    echo ""
    echo "Install Node.js using your package manager:"
    echo ""
    echo "On Ubuntu/Debian:"
    echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
    echo "  sudo apt-get install -y nodejs"
    echo ""
    echo "On macOS (with Homebrew):"
    echo "  brew install node"
    echo ""
    echo "On Fedora/RHEL:"
    echo "  sudo dnf install nodejs"
    echo ""
    exit 1
else
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
fi

# Step 2: Check npm
print_step "2" "Checking for npm"

if ! command -v npm &> /dev/null; then
    print_error "npm not found. Please reinstall Node.js."
    exit 1
else
    NPM_VERSION=$(npm --version)
    print_success "npm found: $NPM_VERSION"
fi

# Step 3: Check Git
print_step "3" "Checking for Git"

if ! command -v git &> /dev/null; then
    print_warning "Git not found. This is recommended for version control."
    echo "Install with: sudo apt-get install git  (Debian/Ubuntu)"
    echo "             brew install git           (macOS)"
else
    GIT_VERSION=$(git --version)
    print_success "Git found: $GIT_VERSION"
fi

# Step 4: Check/Install Docker
print_step "4" "Checking for Docker"

if ! command -v docker &> /dev/null; then
    print_error "Docker not found"
    echo ""
    echo "Install Docker using:"
    echo ""
    echo "On Ubuntu/Debian:"
    echo "  curl -fsSL https://get.docker.com -o get-docker.sh"
    echo "  sudo sh get-docker.sh"
    echo ""
    echo "On macOS:"
    echo "  brew install docker docker-compose"
    echo "  or download Docker Desktop from https://www.docker.com/products/docker-desktop"
    echo ""
    exit 1
else
    DOCKER_VERSION=$(docker --version)
    print_success "Docker found: $DOCKER_VERSION"
fi

# Step 5: Check Docker Compose
print_step "5" "Checking for Docker Compose"

if ! command -v docker-compose &> /dev/null; then
    if ! command -v docker &> /dev/null; then
        print_error "Docker Compose not found"
        echo "Install with: sudo curl -L https://github.com/docker/compose/releases/latest/download/docker-compose-\$(uname -s)-\$(uname -m) -o /usr/local/bin/docker-compose"
        exit 1
    else
        print_success "Using 'docker compose' (newer version)"
    fi
else
    DOCKER_COMPOSE_VERSION=$(docker-compose --version)
    print_success "Docker Compose found: $DOCKER_COMPOSE_VERSION"
fi

# Step 6: Check PostgreSQL client (optional)
print_step "6" "Checking for PostgreSQL client"

if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL client not found (optional for local dev)"
    echo "You can still run with Docker PostgreSQL."
else
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL found: $PSQL_VERSION"
fi

# Step 7: Setup environment
print_step "7" "Setting up environment variables"

if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    print_success ".env file created"
    echo ""
    print_warning "IMPORTANT: Edit .env with your Proxmox credentials:"
    echo "  - PROXMOX_HOST: Your Proxmox IP/hostname"
    echo "  - PROXMOX_USERNAME: Your Proxmox API user"
    echo "  - PROXMOX_PASSWORD: Your Proxmox password"
else
    print_success ".env file already exists"
fi

# Step 8: Install backend dependencies
print_step "8" "Installing backend dependencies"

if [ -d backend/node_modules ]; then
    print_success "Backend dependencies already installed"
else
    echo "📦 Installing backend npm packages..."
    cd backend
    npm install
    cd ..
    print_success "Backend dependencies installed"
fi

# Step 9: Install frontend dependencies
print_step "9" "Installing frontend dependencies"

if [ -d frontend/node_modules ]; then
    print_success "Frontend dependencies already installed"
else
    echo "📦 Installing frontend npm packages..."
    cd frontend
    npm install
    cd ..
    print_success "Frontend dependencies installed"
fi

# Step 10: Build Docker images
print_step "10" "Building Docker images"

if command -v docker-compose &> /dev/null; then
    docker-compose build
else
    docker compose build
fi

print_success "Docker images built successfully"

# Completion message
echo ""
echo -e "${BLUE}============================================================${NC}"
echo "    ✅ Setup Complete!"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "🚀 To start the application:"
echo ""
echo "Option 1: Using Docker Compose (Recommended)"
echo "  docker-compose up"
echo ""
echo "Option 2: Running locally (requires PostgreSQL running)"
echo "  Terminal 1: npm run dev:backend"
echo "  Terminal 2: npm run dev:frontend"
echo ""
echo "📱 Access the application:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000"
echo ""
echo "🔐 Default Admin Account:"
echo "  Username: admin"
echo "  Password: admin123"
echo "  ⚠️  Change this in production!"
echo ""
echo "📚 Documentation:"
echo "  - README.md: Project overview"
echo "  - QUICKSTART.md: Quick start guide"
echo "  - DEPLOYMENT.md: Production deployment"
echo "  - DEVELOPMENT.md: Development setup"
echo ""
echo "Happy coding! 🎮"
echo ""

echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000/api/health"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f"
echo ""
echo "To stop:"
echo "  docker-compose down"
