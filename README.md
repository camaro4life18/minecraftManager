# Minecraft Server Manager

**Version 2.0** - Enterprise-Grade Server Management 🎉

A full-stack web application for managing Minecraft servers running on Proxmox. Your son can easily clone existing servers and manage them through a modern web interface with advanced search, filtering, and monitoring capabilities.

## ⭐ What's New in Version 2.0

### 🔴 High Priority Features
- ✅ **Error Logging & Monitoring** - Database-backed error tracking with admin dashboard
- ✅ **Rate Limiting** - Protection against brute force attacks (100 req/15min)
- ✅ **Password Reset** - Self-service password reset with secure tokens
- ✅ **Pagination & Search** - Efficient browsing with search and filtering (20 servers/page)

### 🟡 Medium Priority Features
- ✅ **Session Management** - Admin can view and revoke user sessions
- ✅ **API Documentation** - Interactive Swagger UI at `/api-docs`
- ✅ **Audit Log Viewer** - Filter and analyze error logs
- ✅ **Advanced Filtering** - Sort and filter servers by multiple criteria

📚 **See [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) for full details**

## Features

### Core Capabilities
✅ **Server Listing** - View all Minecraft servers on your Proxmox host  
✅ **Clone Servers** - Create new servers by copying existing ones  
✅ **Seed Management** - Custom or random seed generation  
✅ **Start/Stop** - Control server power state  
✅ **Delete Servers** - Remove servers (owner or admin only)  
✅ **Real-time Updates** - Auto-refresh server status every 10 seconds  

### Security & Authentication
✅ **JWT Authentication** - Secure token-based auth  
✅ **Role-Based Access** - Admin and user roles  
✅ **Password Reset** - Self-service password recovery  
✅ **Session Management** - View and revoke sessions  
✅ **Rate Limiting** - Prevent brute force attacks  

### Advanced Features
✅ **Search & Filter** - Find servers by name or status  
✅ **Pagination** - Browse large server lists efficiently  
✅ **Error Logging** - Track and analyze application errors  
✅ **API Metrics** - Monitor performance and response times  
✅ **Audit Trails** - Track all operations by user  

### Admin Tools
✅ **User Management** - Create/delete users, assign roles  
✅ **Configuration** - Manage Proxmox and Velocity settings  
✅ **Error Dashboard** - View and filter application errors  
✅ **Session Control** - Force logout users  
✅ **API Documentation** - Interactive Swagger UI  
✅ **Docker Ready** - Deploy as containers on any Docker host  

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   React     │ HTTP    │   Express    │ HTTPS   │   Proxmox    │
│   Frontend  │◄───────►│   Backend    │◄───────►│   API        │
│   Port 3000 │         │   Port 5000  │         │   Port 8006  │
└─────────────┘         └──────────────┘         └──────────────┘
```

## 🚀 Quick Start

### ⚡ Fastest Way - Automated Setup (Recommended)

Just run one script and everything is set up automatically!

**Windows:**
```powershell
# Run as Administrator
.\setup.bat
```

**macOS/Linux:**
```bash
chmod +x setup.sh
./setup.sh
```

The script will:
- ✅ Check for all dependencies (Node.js, Docker, PostgreSQL)
- ✅ **Auto-install Docker** if not present (Ubuntu/Debian/RHEL)
- ✅ **Auto-install PostgreSQL** if not present
- ✅ **Configure database** (creates user, database, sets credentials)
- ✅ Install all project dependencies
- ✅ Create configuration files with database credentials
- ✅ Build Docker images
- ✅ **Deploy and start the application automatically**

📖 **See [INSTALL_GUIDE.md](INSTALL_GUIDE.md) for detailed instructions**

**Note:** On Ubuntu/Debian, the setup script automatically deploys the app to Docker. It's ready to use!

---

### 🐳 Start the Application (if not using setup.sh)

If you didn't use the automated setup, choose your preferred method:

**Option 1: Docker Compose (Recommended)**
```bash
# Simple start
docker-compose up

# Or using the provided script
./docker-start.sh        # macOS/Linux
docker-start.bat         # Windows
```

**Option 2: Local Development**
```bash
# macOS/Linux
chmod +x start-app.sh
./start-app.sh

# Windows
start-app.bat
```

**Option 3: Manual**
```bash
# Terminal 1: Backend
cd backend
npm run dev:backend

# Terminal 2: Frontend
cd frontend
npm run dev:frontend
```

### 📱 Access the App

```
Frontend: http://localhost:3000
Backend:  http://localhost:5000
```

**Default Admin Login:**
- Username: `admin`
- Password: `admin123`

⚠️ **Change these credentials in production!**

---

## Prerequisites

The setup script automatically checks for and helps install:

| Component | Required | How to Install |
|-----------|----------|-----------------|
| **Node.js** | ✅ Yes | https://nodejs.org/ |
| **Docker** | ✅ Yes | https://www.docker.com/products/docker-desktop |
| **Docker Compose** | ✅ Yes | Included with Docker Desktop |
| **PostgreSQL** | ⚠️ Optional | Included in Docker setup |
| **Git** | ⚠️ Optional | https://git-scm.com/ |

The setup script will guide you through installation if anything is missing.

## Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PROXMOX_HOST` | Proxmox host IP or hostname | `192.168.1.100` |
| `PROXMOX_USERNAME` | Proxmox user (with API permissions) | `root` |
| `PROXMOX_PASSWORD` | Proxmox password | `your-password` |
| `PROXMOX_REALM` | Proxmox authentication realm | `pam` |
| `PORT` | Backend API port | `5000` |

### Proxmox Setup

For security, create a dedicated Proxmox user with limited permissions:

```bash
# SSH to your Proxmox server
ssh root@your-proxmox-host

# Create API user
pveum useradd apimanager@pam -password

# Create role with clone/start/stop permissions
pveum roleadd ServerManager -privs "VM.Allocate,VM.Clone,VM.PowerMgmt,VM.Monitor"

# Assign role to user for specific VMs/paths
pveum aclmod / -user apimanager@pam -role ServerManager
```

---

## 📚 Version 2.0 Documentation

### New Feature Guides
- **[NEW_FEATURES_GUIDE.md](NEW_FEATURES_GUIDE.md)** - Complete guide to all new features
- **[IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md)** - Technical implementation details
- **[MIGRATION_GUIDE_V2.md](MIGRATION_GUIDE_V2.md)** - Upgrading from v1.0 to v2.0
- **[CHECKLIST.md](CHECKLIST.md)** - Quick reference and testing checklist

### API Documentation
- **Interactive Swagger UI:** http://localhost:5000/api-docs
- **Try endpoints directly** from the browser
- **View request/response schemas**
- **Authenticate with JWT** to test protected endpoints

### Key Highlights
🔐 **Security:** Rate limiting prevents brute force attacks  
🔑 **Self-Service:** Users can reset their own passwords  
📊 **Monitoring:** Track errors and API performance  
🔍 **Search:** Find servers instantly by name  
📄 **Pagination:** Browse 1000+ servers efficiently  
🎯 **Filtering:** Show only running or stopped servers  

---

## Database Setup (v2.0)

Version 2.0 requires PostgreSQL with three new tables. The automated setup script (`setup.bat` or `setup.sh`) handles database setup automatically.

### New Tables (Created Automatically)
- **`error_logs`** - Application error tracking with stack traces
- **`password_reset_tokens`** - Secure tokens for password reset (15min expiry)
- **`api_metrics`** - Performance monitoring (endpoint, response time, status)

### Automated Setup (Recommended)
```bash
# Windows
setup.bat

# macOS/Linux (Auto-installs PostgreSQL + configures database)
./setup.sh
```

The setup script will:
1. ✅ **Install PostgreSQL** if not present (Ubuntu/Debian/RHEL/macOS)
2. ✅ **Create database** and user with secure password
3. ✅ **Add credentials** to .env file automatically
4. ✅ Start the backend which auto-creates tables
5. ✅ Verify database connection
6. ✅ Display database credentials

### Manual Setup (Development)
If you prefer manual setup:
1. Ensure PostgreSQL is running (included in Docker setup)
2. Start the backend: `npm run dev` or `docker-compose up`
3. Tables will be created automatically on first run
4. Check backend logs for "Database connected successfully"

### Migration from v1.0
If upgrading from v1.0, your existing `users` and `servers` tables are preserved. See [MIGRATION_GUIDE_V2.md](MIGRATION_GUIDE_V2.md) for detailed upgrade instructions.

---

## API Endpoints

### Get All Servers
```
GET /api/servers
```

### Get Server Details
```
GET /api/servers/:vmid
```

### Clone a Server
```
POST /api/servers/clone
Body: {
  "sourceVmId": 100,
  "newVmName": "minecraft-server-3",
  "newVmId": 103
}
```

### Start Server
```
POST /api/servers/:vmid/start
```

### Stop Server
```
POST /api/servers/:vmid/stop
```

### Delete Server
```
DELETE /api/servers/:vmid
```

### Get Task Status
```
GET /api/tasks/:taskId
```

### Password Reset (New in v2.0)
```
POST /api/auth/request-reset
Body: { "email": "user@example.com" }

POST /api/auth/reset-password
Body: { "token": "abc123...", "newPassword": "newsecure" }
```

### Error Logs - Admin Only (New in v2.0)
```
GET /api/admin/error-logs
Query: ?page=1&limit=50&type=error&startDate=2024-01-01

GET /api/admin/error-logs/stats
Returns: Error counts grouped by type and endpoint

DELETE /api/admin/error-logs
Clears all error logs
```

### Session Management - Admin Only (New in v2.0)
```
GET /api/admin/sessions
Lists all active sessions with user details

DELETE /api/admin/sessions/:sessionId
Revokes a specific session (force logout)

DELETE /api/admin/sessions/user/:userId
Revokes all sessions for a user
```

### API Metrics - Admin Only (New in v2.0)
```
GET /api/admin/metrics
Returns: Total requests, avg response time, endpoint statistics
```

### Enhanced Server Listing (Updated in v2.0)
```
GET /api/servers?page=1&limit=20&search=survival&status=running&sortBy=name
Supports: pagination, search by name, status filter, sorting
```

## Deployment to Docker Host

### On Your Docker Server

1. **Transfer Project**
```bash
scp -r minecraft-web/ docker-user@docker-host:/home/docker-user/
```

2. **SSH into Docker Host**
```bash
ssh docker-user@docker-host
cd minecraft-web
```

3. **Create Environment File**
```bash
pip3 install python-dotenv  # if using .env file management
cat > .env << EOF
PROXMOX_HOST=your-proxmox-ip
PROXMOX_USERNAME=your-user
PROXMOX_PASSWORD=your-password
PROXMOX_REALM=pam
EOF
```

4. **Start Services**
```bash
docker-compose up -d
docker-compose logs -f  # view logs
```

5. **Verify** 
```bash
docker-compose ps                    # check container status
curl http://localhost:5000/api/health  # test backend
```

## Developing Locally

**Note:** For first-time setup, use the automated setup script (`setup.bat` or `./setup.sh`). The steps below are for manual development after initial setup.

### Backend

```bash
cd backend
npm install
npm run dev  # Watch mode
```

Server runs on `http://localhost:5000`

### Frontend

```bash
cd frontend
npm install
npm start  # Development server
```

Frontend runs on `http://localhost:3000`

Make sure backend is running first!

## Security Considerations

⚠️ **Important Security Notes:**

1. **SSL/TLS**: Configure proper SSL certificates for Proxmox connections in production
2. **Authentication**: ✅ JWT authentication implemented (v2.0)
3. **Rate Limiting**: ✅ Protection enabled (100 req/15min general, 5 login/15min) (v2.0)
4. **Credentials Storage**: Never commit `.env` files; use secret management tools
5. **Network**: Run on internal network or behind VPN for maximum security
6. **API Permissions**: Create restricted Proxmox users with minimal required permissions
7. **Session Management**: ✅ Admin can revoke sessions (v2.0)
8. **Password Security**: ✅ Self-service reset prevents admin password sharing (v2.0)

## Troubleshooting

### Backend Cannot Connect to Proxmox

```bash
# Check backend logs
docker-compose logs backend

# Verify Proxmox connectivity
docker exec minecraft-manager-backend curl -k https://proxmox-host:8006/api2/json/nodes
```

### Frontend Shows "Failed to fetch servers"

1. Check backend is running: `docker-compose ps`
2. Verify API URL in browser console (F12)
3. Check CORS configuration if running on different domains

### Containers Won't Start

```bash
# Check Docker logs
docker-compose logs

# Rebuild images
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Project Structure

```
minecraft-web/
├── backend/
│   ├── server.js              # Express app with all endpoints
│   ├── database.js            # PostgreSQL connection & models
│   ├── auth.js                # JWT authentication
│   ├── middleware.js          # Error logging & metrics (v2.0)
│   ├── swagger.js             # API documentation config (v2.0)
│   ├── proxmoxClient.js       # Proxmox API client
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js             # Main React component with routing
│   │   ├── components/
│   │   │   ├── ServerList.js          # Search, filter, pagination (v2.0)
│   │   │   ├── CloneForm.js
│   │   │   ├── LoginPage.js           # With password reset (v2.0)
│   │   │   ├── ErrorLogs.js           # Admin error dashboard (v2.0)
│   │   │   ├── ApiMetrics.js          # Performance metrics (v2.0)
│   │   │   ├── SessionManagement.js   # Session control (v2.0)
│   │   │   ├── PasswordReset.js       # Self-service reset (v2.0)
│   │   │   └── ...
│   │   ├── styles/
│   │   └── context/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
├── README.md
├── IMPLEMENTATION_COMPLETE.md    # v2.0 technical details
├── NEW_FEATURES_GUIDE.md         # v2.0 user guide
├── MIGRATION_GUIDE_V2.md         # Upgrade instructions
└── CHECKLIST.md                  # Quick reference
```

## Future Enhancements

### Completed in v2.0 ✅
- ✅ User authentication (JWT-based)
- ✅ Error logging and monitoring
- ✅ Performance metrics
- ✅ API documentation (Swagger)
- ✅ Session management
- ✅ Password reset

### Planned for v3.0
- [ ] Server resource configuration UI (CPU, RAM)
- [ ] Server scheduling (auto-start/stop)
- [ ] Automated backups management
- [ ] Resource usage graphs and trends
- [ ] Mobile-responsive design improvements
- [ ] Slack/Discord integration for notifications
- [ ] Multi-Proxmox cluster support
- [ ] Whitelist management per server

## License

MIT License - feel free to modify for your needs

## Support

For issues with Proxmox API integration, see: https://pve.proxmox.com/pve-docs/api-viewer/
