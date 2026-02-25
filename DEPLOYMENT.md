# Deployment Guide

## Prerequisites

Before deploying, ensure you have:
- Docker and Docker Compose installed
- Proxmox server running and accessible
- Proxmox API credentials (username, password, realm)
- Knowledge of your Proxmox node names

## Step 1: Get Proxmox Credentials

### Find Your Proxmox Details

```bash
# SSH to Proxmox server
ssh root@your-proxmox-host

# List nodes
pvecm nodes

# Check users
pveum user list

# Create API user (if needed)
pveum useradd apimanager@pam -password 'your-secure-password'
```

### Create Restricted API Role (Recommended)

For security, create a dedicated role:

```bash
# Create a role with minimal permissions
pveum roleadd MinecraftManager \
  -privs "VM.Allocate,VM.Clone,VM.PowerMgmt,VM.Monitor"

# Assign to user
pveum aclmod / -user apimanager@pam -role MinecraftManager
```

## Step 2: Prepare Docker Host

### Option A: Local Setup

1. Install Docker Desktop (Windows/Mac) or Docker Engine (Linux)
2. Copy project files to your machine
3. Create `.env` file with Proxmox credentials

### Option B: Deploy to Separate Docker Host

```bash
# On your local machine
scp -r minecraft-web/ user@docker-host:/path/to/

# SSH to Docker host
ssh user@docker-host
cd /path/to/minecraft-web
```

## Step 3: Configure Environment

```bash
# Copy example env file
cp .env.example .env

# Edit with your credentials
nano .env  # or vim, or your editor

# Content should look like:
# PROXMOX_HOST=192.168.1.100
# PROXMOX_USERNAME=apimanager
# PROXMOX_PASSWORD=your-secure-password
# PROXMOX_REALM=pam
```

## Step 4: Deploy

### Using Setup Script

**Linux/Mac:**
```bash
chmod +x setup.sh
./setup.sh
```

**Windows:**
```bash
setup.bat
```

### Manual Deployment

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

## Step 5: Verify Installation

```bash
# Test backend API
curl http://localhost:5000/api/health
# Expected: {"status":"healthy"}

# Test frontend
curl http://localhost:3000/
# Should return HTML

# Check container logs for errors
docker-compose logs backend
docker-compose logs frontend
```

## Troubleshooting Deployment

### Containers Won't Start

```bash
# Check logs
docker-compose logs

# Rebuild without cache
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Backend Can't Connect to Proxmox

```bash
# Verify network connectivity
docker exec minecraft-manager-backend ping proxmox-host

# Test Proxmox API endpoint
docker exec minecraft-manager-backend curl -k https://proxmox-host:8006/api2/json/nodes
```

### Frontend Can't Connect to Backend

```bash
# Check if backend is running
docker-compose ps | grep backend

# Check backend logs
docker-compose logs backend

# Verify API response
curl http://localhost:5000/api/servers
```

### SSL Certificate Warnings

The Proxmox API uses self-signed SSL certificates by default. The backend ignores this for development. For production:

```bash
# Add your Proxmox certificate to backend
# Modify proxmoxClient.js to use: 
# ca: fs.readFileSync('/path/to/proxmox-cert.pem')
```

## Production Considerations

### 1. Reverse Proxy Setup (Nginx)

```nginx
server {
    listen 80;
    server_name minecraft-manager.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
    }
}
```

### 2. Add Authentication

Consider adding authentication middleware to `server.js`:

```javascript
// Add simple token auth
const SECRET_TOKEN = process.env.API_TOKEN;

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token || token !== SECRET_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});
```

### 3. Resource Limits

Set Docker resource limits in `docker-compose.yml`:

```yaml
services:
  backend:
    # ... other config
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### 4. Data Persistence

For sensitive data, use named volumes:

```yaml
volumes:
  manager_data:
    driver: local

services:
  backend:
    volumes:
      - manager_data:/app/data
```

## Monitoring

### View Logs

```bash
# Backend logs
docker-compose logs -f backend

# Frontend logs
docker-compose logs -f frontend

# All logs
docker-compose logs -f
```

### Check Container Stats

```bash
docker stats minecraft-manager-backend minecraft-manager-frontend
```

## Maintenance

### Update Application

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Backup Environment

```bash
# Backup .env file
cp .env .env.backup
```

### View Container Information

```bash
# Inspect backend
docker inspect minecraft-manager-backend

# Inspect frontend
docker inspect minecraft-manager-frontend
```

## Common Commands

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View running containers
docker-compose ps

# View logs (follow mode)
docker-compose logs -f

# Restart services
docker-compose restart

# Execute command in backend
docker exec minecraft-manager-backend node script.js

# Access backend shell
docker exec -it minecraft-manager-backend sh

# View specific timeframe logs
docker-compose logs --since 10m
```

## Getting Help

- Check Proxmox API docs: https://pve.proxmox.com/pve-docs/api-viewer/
- Docker Compose docs: https://docs.docker.com/compose/
- Report issues in the repository
