# Setup Guide - Minecraft Server Manager

This guide helps you get the Minecraft Server Manager running on your system.

## 📋 Prerequisites

The setup scripts will check for and help you install:
- **Node.js** (v16+) and npm
- **Docker** and Docker Compose
- **PostgreSQL** (optional - included in Docker)
- **Git** (optional - for version control)

## 🚀 Quick Start

### Windows Users

1. **Open PowerShell as Administrator**
   - Right-click PowerShell → Run as Administrator

2. **Run the setup script**
   ```powershell
   cd C:\Users\YourUsername\minecraft-web
   .\setup.bat
   ```

3. **Follow the prompts** - The script will:
   - Check for required software
   - Install missing dependencies
   - Create configuration files
   - Build Docker images

### macOS/Linux Users

1. **Open Terminal**

2. **Make the script executable and run it**
   ```bash
   cd ~/minecraft-web
   chmod +x setup.sh
   ./setup.sh
   ```

3. **Follow the prompts** - The script will check and install dependencies

## ⚙️ Configuration

After running the setup script, you need to configure your Proxmox connection:

### 1. Edit the `.env` file

The setup script creates a `.env` file. Edit it with your Proxmox details:

```env
# Proxmox Configuration
PROXMOX_HOST=proxmox.example.com
PROXMOX_USERNAME=root@pam
PROXMOX_PASSWORD=your-secure-password
PROXMOX_REALM=pam

# Node where VMs will be created
PROXMOX_NODE=pve

# Velocity Configuration (Optional)
VELOCITY_HOST=velocity.example.com
VELOCITY_PORT=8233
VELOCITY_API_KEY=your-api-key
```

### 2. Start the Application

#### Option A: Docker Compose (Recommended)
```bash
docker-compose up
```

#### Option B: Local Development
```bash
# Terminal 1: Start backend
npm run dev:backend

# Terminal 2: Start frontend
npm run dev:frontend
```

#### Option C: Using provided scripts
```bash
# Windows
.\start-app.bat

# macOS/Linux
./start-app.sh
```

## 🌐 Access the Application

Once running, access:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000

### Default Admin Account

```
Username: admin
Password: admin123
```

⚠️ **Change these credentials in production!**

## 🔧 Manual Installation (If Script Fails)

### Install Node.js

**Windows:**
- Download from https://nodejs.org/
- Run installer with default settings

**macOS:**
```bash
brew install node
```

**Ubuntu/Debian:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Install Docker

**Windows/macOS:**
- Download Docker Desktop: https://www.docker.com/products/docker-desktop

**Ubuntu/Debian:**
```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

### Install Dependencies Manually

```bash
# Install backend dependencies
cd backend
npm install
cd ..

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Build and Run

```bash
# Build Docker images
docker-compose build

# Start containers
docker-compose up
```

## 📱 Using the Admin Configuration Interface

After first login with admin account:

1. Click **⚙️ Configuration** in the header
2. **Switch to Proxmox tab** and enter:
   - Proxmox Host/IP
   - Username
   - Password/Token
   - Realm (usually "pam")
3. Click **🔗 Test Connection** to verify
4. Click **💾 Save Configuration**

The configuration is now stored in the database!

## 🔗 Using the Velocity Integration

If you have a Velocity proxy:

1. In admin settings, click the **Velocity Configuration** tab
2. Enter:
   - Velocity Host/IP
   - Port (default 8233)
   - API Key
   - Backend Network range
3. Click **🔗 Test Connection**
4. Click **💾 Save Configuration**

Servers created will automatically be added to your Velocity list!

## 📁 Project Structure

```
minecraft-web/
├── frontend/              # React application
│   ├── src/components/   # React components
│   ├── src/styles/       # Component styles
│   └── package.json
├── backend/              # Express.js API
│   ├── server.js         # Main server
│   ├── database.js       # PostgreSQL connection
│   ├── proxmoxClient.js  # Proxmox API wrapper
│   ├── velocityClient.js # Velocity integration
│   └── package.json
├── docker-compose.yml    # Docker configuration
├── .env.example          # Environment template
└── setup.bat/setup.sh    # Setup scripts
```

## 🐛 Troubleshooting

### Docker won't start
```bash
# Reset Docker on Windows
wsl --shutdown

# Restart Docker Desktop
```

### Port already in use
```bash
# Check what's using the port (macOS/Linux)
lsof -i :3000
lsof -i :5000

# On Windows PowerShell
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
```

### Database connection refused
```bash
# Check if PostgreSQL container is running
docker ps

# View container logs
docker logs minecraft_web-db-1
```

### Frontend not loading
```bash
# Clear npm cache and reinstall
cd frontend
rm -rf node_modules package-lock.json
npm install
npm start
```

## 📚 Additional Documentation

- **README.md** - Project overview
- **QUICKSTART.md** - Quick reference
- **DEPLOYMENT.md** - Production deployment
- **DEVELOPMENT.md** - Development workflow
- **AUTHENTICATION.md** - Auth system details

## 🆘 Getting Help

If you encounter issues:

1. Check the logs:
   ```bash
   # Docker logs
   docker-compose logs -f
   
   # Or individual services
   docker-compose logs -f backend
   docker-compose logs -f frontend
   docker-compose logs -f db
   ```

2. Review documentation in the docs folder

3. Check GitHub issues: https://github.com/camaro4life18/minecraftManager/issues

Happy hosting! 🎮
