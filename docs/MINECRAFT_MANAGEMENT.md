# Minecraft Server Management Features

This system now provides comprehensive management capabilities for your Minecraft servers through SSH connectivity.

## 🚀 Features Overview

### 1. SSH Configuration
- **Secure SSH access** to your Ubuntu VMs running Minecraft servers
- **Private key authentication** for enhanced security
- **Configurable paths** for different Minecraft installations
- **Connection testing** before saving configuration

### 2. Server Control
- **Start/Stop/Restart** Minecraft server services
- **Real-time status** monitoring
- **Systemd service** integration for reliable server management

### 3. Configuration Management
- **View and edit** server.properties in real-time
- **Apply changes** remotely without manual SSH
- Support for **all Minecraft server properties**:
  - World seed
  - Server name (MOTD)
  - Gamemode
  - Difficulty
  - Max players
  - Resource pack URLs
  - And more...

### 4. Plugin Management
- **Install plugins** from direct download URLs
- **Upload plugins** from your local machine
- **List all installed** plugins
- **Remove plugins** with one click
- Automatic permission setting (chmod 644)

### 5. Version Updates
- **Update Minecraft version** remotely
- Automatic backup of old server jar
- **Download new versions** from any URL
- Supports:
  - Vanilla Minecraft
  - Spigot
  - Paper
  - Other server types

### 6. Server Monitoring
- **View logs** in real-time (last 200 lines)
- **System information** (OS, memory, disk, uptime)
- **Minecraft server status** (running/stopped)

### 7. System Updates
- Run **Ubuntu system updates** (admin only)
- `apt update && apt upgrade` with one click
- Output logging for troubleshooting

---

## 📋 Setup Instructions

### Step 1: Prepare Your Minecraft VM

1. **Install Minecraft server** on your Ubuntu VM:
   ```bash
   sudo mkdir -p /opt/minecraft
   sudo chown $USER:$USER /opt/minecraft
   cd /opt/minecraft
   wget https://launcher.mojang.com/v1/objects/.../server.jar
   ```

2. **Create systemd service** for Minecraft:
   ```bash
   sudo nano /etc/systemd/system/minecraft.service
   ```

   Example service file:
   ```ini
   [Unit]
   Description=Minecraft Server
   After=network.target

   [Service]
   Type=simple
   User=minecraft
   WorkingDirectory=/opt/minecraft
   ExecStart=/usr/bin/java -Xmx2G -Xms1G -jar server.jar nogui
   Restart=on-failure
   RestartSec=10

   [Install]
   WantedBy=multi-user.target
   ```

3. **Enable and start service**:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable minecraft.service
   sudo systemctl start minecraft.service
   ```

### Step 2: Generate SSH Key (On Manager Host)

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/minecraft_manager
```

### Step 3: Copy Public Key to VM

```bash
ssh-copy-id -i ~/.ssh/minecraft_manager.pub root@<VM_IP>
```

### Step 4: Configure SSH in Web Interface

1. Click **🔑 SSH** button on a server
2. Fill in:
   - **SSH Host**: VM IP address (e.g., 192.168.1.100)
   - **SSH Port**: 22 (default)
   - **SSH Username**: root (or your user)
   - **SSH Private Key**: Copy contents of `~/.ssh/minecraft_manager`
   - **Minecraft Path**: /opt/minecraft (or your path)
3. Click **Save Configuration** (connection will be tested)

### Step 5: Manage Your Server

1. Click **⚙️ Manage** on any configured server
2. Use the tabs to:
   - Control server (Start/Stop/Restart)
   - Edit properties
   - Install/manage plugins
   - View logs
   - Check system info

---

## 🔒 Security Considerations

### SSH Keys
- Private keys are stored **encrypted** in the database
- Keys are **never exposed** to clients (only host/port/username shown)
- Use **dedicated SSH keys** for this manager (not your personal keys)

### Access Control
- Only **admins and server creators** can configure SSH
- Only **admins and server creators** can modify server settings
- All users can **view status** and **clone servers**
- System updates are **admin-only**

### Best Practices
1. **Use non-root user** for SSH if possible
2. **Disable password authentication** on VMs
3. **Restrict SSH to manager's IP** in VM firewall
4. **Regularly rotate SSH keys**
5. **Monitor audit logs** for suspicious activity

---

## 🎮 Common Use Cases

### Use Case 1: Quick Server Setup
1. Clone a template server (with Proxmox)
2. Configure SSH access
3. Update server.properties (seed, name, gamemode)
4. Install desired plugins
5. Start the server

### Use Case 2: Plugin Updates
1. Click **⚙️ Manage**
2. Go to **Plugins** tab
3. List installed plugins
4. Remove old version
5. Install new version from URL

### Use Case 3: Minecraft Version Update
1. Click **⚙️ Manage**
2. Stop the server in **Status** tab
3. Use API endpoint or SSH to update jar
4. Start the server

### Use Case 4: Troubleshooting
1. Click **⚙️ Manage**
2. Go to **Logs** tab
3. Check recent server output
4. Go to **System** tab to check resources
5. Restart if needed

---

## 🛠️ API Endpoints

### SSH Configuration
```http
POST /api/servers/:vmid/ssh-config
GET  /api/servers/:vmid/ssh-config
```

### Server Control
```http
GET  /api/servers/:vmid/minecraft/status
POST /api/servers/:vmid/minecraft/start
POST /api/servers/:vmid/minecraft/stop
POST /api/servers/:vmid/minecraft/restart
```

### Properties Management
```http
GET   /api/servers/:vmid/minecraft/properties
PATCH /api/servers/:vmid/minecraft/properties
```

### Plugin Management
```http
GET    /api/servers/:vmid/minecraft/plugins
POST   /api/servers/:vmid/minecraft/plugins
POST   /api/servers/:vmid/minecraft/plugins/upload
DELETE /api/servers/:vmid/minecraft/plugins/:pluginName
```

### Version & Logs
```http
GET  /api/servers/:vmid/minecraft/version
POST /api/servers/:vmid/minecraft/update-version
GET  /api/servers/:vmid/minecraft/logs
```

### System Management
```http
GET  /api/servers/:vmid/system/info
POST /api/servers/:vmid/system/update  # Admin only
```

---

## 📊 Database Schema Updates

New columns added to `managed_servers` table:
- `ssh_host` - SSH connection hostname/IP
- `ssh_port` - SSH port (default: 22)
- `ssh_username` - SSH username
- `ssh_private_key` - Encrypted SSH private key
- `minecraft_path` - Path to Minecraft installation
- `minecraft_version` - Current Minecraft version
- `ssh_configured` - Boolean flag for SSH setup status

---

## 🧪 Testing

### Test SSH Configuration
```bash
# From manager host, test SSH connection:
ssh -i ~/.ssh/minecraft_manager root@<VM_IP> "echo 'SSH works!'"
```

### Test Minecraft Service
```bash
ssh -i ~/.ssh/minecraft_manager root@<VM_IP> "systemctl status minecraft.service"
```

### Test File Permissions
```bash
ssh -i ~/.ssh/minecraft_manager root@<VM_IP> "ls -la /opt/minecraft/server.properties"
```

---

## 🐛 Troubleshooting

### "SSH not configured" Error
**Solution**: Click the 🔑 SSH button and configure SSH access first.

### "SSH connection test failed"
**Possible causes**:
1. Wrong IP address
2. SSH key not copied to VM
3. Firewall blocking port 22
4. Wrong username

**Solution**: 
```bash
# Test manually first:
ssh -i /path/to/key username@host
```

### "Permission denied" when managing server
**Possible causes**:
1. Wrong SSH username
2. SSH key permissions too open
3. User doesn't have sudo access

**Solution**:
```bash
# Fix key permissions:
chmod 600 ~/.ssh/minecraft_manager

# Add user to sudo group on VM:
sudo usermod -aG sudo minecraft
```

### Plugin upload fails
**Possible causes**:
1. Plugin too large (>50MB limit)
2. /opt/minecraft/plugins directory doesn't exist
3. Permission issues

**Solution**:
```bash
# Create plugins directory:
mkdir -p /opt/minecraft/plugins
chmod 755 /opt/minecraft/plugins
```

---

## 🎯 Future Enhancements

Potential future features:
- **Backup management** (create/restore world backups)
- **Resource pack management**
- **Scheduled tasks** (automated restarts, backups)
- **Multi-server orchestration** (update all servers at once)
- **Performance metrics** (TPS, player count graphs)
- **Mod management** (for modded servers)
- **Database management** (MySQL/PostgreSQL setup)

---

## 📝 Notes

- SSH connections are **not persistent** - they open, execute, and close for each operation
- Large plugin uploads may take time depending on network speed
- System updates can take several minutes - run during maintenance windows
- Always **backup your worlds** before major updates
- The manager requires **systemd** for service management (standard on Ubuntu)

---

## 🤝 Contributing

Found a bug or have a feature request? Please create an issue or submit a pull request!

---

## 📄 License

This feature is part of the Minecraft Server Manager project.
