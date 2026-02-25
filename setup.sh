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
    print_warning "Docker not found. Installing Docker..."
    echo ""
    
    # Detect OS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        print_error "On macOS, please install Docker Desktop manually:"
        echo "  Download from: https://www.docker.com/products/docker-desktop"
        echo "  Or with Homebrew: brew install --cask docker"
        exit 1
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        echo "📦 Installing Docker on Debian/Ubuntu..."
        
        # Update package index
        sudo apt-get update
        
        # Install prerequisites
        sudo apt-get install -y ca-certificates curl gnupg lsb-release
        
        # Add Docker's official GPG key
        sudo mkdir -p /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        
        # Set up repository
        echo \
          "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
          $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
        
        # Install Docker
        sudo apt-get update
        sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
        
        # Add current user to docker group
        sudo usermod -aG docker $USER
        
        print_success "Docker installed successfully"
        print_warning "You may need to log out and back in for docker group permissions to take effect"
        
        # Start Docker service
        sudo systemctl start docker
        sudo systemctl enable docker
        
    elif [[ -f /etc/redhat-release ]]; then
        # RHEL/Fedora/CentOS
        echo "📦 Installing Docker on RHEL/Fedora..."
        sudo dnf -y install dnf-plugins-core
        sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
        sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
        
        sudo systemctl start docker
        sudo systemctl enable docker
        sudo usermod -aG docker $USER
        
        print_success "Docker installed successfully"
    else
        # Unknown OS - use universal script
        print_warning "Unknown OS. Attempting universal Docker install..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        print_success "Docker installed successfully"
    fi
else
    DOCKER_VERSION=$(docker --version)
    print_success "Docker found: $DOCKER_VERSION"
fi

# Step 5: Check Docker Compose
print_step "5" "Checking for Docker Compose"

if ! command -v docker-compose &> /dev/null; then
    # Check if docker compose (v2) is available
    if docker compose version &> /dev/null; then
        print_success "Using 'docker compose' (v2)"
        COMPOSE_CMD="docker compose"
    else
        print_warning "Docker Compose not found. Installing..."
        
        # Install docker-compose standalone
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        
        print_success "Docker Compose installed"
        COMPOSE_CMD="docker-compose"
    fi
else
    DOCKER_COMPOSE_VERSION=$(docker-compose --version)
    print_success "Docker Compose found: $DOCKER_COMPOSE_VERSION"
    COMPOSE_CMD="docker-compose"
fi

# Step 6: Check/Install PostgreSQL
print_step "6" "Checking for PostgreSQL"

if ! command -v psql &> /dev/null; then
    print_warning "PostgreSQL not found. Installing PostgreSQL..."
    echo ""
    
    # Detect OS and install PostgreSQL
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        print_warning "On macOS, installing PostgreSQL via Homebrew..."
        if command -v brew &> /dev/null; then
            brew install postgresql@15
            brew services start postgresql@15
            print_success "PostgreSQL installed and started"
        else
            print_error "Homebrew not found. Install from: https://brew.sh/"
            print_warning "Or install PostgreSQL from: https://www.postgresql.org/download/macosx/"
            echo "Note: Docker setup includes PostgreSQL, so you can skip this."
        fi
        
    elif [[ -f /etc/debian_version ]]; then
        # Debian/Ubuntu
        echo "📦 Installing PostgreSQL on Debian/Ubuntu..."
        
        sudo apt-get update
        sudo apt-get install -y postgresql postgresql-contrib
        
        # Start PostgreSQL service
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        
        print_success "PostgreSQL installed and started"
        
    elif [[ -f /etc/redhat-release ]]; then
        # RHEL/Fedora/CentOS
        echo "📦 Installing PostgreSQL on RHEL/Fedora..."
        
        sudo dnf install -y postgresql-server postgresql-contrib
        sudo postgresql-setup --initdb
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        
        print_success "PostgreSQL installed and started"
    else
        print_warning "Unknown OS. Please install PostgreSQL manually."
        echo "Or use Docker setup which includes PostgreSQL."
    fi
else
    PSQL_VERSION=$(psql --version)
    print_success "PostgreSQL found: $PSQL_VERSION"
fi

# Step 6.5: Configure PostgreSQL database and user
print_step "6.5" "Configuring PostgreSQL database"

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

# Step 7: Setup environment
print_step "7" "Setting up environment variables"

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
    print_warning "IMPORTANT: Edit .env with your Proxmox credentials:"
    echo "  - PROXMOX_HOST: Your Proxmox IP/hostname"
    echo "  - PROXMOX_USERNAME: Your Proxmox API user"
    echo "  - PROXMOX_PASSWORD: Your Proxmox password"
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

echo "🔨 Building Docker images (this may take a few minutes)..."
$COMPOSE_CMD build

print_success "Docker images built successfully"

# Step 11: Deploy application
print_step "11" "Deploying application"

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
echo "  1. Edit .env file with your Proxmox credentials"
echo "  2. Restart the application: $COMPOSE_CMD restart"
echo "  3. Visit http://localhost:3000 and login"
echo ""
echo "Happy managing! 🎮"
echo ""
