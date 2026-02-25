# Documentation Index

**Last Updated:** February 24, 2026 (Version 2.0)

**📋 Documentation Status:** See [DOCUMENTATION_STATUS.md](DOCUMENTATION_STATUS.md) for complete overview

**Start here:** [START_HERE.md](START_HERE.md) - 3-step quick setup

---

## 📋 Quick Navigation

### 🎯 Getting Started
| Document | Best For | Time |
|----------|----------|------|
| [START_HERE.md](START_HERE.md) | First-time setup | 2 min |
| [QUICKSTART.md](QUICKSTART.md) | 5-minute deployment | 5 min |
| [INSTALL_GUIDE.md](INSTALL_GUIDE.md) | Detailed installation | 10 min |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Local development | 10 min |

### 🆕 Version 2.0 Features
| Document | Best For | Time |
|----------|----------|------|
| [NEW_FEATURES_GUIDE.md](NEW_FEATURES_GUIDE.md) | Learn new features | 10 min |
| [MIGRATION_GUIDE_V2.md](MIGRATION_GUIDE_V2.md) | Upgrade from v1.0 | 15 min |
| [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) | Technical details | 20 min |
| [CHECKLIST.md](CHECKLIST.md) | Quick reference | 5 min |

### 🚀 Deployment & Operations
| Document | Best For | Time |
|----------|----------|------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Docker deployment | 20 min |
| [README.md](README.md) | Full reference | As needed |
| [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) | Understanding file layout | 5 min |
| [DOCUMENTATION_STATUS.md](DOCUMENTATION_STATUS.md) | Documentation overview | 5 min |

### 🐛 Troubleshooting
| Problem | Solution |
|---------|----------|
| Can't connect to Proxmox | See DEPLOYMENT.md > Troubleshooting |
| Backend won't start | See DEVELOPMENT.md > Troubleshooting |
| Docker issues | See DEPLOYMENT.md > Troubleshooting |
| Server not showing | Run `test-api.sh` or `test-api.bat` |

---

## 📁 Important Configuration Files

### .env Configuration
| File | Purpose |
|------|---------|
| `.env.example` | Template - copy this to `.env` |
| `.env.template` | Detailed help for each setting |
| `.env.advanced` | Optional advanced Proxmox settings |

### Docker & Deployment
| File | Purpose |
|------|---------|
| `docker-compose.yml` | Multi-container orchestration |
| `backend/Dockerfile` | Backend container image |
| `frontend/Dockerfile` | Frontend container image |
| `.dockerignore` | Exclude files from Docker |

### Setup Scripts
| File | Purpose |
|------|---------|
| `setup.sh` | Linux/Mac one-click setup |
| `setup.bat` | Windows one-click setup |
| `test-api.sh` | Linux/Mac API test |
| `test-api.bat` | Windows API test |

---

## 🏗️ Project Structure

```
📁 minecraft-web
├─ 📖 DOCUMENTATION
│  ├─ START_HERE.md ..................... BEGIN HERE! (3 steps)
│  ├─ QUICKSTART.md .................... Fast 5-min setup
│  ├─ DEVELOPMENT.md ................... Local development
│  ├─ DEPLOYMENT.md ................... Production deployment  
│  ├─ README.md ....................... Complete docs
│  ├─ PROJECT_STRUCTURE.md ............ This structure
│  └─ INDEX.md ........................ Navigation (this file)
│
├─ 🔧 CONFIGURATION (Edit these!)
│  ├─ .env.example ................... Copy to .env then edit
│  ├─ .env.template .................. Detailed help
│  ├─ .env.advanced .................. Optional settings
│  └─ docker-compose.yml ............. Docker setup
│
├─ 🚀 SETUP & TESTING
│  ├─ setup.sh ....................... Mac/Linux quick setup
│  ├─ setup.bat ...................... Windows quick setup
│  ├─ test-api.sh .................... Linux/Mac API test
│  └─ test-api.bat ................... Windows API test
│
├─ 📦 BACKEND (Node.js/Express API)
│  └─ backend/
│     ├─ server.js .................. Main API server
│     ├─ proxmoxClient.js ........... Proxmox integration
│     ├─ package.json ............... Dependencies
│     ├─ Dockerfile ................. Container image
│     └─ README.md .................. Backend docs
│
└─ 💻 FRONTEND (React Web UI)
   └─ frontend/
      ├─ src/
      │  ├─ App.js .................. Main app
      │  ├─ components/ ............ React components
      │  └─ styles/ ............... CSS styling
      ├─ public/
      │  └─ index.html ............ HTML entry point
      ├─ package.json ............. Dependencies
      ├─ Dockerfile ............... Container image
      └─ README.md ................ Frontend docs
```

---

## 🎯 Usage Paths

### Path 1: Docker Deployment (Recommended for Production)
```
1. Read: START_HERE.md (Step 1 & 2A)
2. Edit: .env with your Proxmox details
3. Run: setup.sh (or setup.bat on Windows)
4. Open: http://localhost:3000
```

### Path 2: Local Development
```
1. Read: DEVELOPMENT.md
2. Install: Node.js from nodejs.org
3. Follow: Steps in DEVELOPMENT.md
4. Run: Both backend and frontend services
5. Open: http://localhost:3000
```

### Path 3: Production Deployment
```
1. Read: QUICKSTART.md
2. Read: DEPLOYMENT.md
3. Follow: Environment-specific setup
4. Configure: Reverse proxy (Nginx, HAProxy)
5. Monitor: Logs and health checks
```

---

## ⚡ Quick Commands

### Docker
```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# View logs
docker-compose logs -f

# View specific service
docker-compose logs -f backend
```

### Local Development
```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Frontend
cd frontend && npm start

# Test API
curl http://localhost:5000/api/health
```

### Setup
```bash
# One-click setup (choose OS)
./setup.sh        # Mac/Linux
setup.bat         # Windows
```

### Testing
```bash
# Test API
./test-api.sh     # Mac/Linux
test-api.bat      # Windows
```

---

## 📚 API Reference

### Server Endpoints
```
GET    /api/servers              - List all servers
GET    /api/servers/:vmid        - Get server details
POST   /api/servers/clone        - Clone a server
POST   /api/servers/:vmid/start  - Start server
POST   /api/servers/:vmid/stop   - Stop server
DELETE /api/servers/:vmid        - Delete server
GET    /api/health               - Health check
```

See [README.md](README.md) for full API documentation.

---

## 🔐 Security Checklist

Before sharing or deploying to production:
- [ ] Create dedicated Proxmox API user
- [ ] Use strong passwords or API tokens
- [ ] Keep .env file private (in .gitignore)
- [ ] Add user authentication to web app
- [ ] Set up HTTPS/SSL certificates
- [ ] Use reverse proxy (Nginx, HAProxy)
- [ ] Restrict network access (VPN/firewall)
- [ ] Regularly rotate credentials

See [DEPLOYMENT.md](DEPLOYMENT.md) for security details.

---

## 🎓 Learning Resources

### Frameworks & Technologies
- [React Documentation](https://react.dev/)
- [Express.js Guide](https://expressjs.com/)
- [Docker Documentation](https://docs.docker.com/)
- [Proxmox API Documentation](https://pve.proxmox.com/pve-docs/api-viewer/)

### Tutorials
- [Node.js Basics](https://nodejs.org/en/docs/)
- [Docker Compose Guide](https://docs.docker.com/compose/)
- [REST API Basics](https://restfulapi.net/)

---

## 🆘 Support Matrix

| Issue | Document | Section |
|-------|----------|---------|
| Setup questions | START_HERE.md | Step 1-3 |
| Docker issues | DEPLOYMENT.md | Troubleshooting |
| Dev setup problems | DEVELOPMENT.md | Troubleshooting |
| API errors | README.md | API Reference |
| Server not showing | test-api.sh/bat | Run test script |
| Proxmox connection | DEPLOYMENT.md | Step 1 |

---

## 📈 What's Next?

1. ✅ **Complete Setup**
   - Read [START_HERE.md](START_HERE.md)
   - Set up .env
   - Get it running

2. ✅ **Test**
   - Verify servers appear in UI
   - Test clone feature
   - Try start/stop

3. ✅ **Customize** (Optional)
   - Modify colors/styling
   - Add server details
   - Implement authentication

4. ✅ **Deploy** (Production)
   - Follow [DEPLOYMENT.md](DEPLOYMENT.md)
   - Set up domain/SSL
   - Configure monitoring

---

## 📞 Getting Help

1. **Check this index** - You're reading it! 📖
2. **Read START_HERE.md** - 3-step setup guide 🚀
3. **View logs** - `docker-compose logs -f` 📊
4. **Run test script** - `test-api.sh` or `test-api.bat` ✅
5. **Check browser console** - F12 in your browser 🐛

---

## 🎉 You're All Set!

Everything you need to manage Minecraft servers on Proxmox is ready!

**→ Next Step: [START_HERE.md](START_HERE.md)**

**Happy server managing!** 🎮🚀
