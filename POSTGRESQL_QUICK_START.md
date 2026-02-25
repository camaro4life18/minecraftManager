# PostgreSQL Migration - Getting Started (5 Minutes)

## Quick Start Guide

### Option A: Using Docker Compose (Easiest)

#### Step 1: Prepare Environment
```bash
cd c:\Users\Joseph\minecraft-web
cp .env.example .env

# Edit .env with your Proxmox credentials:
# PROXMOX_HOST=your-proxmox-address.com
# PROXMOX_USERNAME=your-username
# PROXMOX_PASSWORD=your-password
# PROXMOX_REALM=pam (or your realm)
```

#### Step 2: Start Everything
```bash
docker-compose up -d
```

#### Step 3: Verify
```bash
# Check all services started
docker-compose ps

# Check backend logs
docker-compose logs backend | head -20
# Look for: "✓ Database initialized"
```

#### Step 4: Access
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000/api/health
- **Login:** admin / admin123

---

### Option B: Local Development

#### Step 1: Install PostgreSQL
**Windows:**
- Download from https://www.postgresql.org/download/windows/
- Run installer (use default settings)
- PostgreSQL will run on localhost:5432

**macOS:**
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
```

#### Step 2: Create Database
```bash
# Connect to PostgreSQL
psql -U postgres

# In PostgreSQL prompt, run:
CREATE USER minecraft_user WITH PASSWORD 'minecraft_password';
CREATE DATABASE minecraft_manager OWNER minecraft_user;
GRANT ALL PRIVILEGES ON DATABASE minecraft_manager TO minecraft_user;
\q
```

#### Step 3: Setup Backend
```bash
cd backend
npm install
npm run init-db

# Should see:
# ✓ Created admin user
# ✓ Created demo user
# ✅ Database initialization complete!
```

#### Step 4: Start Backend
```bash
npm start

# Should see:
# ✓ Database initialized
# ✓ Minecraft Server Manager API running on port 5000
```

#### Step 5: Start Frontend (in another terminal)
```bash
cd frontend
npm install
npm start

# Browser will open http://localhost:3000
```

#### Step 6: Login
- Username: `admin`
- Password: `admin123`

---

## Default Credentials

These are created automatically. **Change in production!**

| User | Role | Username | Password |
|------|------|----------|----------|
| Admin | Full access | admin | admin123 |
| Demo | Limited (clone/start/stop only) | user | user123 |

---

## Environment Variables

### For Docker (in .env)
```env
# Proxmox Settings (REQUIRED - Edit these!)
PROXMOX_HOST=your-proxmox-host.com
PROXMOX_USERNAME=your-username@pam
PROXMOX_PASSWORD=your-password
PROXMOX_REALM=pam

# PostgreSQL (Optional - defaults work for Docker)
DB_USER=minecraft_user
DB_PASSWORD=minecraft_password
DB_NAME=minecraft_manager

# Security (Change in production!)
JWT_SECRET=your-secret-key-change-in-production
```

### For Local Development
Same as Docker, but use:
```env
DB_HOST=localhost  # Instead of "postgres"
```

---

## Verify It Works

### Test 1: Health Check
```bash
curl http://localhost:5000/api/health
```
Should return: `{"status":"healthy"}`

### Test 2: Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
Should return: JWT token in response

### Test 3: Frontend
Open http://localhost:3000 in browser - you should see login page

---

## Stop Services

### Docker
```bash
docker-compose down
```

### Local
- Press Ctrl+C in each terminal

---

## Common Issues & Fixes

### "Connection refused" or "Cannot connect to PostgreSQL"

**Docker:**
```bash
# Check if postgres is running
docker-compose ps postgres

# View postgres logs
docker-compose logs postgres

# Restart everything
docker-compose down
docker-compose up -d
```

**Local:**
```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# If not running:
# Windows: Start PostgreSQL service
# macOS: brew services start postgresql@16
# Linux: sudo service postgresql start
```

### "password authentication failed"

Check .env file - these must match:
```env
# In .env
DB_USER=minecraft_user
DB_PASSWORD=minecraft_password

# Must match what you created in database
# To reset: DROP USER minecraft_user; CREATE USER...
```

### "Database does not exist"

Run initialization:
```bash
npm run init-db
```

### Frontend shows "Cannot reach backend"

Check backend is running:
```bash
curl http://localhost:5000/api/health
```

If not running:
```bash
cd backend
npm start
```

---

## What's Running Where?

```
Your Computer
├── Port 3000  ← Frontend (React)
├── Port 5000  ← Backend API (Express)
└── Port 5432  ← PostgreSQL (Database)
```

Logs will show in terminal/docker output.

---

## Next Steps

After verifying it works:

1. **Add your Proxmox servers** in the Proxmox credentials
2. **Create user accounts** for your son:
   - Go to backend admin panel (future feature)
   - Or ask admin to register via API
3. **Test cloning** a server
4. **Monitor** in production

---

## One-Line Start (After First Setup)

```bash
# Start all services again (after stopping)
docker-compose up -d
```

---

## File Reference

| File | Purpose | Edit? |
|------|---------|-------|
| .env | Your settings | ✏️ Yes - REQUIRED |
| docker-compose.yml | Docker setup | ❌ No |
| backend/database.js | PostgreSQL client | ❌ No |
| backend/server.js | API server | ❌ No |
| frontend/src/App.js | React app | ❌ No |

---

## Need Help?

See detailed docs:
- **POSTGRESQL_MIGRATION.md** - Full setup guide
- **AUTHENTICATION.md** - Auth system details
- **DEVELOPMENT.md** - Development workflow

---

**You're ready to go! 🚀**

Run `docker-compose up -d` or follow Option B to start locally.

Your Minecraft server manager is now running on PostgreSQL! 🎮