# Minecraft Server Manager

A full-stack web application for managing Minecraft servers running on Proxmox. Your son can easily clone existing servers and manage them through a modern web interface.

## Features

✅ **Server Listing** - View all Minecraft servers on your Proxmox host
✅ **Clone Servers** - Create new servers by copying existing ones  
✅ **Start/Stop** - Control server power state
✅ **Real-time Updates** - Auto-refresh server status every 10 seconds
✅ **Docker Ready** - Deploy as containers on any Docker host

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   React     │ HTTP    │   Express    │ HTTPS   │   Proxmox    │
│   Frontend  │◄───────►│   Backend    │◄───────►│   API        │
│   Port 3000 │         │   Port 5000  │         │   Port 8006  │
└─────────────┘         └──────────────┘         └──────────────┘
```

## Prerequisites

- Docker & Docker Compose
- Proxmox server with API access
- Valid Proxmox credentials (username, password, realm)
- Network access from Docker host to Proxmox host

## Quick Start

### 1. Clone and Configure

```bash
cd minecraft-web
cp .env.example .env
```

### 2. Set Proxmox Credentials

Edit `.env` and fill in your Proxmox details:

```env
PROXMOX_HOST=your-proxmox-ip-or-hostname.local
PROXMOX_USERNAME=your-user@pam
PROXMOX_PASSWORD=your-secure-password
PROXMOX_REALM=pam
```

### 3. Start with Docker Compose

```bash
docker-compose up -d
```

The app will be available at:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api

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
2. **Authentication**: Implement user authentication for the web app
3. **Credentials Storage**: Never commit `.env` files; use secret management tools
4. **Network**: Run on internal network or behind VPN
5. **API Permissions**: Create restricted Proxmox users with minimal required permissions
6. **Rate Limiting**: Add authentication before exposing to the internet

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
│   ├── server.js           # Express app
│   ├── proxmoxClient.js    # Proxmox API client
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── App.js          # Main React component
│   │   ├── components/
│   │   │   ├── ServerList.js
│   │   │   └── CloneForm.js
│   │   └── styles/
│   ├── public/
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## Future Enhancements

- [ ] User authentication
- [ ] Server resource configuration UI
- [ ] Server scheduling (auto-start/stop)
- [ ] Backup management
- [ ] Performance metrics display
- [ ] Mobile app
- [ ] Slack/Discord integration for notifications

## License

MIT License - feel free to modify for your needs

## Support

For issues with Proxmox API integration, see: https://pve.proxmox.com/pve-docs/api-viewer/
