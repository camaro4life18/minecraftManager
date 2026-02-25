# Installation & Setup Instructions

This document explains how to set up and run the Minecraft Server Manager with minimal effort.

## 🎯 What This Does

The setup scripts automatically:
- ✅ Check for Node.js, Docker, PostgreSQL, and Git
- ✅ Guide you through installing missing dependencies
- ✅ Create necessary configuration files
- ✅ Install all npm dependencies
- ✅ Build Docker images
- ✅ Prepare your system to run the app

**You literally just run one script and it handles everything!**

---

## 🚀 Installation Methods

### Method 1: Fastest - Using Setup Script

This is the easiest way to get started!

#### Windows

```powershell
# 1. Open PowerShell as Administrator
# Right-click PowerShell -> Run as Administrator

# 2. Navigate to the project
cd C:\Users\YourUsername\minecraft-web

# 3. Run setup
.\setup.bat

# Follow the prompts - it will:
# - Check all dependencies
# - Install anything missing
# - Set up configuration files
# - Build Docker images
```

#### macOS/Linux

```bash
# 1. Open Terminal

# 2. Navigate to the project
cd ~/minecraft-web

# 3. Make setup script executable
chmod +x setup.sh

# 4. Run setup
./setup.sh

# Follow the prompts - it will:
# - Check all dependencies
# - Install anything missing
# - Set up configuration files
# - Build Docker images
```

**That's it!** The setup script handles everything.

---

### Method 2: Using Docker Compose (Recommended)

After running setup, start the app with:

```bash
# Start all services with Docker
docker-compose up

# Or in detached mode
docker-compose up -d

# Stop services
docker-compose down
```

Access at:
- Frontend: http://localhost:3000
- Backend: http://localhost:5000
- Database: PostgreSQL on localhost:5432

---

### Method 3: Local Development

If you want to run services locally (good for development):

#### Windows
```powershell
# Run the start script
.\start-app.bat

# This opens two terminal windows:
# - One for the backend
# - One for the frontend

# Both will auto-reload when you make changes
```

#### macOS/Linux
```bash
chmod +x start-app.sh
./start-app.sh

# This starts both services in the background
# Press Ctrl+C to stop them
```

---

## ⚙️ Configuration

### After Initial Setup

1. **Edit `.env` file** with your Proxmox details:
   ```env
   PROXMOX_HOST=your-proxmox-ip.com
   PROXMOX_USERNAME=root@pam
   PROXMOX_PASSWORD=your-password
   PROXMOX_REALM=pam
   PROXMOX_NODE=pve
   ```

2. **Start the application** using one of the methods above

3. **Log in** with default admin account:
   - Username: `admin`
   - Password: `admin123`

4. **Configure Proxmox** in admin settings:
   - Click ⚙️ Configuration (admin only)
   - Enter your Proxmox details
   - Click "Test Connection"
   - Click "Save Configuration"

### (Optional) Configure Velocity

If you have a Velocity proxy server:

1. In admin settings, go to "Velocity Configuration" tab
2. Enter your Velocity details
3. Click "Test Connection"
4. Click "Save Configuration"

---

## 📋 System Requirements

The setup script automatically checks for:

| Component | Required | Version |
|-----------|----------|---------|
| Node.js | Yes | v16+ |
| npm | Yes | v8+ |
| Docker | Yes | Latest |
| Docker Compose | Yes | v2.0+ |
| PostgreSQL | No* | v12+ |
| Git | No* | Latest |

*Can be used with Docker versions instead

---

## 🆘 Troubleshooting

### "Node.js is not installed"
- **Windows**: Download from https://nodejs.org/ and run installer
- **macOS**: Run `brew install node`
- **Linux**: Run `sudo apt-get install nodejs npm`

### "Docker is not installed"
- **Windows/macOS**: Download Docker Desktop from https://www.docker.com/products/docker-desktop
- **Linux**: Follow page: https://docs.docker.com/engine/install/

### "Port 3000/5000 already in use"
```bash
# Find and stop the process using the port
# macOS/Linux:
lsof -i :3000

# Windows (PowerShell):
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess
```

### "Failed to connect to database"
```bash
# Check if PostgreSQL container is running
docker ps

# View container logs
docker-compose logs db

# Restart containers
docker-compose restart
```

### "Can't find npm/node"
Make sure the installation directory is in your PATH environment variable. Restart your terminal/command prompt after installing Node.js.

---

## 📁 What Gets Installed/Created

```
minecraft-web/
│
├── .env                    # Configuration file (created by setup)
│
├── backend/
│   ├── node_modules/       # Dependencies (installed by setup)
│   ├── server.js           # Express API
│   ├── database.js         # Database connection
│   └── package.json
│
├── frontend/
│   ├── node_modules/       # Dependencies (installed by setup)
│   ├── src/                # React components
│   └── package.json
│
├── docker-compose.yml      # Docker configuration
├── start-app.bat/sh        # Start script (local mode)
├── setup.bat/sh            # Setup script (this one!)
└── README.md               # Main documentation
```

---

## 🎯 Next Steps After Setup

1. **Configure your Proxmox connection**
   - Edit `.env` with Proxmox details
   - Or use the admin configuration interface

2. **Create admin account**
   - Default: admin / admin123 (change in production!)

3. **Start cloning servers**
   - Use the web interface to see your Proxmox servers
   - Clone and manage them

4. **Optional: Set up Velocity integration**
   - Configure Velocity server in admin settings
   - New servers automatically added to Velocity list

---

## 📚 Additional Resources

- **SETUP_GUIDE.md** - Detailed setup instructions
- **QUICKSTART.md** - Quick reference guide
- **DEVELOPMENT.md** - Development workflow
- **DEPLOYMENT.md** - Production deployment
- **README.md** - Project overview

---

## 🆘 Still Having Issues?

1. **Check the logs**
   ```bash
   docker-compose logs -f
   ```

2. **Review error messages carefully** - they usually explain the issue

3. **Check GitHub** - https://github.com/camaro4life18/minecraftManager/issues

4. **Make sure you're in the right directory** - Use `pwd` or `cd` to verify

---

**Congratulations!** You're now set up and ready to manage Minecraft servers! 🎮
