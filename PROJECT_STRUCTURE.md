# Project Structure & File Overview

Here's everything that was created for your Minecraft Server Manager:

```
minecraft-web/
│
├── 📖 DOCUMENTATION
│   ├── README.md ........................ Main documentation & features
│   ├── QUICKSTART.md .................... Get running in 5 minutes
│   ├── DEPLOYMENT.md ................... Deploy to Docker host
│   ├── DEVELOPMENT.md .................. Set up for local development
│   └── PROJECT_STRUCTURE.md ............ This file
│
├── 🔧 CONFIGURATION
│   ├── .env.example .................... Template with descriptions
│   ├── .env.template ................... Detailed setup help
│   ├── .env.advanced ................... Optional advanced settings
│   ├── docker-compose.yml .............. Docker orchestration
│   ├── .dockerignore ................... Files to exclude from Docker
│   └── .gitignore ...................... Files to exclude from git
│
├── 🚀 SETUP SCRIPTS
│   ├── setup.sh ........................ Linux/Mac setup script
│   └── setup.bat ....................... Windows setup script
│
├── 📦 BACKEND (Node.js Express API)
│   └── backend/
│       ├── server.js ................... Main Express application
│       ├── proxmoxClient.js ............ Proxmox API integration
│       ├── package.json ................ Node dependencies
│       ├── Dockerfile .................. Docker image definition
│       └── README.md ................... Backend documentation
│
├── 💻 FRONTEND (React Web UI)
│   └── frontend/
│       ├── src/
│       │   ├── index.js ................ React entry point
│       │   ├── App.js .................. Main app component
│       │   ├── index.css ............... Global styles
│       │   ├── App.css ................. App-level styles
│       │   │
│       │   ├── components/
│       │   │   ├── ServerList.js ....... Display servers
│       │   │   └── CloneForm.js ........ Clone dialog
│       │   │
│       │   └── styles/
│       │       ├── ServerList.css ...... Server list styles
│       │       └── CloneForm.css ....... Clone form styles
│       │
│       ├── public/
│       │   └── index.html .............. HTML entry point
│       │
│       ├── package.json ................ React dependencies
│       ├── Dockerfile .................. Docker build
│       └── README.md ................... Frontend documentation
│
└── 📄 FILES AT ROOT
    ├── README.md ....................... Full project documentation
    ├── QUICKSTART.md ................... 5-minute quick start
    ├── DEPLOYMENT.md ................... Deployment guide
    ├── DEVELOPMENT.md .................. Local development guide
    ├── PROJECT_STRUCTURE.md ............ This file
    ├── docker-compose.yml .............. Multi-container orchestration
    ├── .env.example .................... Environment template
    ├── .env.template ................... Detailed env help
    ├── .env.advanced ................... Advanced settings
    ├── .dockerignore ................... Docker exclusions
    ├── .gitignore ...................... Git exclusions
    ├── setup.sh ........................ Linux/Mac quick setup
    └── setup.bat ....................... Windows quick setup
```

---

## What Each Component Does

### 📖 Documentation Files

| File | Purpose |
|------|---------|
| **README.md** | Complete documentation, features, API reference |
| **QUICKSTART.md** | Get running in minutes (start here!) |
| **DEPLOYMENT.md** | Deploy to a Docker host, production setup |
| **DEVELOPMENT.md** | Local development without Docker |
| **PROJECT_STRUCTURE.md** | This file you're reading now |

### 🔧 Configuration Files

| File | Purpose |
|------|---------|
| **.env.example** | Template for environment variables |
| **.env.template** | Detailed help for .env configuration |
| **.env.advanced** | Optional advanced Proxmox settings |
| **docker-compose.yml** | Define and run multi-container setup |
| **.dockerignore** | Exclude files from Docker builds |
| **.gitignore** | Exclude files from git commits |

### 🚀 Quick Start Scripts

| File | Purpose |
|------|---------|
| **setup.sh** | One-click setup (Linux/Mac) |
| **setup.bat** | One-click setup (Windows) |

### 📦 Backend

The Express.js REST API that communicates with Proxmox:

| File | Purpose |
|------|---------|
| **server.js** | Express app, route handlers |
| **proxmoxClient.js** | Proxmox API client & authentication |
| **package.json** | Node.js dependencies |
| **Dockerfile** | Build backend container image |

**Endpoints**
- `GET /api/servers` - List all servers
- `POST /api/servers/clone` - Clone a server
- `POST /api/servers/:vmid/start` - Start server
- `POST /api/servers/:vmid/stop` - Stop server
- `DELETE /api/servers/:vmid` - Delete server
- `GET /api/health` - Health check

### 💻 Frontend

The React web interface for managing servers:

| File/Folder | Purpose |
|-------------|---------|
| **App.js** | Main app logic, state management |
| **ServerList.js** | Display list of servers |
| **CloneForm.js** | Modal dialog to clone servers |
| **index.css** | Global styling |
| **ServerList.css** | Server grid styles |
| **CloneForm.css** | Form & modal styles |
| **index.html** | HTML entry point |
| **package.json** | React dependencies |
| **Dockerfile** | Build frontend container image |

---

## Getting Started

### 1. Start Here: QUICKSTART.md

```bash
→ Read QUICKSTART.md for 5-minute setup
```

### 2. Choose Your Path

**Option A: Docker Deployment (Recommended)**
- Run on any Docker host (production)
- Follow: QUICKSTART.md → DEPLOYMENT.md

**Option B: Local Development**
- Develop features locally
- Follow: QUICKSTART.md → DEVELOPMENT.md

### 3. Deep Dives

- **Full Documentation**: README.md
- **API Reference**: README.md section "API Endpoints"
- **Proxmox Setup**: DEPLOYMENT.md section "Step 1"

---

## File Purposes Summary

```
BEFORE YOU START
├─ QUICKSTART.md .................... READ FIRST (5 min)
├─ .env.example .................... COPY & EDIT with your Proxmox details
└─ setup.sh (Mac/Linux) or setup.bat (Windows)

DEPLOYMENT
├─ docker-compose.yml .............. Automatically used by Docker
├─ backend/Dockerfile .............. Automatically used by Docker
├─ frontend/Dockerfile ............. Automatically used by Docker
└─ DEPLOYMENT.md ................... Full deployment guide

DEVELOPMENT  
├─ backend/ ....................... Express API code
├─ frontend/ ...................... React app code
├─ DEVELOPMENT.md .................. Dev setup guide
└─ setup.sh or setup.bat ........... One-click setup helper

REFERENCE
├─ README.md ....................... Full documentation
├─ .env.template ................... Detailed env file help
└─ PROJECT_STRUCTURE.md ............ This file
```

---

## How It All Works Together

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR DOCKER/LINUX HOST                       │
│                                                                   │
│  docker-compose up -d                                           │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Container 1: Backend (Node.js)                           │  │
│  │ - Runs: backend/server.js                                │  │
│  │ - Port: 5000                                             │  │
│  │ - Uses: proxmoxClient.js to talk to Proxmox             │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │ HTTP/JSON                                  │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │ Container 2: Frontend (React + Nginx)                    │  │
│  │ - Runs: frontend/build (React app)                       │  │
│  │ - Port: 3000                                             │  │
│  │ - Shows UI to your son                                   │  │
│  └──────────────────┬───────────────────────────────────────┘  │
│                     │                                             │
│  ┌──────────────────▼───────────────────────────────────────┐  │
│  │  Your Browser                                            │  │
│  │  http://localhost:3000                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                     │                                             │
└─────────────────────┼─────────────────────────────────────────────┘
                      │ HTTPS/API
          ┌───────────▼─────────────┐
          │  YOUR PROXMOX SERVER    │
          │  Port 8006              │
          │  Minecraft VMs/Servers  │
          └─────────────────────────┘
```

---

## Key Technologies

- **Backend**: Node.js, Express.js, Axios
- **Frontend**: React 18, CSS Grid
- **Container**: Docker, Docker Compose
- **Proxmox API**: HTTPS/JSON-RPC
- **Server**: Nginx (serves frontend)

---

## Next Steps

✅ **Read QUICKSTART.md** (5 minutes)
✅ **Copy and edit .env** (your Proxmox details)  
✅ **Run setup.sh or setup.bat** (automatic)
✅ **Open http://localhost:3000** (view your servers!)
✅ **Let your son create servers!** 🎮

---

## Questions?

Check the appropriate guide:
- **Getting started?** → QUICKSTART.md
- **Need to deploy?** → DEPLOYMENT.md  
- **Want to develop?** → DEVELOPMENT.md
- **Full reference?** → README.md
- **API details?** → README.md "API Endpoints"

Happy server managing! 🚀
