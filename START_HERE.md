# MINECRAFT SERVER MANAGER - GETTING STARTED

Welcome! Your Minecraft Server Manager has been created. Here's how to get started in **3 easy steps**:

---

## 🎯 STEP 1: READ THIS FIRST - Choose Your Setup Path

Your application has been created and is ready to use in two ways:

### 🐳 Option A: Docker Deployment (Recommended)
**Best for:** Deploying on a server
- Everything runs in containers
- One command to start
- Production-ready

**Files needed:** Just `.env` configuration
**Time to setup:** 2 minutes

👉 **Next:** Go to Step 2A below

### 💻 Option B: Local Development  
**Best for:** Testing, customizing, developing
- Runs directly on your machine
- Easier to debug and modify
- Great for learning

**Requirements:** Node.js 18+ installed
**Time to setup:** 5 minutes

👉 **Next:** Go to Step 2B below

---

## ✅ STEP 2A: Docker Deployment Setup

### A. Configure Proxmox Credentials

1. Edit the `.env` file in your project root
   ```bash
   # On Windows: Open .env with Notepad
   # On Mac/Linux: nano .env
   ```

2. Fill in your Proxmox details:
   ```env
   PROXMOX_HOST=your-proxmox-ip-or-hostname
   PROXMOX_USERNAME=root
   PROXMOX_PASSWORD=your-password
   PROXMOX_REALM=pam
   ```

### B. Start the Application

**On Windows:**
```bash
setup.bat
```

**On Mac/Linux (Fully Automated):**
```bash
chmod +x setup.sh
./setup.sh
```

✅ **On Ubuntu/Debian:** The script automatically:
- Installs Node.js (if needed)
- Installs Docker (if needed)
- Installs PostgreSQL (if needed)
- Installs Git (if needed)
- Configures the database with secure credentials
- Deploys the app!

**Or manually with Docker:**
```bash
docker-compose up -d
```

### C. Access Your Application

Open your web browser:
```
http://localhost:3000
```

✅ You're done! You should see your Minecraft servers!

---

## ✅ STEP 2B: Local Development Setup

### A. Install Node.js (if not already installed)
Download and install from: https://nodejs.org/en/
(Choose LTS version)

### B. Configure the Backend

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Create .env file
cp ../.env.example .env

# Edit .env with your Proxmox details
# nano .env
```

Add your Proxmox details to `backend/.env`:
```env
PROXMOX_HOST=your-proxmox-ip-or-hostname
PROXMOX_USERNAME=root
PROXMOX_PASSWORD=your-password
PROXMOX_REALM=pam
PORT=5000
```

### C. Start Backend Server

```bash
npm run dev
```

You'll see: `Minecraft Server Manager API running on port 5000`

### D. Configure the Frontend (New Terminal)

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start development server
npm start
```

React will open your browser to `http://localhost:3000`

### E. You're Ready!

Both services are now running:
- **Frontend:** http://localhost:3000
- **Backend:** http://localhost:5000

✅ You should see your Minecraft servers in the interface!

---

## 🚀 STEP 3: Test Your Application

### In Your Browser

1. Open http://localhost:3000
2. Wait for your servers to load (10-second refresh)
3. You should see all Minecraft servers on your Proxmox host
4. Try these features:
   - Click **"Clone"** on a server to create a copy
   - Click **"Start"** or **"Stop"** to control servers
   - The list updates every 10 seconds

### If Nothing Appears

**Run the test script:**

**Mac/Linux:**
```bash
chmod +x test-api.sh
./test-api.sh
```

**Windows:**
```bash
test-api.bat
```

This checks if your backend can reach Proxmox.

---

## 🆘 Troubleshooting Quick Guide

| Problem | Solution |
|---------|----------|
| **"Cannot connect to Proxmox"** | Check .env file has correct PROXMOX_HOST and credentials |
| **"No servers showing"** | Backend might not be running (check Step 2 setup) |
| **"Port 3000 already in use"** | Another app is using it. Close it or restart Docker |
| **Blank page/errors** | Check browser console (F12) and backend logs |

**View logs:**
```bash
# Backend logs
docker-compose logs -f backend

# Frontend logs  
docker-compose logs -f frontend
```

---

## 📚 Full Documentation

Once working, explore these files:

| Document | Purpose |
|----------|---------|
| **QUICKSTART.md** | Fast reference, common tasks |
| **README.md** | Complete documentation & features |
| **DEPLOYMENT.md** | Production deployment guide |
| **DEVELOPMENT.md** | Advanced development setup |
| **PROJECT_STRUCTURE.md** | Overview of all files created |

---

## 🎮 What Your Son Can Do

Once running, he can:

1. **View Servers** - See all Minecraft servers on your Proxmox host
2. **Create New Servers** - Click "Clone" on existing servers
3. **Start/Stop Servers** - Control server power with one click
4. **Quick Overview** - See server status and details

No command line needed - everything is web-based! 🌐

---

## 🔐 Security Tips

**Before making this accessible to your son or storing actual credentials:**

1. ✅ Consider creating a dedicated Proxmox user with limited permissions
2. ✅ Use strong passwords
3. ✅ Keep the .env file private (never commit to git)
4. ✅ For internet access, set up authentication in the app
5. ✅ Use HTTPS with a reverse proxy (Nginx) for production

See DEPLOYMENT.md for security recommendations.

---

## 📋 Proxmox Setup (First Time Only)

**If you haven't set up API access yet:**

SSH to your Proxmox server:
```bash
ssh root@your-proxmox-host

# List existing users
pveum user list

# Create Minecraft-specific user (recommended for security)
pveum useradd apimanager@pam -password 'secure-password'
pveum roleadd MinecraftManager -privs "VM.Allocate,VM.Clone,VM.PowerMgmt,VM.Monitor"
pveum aclmod / -user apimanager@pam -role MinecraftManager
```

Then use in `.env`:
```env
PROXMOX_USERNAME=apimanager
PROXMOX_PASSWORD=secure-password
```

---

## 📞 Next Steps

- ✅ **Right now:** Complete Step 1, 2, and 3 above
- ✅ **This week:** Test server cloning feature
- ✅ **Next:** Read DEPLOYMENT.md to move to production
- ✅ **Later:** Add authentication for security
- ✅ **Advanced:** Customize UI or add new features

---

## 🎉 What You've Created

A full-stack application with:

✨ **Frontend:** Modern React web interface  
✨ **Backend:** Express.js REST API  
✨ **Integration:** Direct Proxmox API integration  
✨ **Deployment:** Docker containerization  
✨ **Documentation:** Complete guides & setup  

---

## 📞 Questions or Issues?

1. Check **QUICKSTART.md** for common tasks
2. Check **DEVELOPMENT.md** for dev environment issues  
3. Check **DEPLOYMENT.md** for deployment issues
4. Check **README.md** for full documentation
5. Check browser developer console (F12) for errors

---

## 🚀 You're Ready!

You now have:
- ✅ Frontend React app
- ✅ Node.js Express backend
- ✅ Proxmox integration
- ✅ Docker setup
- ✅ Full documentation
- ✅ Test scripts
- ✅ Deployment guide

**Start with:** [QUICKSTART.md](QUICKSTART.md) or Step 2 above

**Happy server managing! 🎮**

---

---

*Created: 2026-02-24*  
*For: Minecraft Server Management on Proxmox*  
*Running in Docker on a separate host*
