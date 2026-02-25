# Quick Start Guide

Get your Minecraft Server Manager running in minutes!

## 🚀 Option 1: Docker (Recommended for Deployment)

The easiest way to deploy to your Docker server.

### Step 1: Prepare Your Proxmox Details

Before starting, gather this information about your Proxmox server:
- **Host**: IP address or hostname (e.g., `192.168.1.100` or `proxmox.local`)
- **Username**: Your Proxmox user (e.g., `root` or `apimanager@pam`)
- **Password**: Your Proxmox password
- **Realm**: Usually `pam` (or your custom auth realm)

### Step 2: Copy and Configure

```bash
# Copy the project to your Docker host (or your local machine)
git clone <repo-url> minecraft-web
cd minecraft-web

# Create environment file
cp .env.example .env

# Edit with your Proxmox details
# On Windows: open .env with notepad
# On Mac/Linux: nano .env
```

Edit `.env`:
```env
PROXMOX_HOST=192.168.1.100
PROXMOX_USERNAME=root
PROXMOX_PASSWORD=your-secure-password
PROXMOX_REALM=pam
```

### Step 3: Start (Choose One)

**Using Setup Script (Easy)**
```bash
# Windows
setup.bat

# Mac/Linux
chmod +x setup.sh
./setup.sh
```

**Or Manual**
```bash
docker-compose build
docker-compose up -d
```

### Step 4: Access

Open your browser:
- **Frontend**: http://localhost:3000
- **API Health**: http://localhost:5000/api/health

✅ Done! You should see your Minecraft servers listed!

---

## 💻 Option 2: Local Development

For developing features and testing locally without Docker.

### Step 1: Install Prerequisites

- Node.js 18+ from https://nodejs.org/
- npm comes with Node.js

### Step 2: Configure

```bash
cd minecraft-web

# Backend setup
cd backend
cp ../.env.example .env
# Edit .env with your Proxmox details

# Frontend setup (in new terminal)
cd frontend
# No special config needed for development
```

### Step 3: Start Services

**Terminal 1 - Backend**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 - Frontend**
```bash
cd frontend
npm install
npm start
```

### Step 4: Access

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000

✅ Ready to develop!

---

## 📋 What This App Does

### Features
- 📊 **Lists** all Minecraft servers on your Proxmox host
- 📋 **Clones** existing servers to create new ones
- ▶️ **Starts** servers with one click
- ⏹️ **Stops** servers with one click
- 🔄 **Auto-refreshes** every 10 seconds

### How It Works
```
Your Browser (http://localhost:3000)
        ↓
React Web UI (shows servers, clone form)
        ↓
Express Backend (http://localhost:5000)
        ↓
Proxmox API (https://your-proxmox:8006)
        ↓
Your Minecraft Servers
```

---

## 🔧 Proxmox Setup (First Time Only)

### Find Your Proxmox Details

```bash
# SSH to your Proxmox server
ssh root@your-proxmox-host

# Find your username and realm
pveum user list

# Example output shows: root@pam, admin@pam, etc.
```

### (Recommended) Create an API User

For better security, create a dedicated API user:

```bash
# SSH to Proxmox
ssh root@your-proxmox-host

# Create user
pveum useradd apimanager@pam -password

# Create role with limited permissions
pveum roleadd MinecraftManager \
  -privs "VM.Allocate,VM.Clone,VM.PowerMgmt,VM.Monitor"

# Assign role
pveum aclmod / -user apimanager@pam -role MinecraftManager
```

Then in `.env` use:
```env
PROXMOX_USERNAME=apimanager
```

---

## ⚠️ Troubleshooting

### Can't connect to Proxmox

```bash
# Check if Proxmox is reachable
ping your-proxmox-host

# Test API endpoint
curl -k https://your-proxmox-host:8006/api2/json/nodes
```

**Fix**: 
- Verify host/IP is correct
- Check network connectivity
- Confirm credentials are right

### Containers won't start

```bash
# Check logs
docker-compose logs

# Rebuild
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### No servers showing up

```bash
# Backend might not be running
docker-compose ps

# Check backend logs
docker-compose logs backend

# Test API manually
curl http://localhost:5000/api/servers
```

**Note**: App only shows servers with "minecraft" in the name

### Port Already in Use

```bash
# Find what's using port 3000 or 5000
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Or use different ports
docker-compose down
# Edit docker-compose.yml ports
# Run again
```

---

## 📚 Next Steps

- **Deploy to Production**: See [DEPLOYMENT.md](DEPLOYMENT.md)
- **Local Development**: See [DEVELOPMENT.md](DEVELOPMENT.md)  
- **Full Documentation**: See [README.md](README.md)
- **Add Authentication**: Recommended before sharing with others
- **Set Up SSL**: Use a reverse proxy like Nginx for HTTPS

---

## 🆘 Need Help?

1. Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment issues
2. Check [DEVELOPMENT.md](DEVELOPMENT.md) for development issues
3. View logs: `docker-compose logs -f`
4. Test API manually: `curl http://localhost:5000/api/servers`

---

## 🎮 Ready to Create Servers?

1. Open http://localhost:3000
2. You'll see your existing Minecraft servers
3. Click "Clone" on a server to create a new one
4. Enter a new name and VM ID
5. Watch as it creates your new server!

**That's it! Happy server managing! 🚀**
