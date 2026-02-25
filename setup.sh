#!/bin/bash

# Minecraft Server Manager - Complete Setup Script for Unix/Linux/macOS
# Automatically installs: Node.js, Docker, PostgreSQL, and all dependencies
# Run with: bash setup.sh

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Arrays to track what needs to be installed
MISSING_PACKAGES=()
NEEDS_NODEJS=false
NEEDS_DOCKER=false
NEEDS_POSTGRESQL=false
NEEDS_GIT=false

# Functions
print_header() {
    echo ""
    echo -e "${BLUE}============================================================${NC}"
    echo "    🎮 Minecraft Server Manager - Automated Setup"
    echo -e "${BLUE}============================================================${NC}"
    echo ""
}

print_step() {
    echo ""
    echo -e "${BLUE}$1${NC}"
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

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Detect OS
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS_TYPE="macos"
    elif [[ -f /etc/debian_version ]]; then
        OS_TYPE="debian"
    elif [[ -f /etc/redhat-release ]]; then
        OS_TYPE="redhat"
    else
        OS_TYPE="unknown"
    fi
}

# Main setup
print_header

echo "This script will automatically install all required dependencies:"
echo "  - Node.js and npm"
echo "  - Docker and Docker Compose"
echo "  - PostgreSQL"
echo "  - Git (recommended)"
echo "  - Project dependencies"
echo ""
echo "⚠️  This script requires sudo privileges to install system packages."
echo ""

detect_os

# PHASE 1: CHECK ALL DEPENDENCIES
print_step "Phase 1: Checking System Dependencies"
echo ""

# Check for curl (needed for installations)
print_info "Checking for curl..."
if ! command -v curl &> /dev/null; then
    print_warning "curl not found - will be installed"
    MISSING_PACKAGES+=("curl")
else
    print_success "curl found"
fi

# Check for sudo
if ! command -v sudo &> /dev/null && [ "$EUID" -ne 0 ]; then
    print_error "sudo is required but not found"
    echo "Please install sudo or run this script as root"
    exit 1
fi

# Check for Node.js
print_info "Checking for Node.js..."
if ! command -v node &> /dev/null; then
    print_warning "Node.js not found - will be installed"
    NEEDS_NODEJS=true
else
    NODE_VERSION=$(node --version)
    print_success "Node.js found: $NODE_VERSION"
fi

# Check for npm
print_info "Checking for npm..."
if ! command -v npm &> /dev/null; then
    print_warning "npm not found - will be installed with Node.js"
    NEEDS_NODEJS=true
else
    NPM_VERSION=$(npm --version)
    print_success "npm found: $NPM_VERSION"
fi

# Check for Git
print_info "Checking for Git..."
if ! command -v git &> /dev/null; then
    print_warning "Git not found - will be installed (recommended)"
    NEEDS_GIT=true
    if [[ "$OS_TYPE" == "debian" ]] || [[ "$OS_TYPE" == "redhat" ]]; then
        MISSING_PACKAGES+=("git")
    fi
else
    GIT_VERSION=$(git --version)
    print_success "Git found: $GIT_VERSION"
fi

# Check for Docker
print_info "Checking for Docker..."
if ! command -v docker &> /dev/null; then
    print_warning "Docker not found - will be installed"
    NEEDS_DOCKER=true
else
    DOCKER_VERSION=$(docker --version)
    print_success "Docker found: $DOCKER_VERSION"
fi

# Check for Docker Compose
print_info "Checking for Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    if ! docker compose version &> /dev/null 2>&1; then
        print_warning "Docker Compose not found - will be installed"
    else
        print_success "Docker Compose v2 found (docker compose)"
        COMPOSE_CMD="docker compose"
    fi
else
    COMPOSE_VERSION=$(docker-compose --version)
    print_success "Docker Compose found: $COMPOSE_VERSION"
    COMPOSE_CMD="docker-compose"
fi

# Check for PostgreSQL
print_info "Checking for PostgreSQL..."
if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL not found - will be installed"
    NEEDS_POSTGRESQL=true
else
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL found: $PSQL_VERSION"
fi

echo ""
print_step "Phase 2: Installing Missing Dependencies"
echo ""

# Only proceed if there's something to install
if [ "$NEEDS_NODEJS" = true ] || [ "$NEEDS_DOCKER" = true ] || [ "$NEEDS_POSTGRESQL" = true ] || [ "${#MISSING_PACKAGES[@]}" -gt 0 ]; then
    
    if [[ "$OS_TYPE" == "debian" ]]; then
        # Ubuntu/Debian - batch installation
        echo "📦 Preparing to install missing packages on Ubuntu/Debian..."
        echo ""
        
        # Run apt-get update once
        print_info "Updating package lists..."
        sudo apt-get update
        print_success "Package lists updated"
        echo ""
        
        # Install basic packages first (curl, git, etc.)
        if [ "${#MISSING_PACKAGES[@]}" -gt 0 ]; then
            print_info "Installing: ${MISSING_PACKAGES[*]}"
            sudo apt-get install -y "${MISSING_PACKAGES[@]}"
            print_success "Basic packages installed"
            echo ""
        fi
        
        # Install Node.js if needed
        if [ "$NEEDS_NODEJS" = true ]; then
            print_info "Installing Node.js 20.x LTS..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            NODE_VERSION=$(node --version)
            print_success "Node.js $NODE_VERSION installed"
            NPM_VERSION=$(npm --version)
            print_success "npm $NPM_VERSION installed"
            echo ""
        fi
        
        # Install Docker if needed
        if [ "$NEEDS_DOCKER" = true ]; then
            print_info "Installing Docker..."
            
            # Install prerequisites
            sudo apt-get install -y ca-certificates gnupg lsb-release
            
            # Add Docker's official GPG key
            sudo mkdir -p /etc/apt/keyrings
            curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
            
            # Set up repository
            echo \
              "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
              $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
            
            # Install Docker (single update and install)
            sudo apt-get update
            sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
            
            # Start Docker and add user to docker group
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker $USER
            
            DOCKER_VERSION=$(docker --version)
            print_success "Docker installed: $DOCKER_VERSION"
            print_info "Docker group permissions configured for current user"
            echo ""
            
            # Set compose command
            if docker compose version &> /dev/null 2>&1; then
                COMPOSE_CMD="docker compose"
            else
                COMPOSE_CMD="docker-compose"
            fi
        fi
        
        # Install PostgreSQL if needed
        if [ "$NEEDS_POSTGRESQL" = true ]; then
            print_info "Installing PostgreSQL..."
            sudo apt-get install -y postgresql postgresql-contrib
            
            # Start PostgreSQL
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            
            PSQL_VERSION=$(psql --version)
            print_success "PostgreSQL installed: $PSQL_VERSION"
            echo ""
        fi
        
    elif [[ "$OS_TYPE" == "redhat" ]]; then
        # RHEL/Fedora/CentOS - batch installation
        echo "📦 Preparing to install missing packages on RHEL/Fedora..."
        echo ""
        
        # Install basic packages
        if [ "${#MISSING_PACKAGES[@]}" -gt 0 ]; then
            print_info "Installing: ${MISSING_PACKAGES[*]}"
            sudo dnf install -y "${MISSING_PACKAGES[@]}"
            print_success "Basic packages installed"
            echo ""
        fi
        
        # Install Node.js if needed
        if [ "$NEEDS_NODEJS" = true ]; then
            print_info "Installing Node.js 20.x LTS..."
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo dnf install -y nodejs
            NODE_VERSION=$(node --version)
            print_success "Node.js $NODE_VERSION installed"
            echo ""
        fi
        
        # Install Docker if needed
        if [ "$NEEDS_DOCKER" = true ]; then
            print_info "Installing Docker..."
            sudo dnf -y install dnf-plugins-core
            sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
            sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
            
            sudo systemctl start docker
            sudo systemctl enable docker
            sudo usermod -aG docker $USER
            
            DOCKER_VERSION=$(docker --version)
            print_success "Docker installed: $DOCKER_VERSION"
            print_info "Docker group permissions configured for current user"
            echo ""
        fi
        
        # Install PostgreSQL if needed
        if [ "$NEEDS_POSTGRESQL" = true ]; then
            print_info "Installing PostgreSQL..."
            sudo dnf install -y postgresql-server postgresql-contrib
            sudo postgresql-setup --initdb
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            
            PSQL_VERSION=$(psql --version)
            print_success "PostgreSQL installed: $PSQL_VERSION"
            echo ""
        fi
        
    elif [[ "$OS_TYPE" == "macos" ]]; then
        # macOS - using Homebrew
        echo "📦 Preparing to install missing packages on macOS..."
        echo ""
        
        # Check/Install Homebrew
        if ! command -v brew &> /dev/null; then
            print_warning "Homebrew not found. Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            print_success "Homebrew installed"
        fi
        
        # Build list of packages to install
        BREW_PACKAGES=()
        [ "$NEEDS_NODEJS" = true ] && BREW_PACKAGES+=("node")
        [ "$NEEDS_GIT" = true ] && BREW_PACKAGES+=("git")
        [ "$NEEDS_POSTGRESQL" = true ] && BREW_PACKAGES+=("postgresql@15")
        
        # Install all at once
        if [ "${#BREW_PACKAGES[@]}" -gt 0 ]; then
            print_info "Installing: ${BREW_PACKAGES[*]}"
            brew install "${BREW_PACKAGES[@]}"
            print_success "Packages installed via Homebrew"
            
            # Start PostgreSQL if installed
            if [ "$NEEDS_POSTGRESQL" = true ]; then
                brew services start postgresql@15
            fi
        fi
        
        # Docker on macOS requires Docker Desktop
        if [ "$NEEDS_DOCKER" = true ]; then
            print_warning "Docker on macOS requires Docker Desktop"
            print_info "Download from: https://www.docker.com/products/docker-desktop"
            echo "After installing Docker Desktop, re-run this script."
            exit 1
        fi
    else
        print_error "Unknown OS. Cannot auto-install packages."
        echo "Please install manually: Node.js, Docker, PostgreSQL, Git"
        exit 1
    fi
    
    print_success "All system dependencies installed!"
    
else
    print_success "All system dependencies already installed!"
fi

# Determine Docker Compose command
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    print_error "Docker Compose not found!"
    echo "This should have been installed with Docker. Please check your Docker installation."
    exit 1
fi

print_info "Using Docker Compose command: $COMPOSE_CMD"

echo ""
print_step "Phase 3: Configuring PostgreSQL Database"
echo ""

if command -v psql &> /dev/null; then
    echo "🔧 Setting up database and user..."
    
    # Generate a random password for the database user
    DB_PASSWORD=$(openssl rand -base64 16 2>/dev/null || cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
    DB_NAME="minecraft_manager"
    DB_USER="minecraft_user"
    
    # Create database and user as postgres superuser
    sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    sudo -u postgres psql << EOF
-- Create database
CREATE DATABASE $DB_NAME;

-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Connect to database and grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;

\q
EOF
    
    if [ $? -eq 0 ]; then
        print_success "Database '$DB_NAME' and user '$DB_USER' configured"
        
        # Store credentials for later use
        export PG_HOST="localhost"
        export PG_PORT="5432"
        export PG_DATABASE="$DB_NAME"
        export PG_USER="$DB_USER"
        export PG_PASSWORD="$DB_PASSWORD"
        
        echo "📝 Database credentials generated (will be added to .env)"
    else
        print_warning "Database might already exist or there was an error"
        echo "If deploying with Docker, PostgreSQL will be configured automatically"
    fi
else
    print_warning "PostgreSQL client not available for configuration"
    echo "If using Docker deployment, PostgreSQL will be configured automatically"
fi

echo ""
print_step "Phase 4: Setting up environment variables"
echo ""

if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # If PostgreSQL was configured, update .env with database credentials
    if [ ! -z "$PG_PASSWORD" ]; then
        echo ""
        echo "🔐 Adding PostgreSQL credentials to .env..."
        
        # Update or add PostgreSQL settings
        if grep -q "^DATABASE_URL=" .env; then
            sed -i.bak "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}|" .env
        else
            echo "" >> .env
            echo "# PostgreSQL Configuration (auto-generated)" >> .env
            echo "DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}" >> .env
        fi
        
        # Also add individual components
        {
            echo "DB_HOST=${PG_HOST}"
            echo "DB_PORT=${PG_PORT}"
            echo "DB_NAME=${PG_DATABASE}"
            echo "DB_USER=${PG_USER}"
            echo "DB_PASSWORD=${PG_PASSWORD}"
        } >> .env
        
        print_success "Database credentials added to .env"
    fi
    
    print_success ".env file created"
    echo ""
else
    print_success ".env file already exists"
    
    # Update with PostgreSQL credentials if they were just created
    if [ ! -z "$PG_PASSWORD" ]; then
        if ! grep -q "^DATABASE_URL=" .env; then
            echo ""
            echo "🔐 Adding PostgreSQL credentials to existing .env..."
            {
                echo ""
                echo "# PostgreSQL Configuration (auto-generated)"
                echo "DATABASE_URL=postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DATABASE}"
                echo "DB_HOST=${PG_HOST}"
                echo "DB_PORT=${PG_PORT}"
                echo "DB_NAME=${PG_DATABASE}"
                echo "DB_USER=${PG_USER}"
                echo "DB_PASSWORD=${PG_PASSWORD}"
            } >> .env
            print_success "Database credentials added to .env"
        fi
    fi
fi

echo ""
print_step "Phase 5: Installing dependencies"
echo ""

print_info "Installing backend dependencies..."

if [ -d backend/node_modules ]; then
    print_success "Backend dependencies already installed"
else
    echo "📦 Installing backend npm packages..."
    cd backend
    npm install
    cd ..
    print_success "Backend dependencies installed"
fi

print_info "Installing frontend dependencies..."

if [ -d frontend/node_modules ]; then
    print_success "Frontend dependencies already installed"
else
    echo "📦 Installing frontend npm packages..."
    cd frontend
    npm install
    cd ..
    print_success "Frontend dependencies installed"
fi

echo ""
print_step "Phase 6: Building Docker images"
echo ""

# Check if user has docker permissions
if ! docker ps &> /dev/null; then
    print_error "Docker permission denied - activating docker group..."
    echo ""
    echo "Your user was added to the docker group, but the group membership"
    echo "is not yet active in this shell session."
    echo ""
    echo "Run this command to activate it and continue:"
    echo ""
    echo "  newgrp docker"
    echo ""
    echo "Then re-run this script starting from this point:"
    echo "  bash setup.sh"
    echo ""
    exit 1
fi

echo "🔨 Building Docker images (this may take a few minutes)..."
$COMPOSE_CMD build

print_success "Docker images built successfully"

echo ""
print_step "Phase 7: Deploying application"
echo ""

echo "🚀 Starting containers..."
$COMPOSE_CMD up -d

print_success "Application deployed successfully!"

# Wait a moment for containers to start
sleep 3

# Check container status
echo ""
echo "📊 Container Status:"
$COMPOSE_CMD ps

# Completion message
echo ""
echo -e "${BLUE}============================================================${NC}"
echo "    ✅ Setup Complete & Application Deployed!"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo "🎉 Your Minecraft Server Manager is now running!"
echo ""
echo "📱 Access the application:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000/api/health"
echo "  API Docs: http://localhost:5000/api-docs"
echo ""

# Show database info if configured
if [ ! -z "$PG_PASSWORD" ]; then
    echo "🗄️  PostgreSQL Database:"
    echo "  Database: $DB_NAME"
    echo "  User:     $DB_USER"
    echo "  Password: $PG_PASSWORD"
    echo "  (Credentials saved in .env file)"
    echo ""
fi

echo "🔐 Default Admin Account:"
echo "  Username: admin"
echo "  Password: admin123"
echo "  ⚠️  Change this in production!"
echo ""
echo "⚙️  Useful Commands:"
echo "  View logs:    $COMPOSE_CMD logs -f"
echo "  Stop app:     $COMPOSE_CMD down"
echo "  Restart app:  $COMPOSE_CMD restart"
echo "  View status:  $COMPOSE_CMD ps"
echo ""
echo "📚 Documentation:"
echo "  - README.md: Project overview"
echo "  - NEW_FEATURES_GUIDE.md: Version 2.0 features"
echo "  - DEPLOYMENT.md: Production deployment guide"
echo ""
echo "💡 Next Steps:"
echo "  1. Visit http://localhost:3000 and login with:"
echo "     Username: admin"
echo "     Password: admin123"
echo "  2. Click ⚙️ Configuration (admin only)"
echo "  3. Enter your Proxmox server details:"
echo "     - Proxmox Host/IP"
echo "     - Username (username@realm format)"
echo "     - Password or API Token"
echo "     - Realm (usually 'pam')"
echo "  4. Click '🔗 Test Connection' to verify"
echo "  5. Click '💾 Save Configuration'"
echo ""
echo "Happy managing! 🎮"
echo ""
