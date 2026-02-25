# Quick Start: Minecraft Server Management

## 🚀 5-Minute Setup Guide

### Prerequisites
- Ubuntu VM with Minecraft server installed
- SSH access to the VM
- Manager web interface running

---

## Step 1: Generate SSH Key (2 minutes)

On your **manager machine** (where the web app runs):

```bash
# Generate a new SSH key
ssh-keygen -t rsa -b 4096 -f ~/.ssh/minecraft_manager -N ""

# Copy to your Minecraft VM
ssh-copy-id -i ~/.ssh/minecraft_manager.pub root@YOUR_VM_IP

# Test connection
ssh -i ~/.ssh/minecraft_manager root@YOUR_VM_IP "echo 'Success!'"
```

---

## Step 2: Prepare Minecraft Server (3 minutes)

On your **Minecraft VM**:

```bash
# Create systemd service
sudo cat > /etc/systemd/system/minecraft.service <<EOF
[Unit]
Description=Minecraft Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/minecraft
ExecStart=/usr/bin/java -Xmx2G -Xms1G -jar server.jar nogui
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable service
sudo systemctl daemon-reload
sudo systemctl enable minecraft.service
sudo systemctl start minecraft.service

# Verify it's running
sudo systemctl status minecraft.service
```

---

## Step 3: Configure SSH in Web Interface (1 minute)

1. Open the Minecraft Server Manager web interface
2. Click **🔑 SSH** button on your server
3. Fill in the form:
   ```
   SSH Host: 192.168.1.100  (your VM IP)
   SSH Port: 22
   SSH Username: root
   SSH Private Key: [paste contents of ~/.ssh/minecraft_manager]
   Minecraft Path: /opt/minecraft
   ```
4. Click **Save Configuration**

✅ If you see "SSH configured successfully!" - you're done!

---

## Step 4: Start Managing! (immediate)

Click **⚙️ Manage** on your server to:

### Control Your Server
- **Start/Stop/Restart** the Minecraft service
- View **real-time status**

### Configure Properties
```properties
level-seed=123456789
server-name=My Awesome Server
gamemode=survival
difficulty=normal
max-players=20
```

### Install Plugins
**From URL:**
```
Plugin Name: EssentialsX.jar
Download URL: https://ci.ender.zone/job/EssentialsX/lastSuccessfulBuild/artifact/jars/EssentialsX.jar
```

**Or upload** a .jar file from your computer!

### View Logs
See the last 200 lines of your server logs in real-time.

### Check System
Monitor memory, disk space, and uptime.

---

## 🎯 Quick Tasks

### Change World Seed
1. **⚙️ Manage** → **Properties** tab
2. Click **Edit**
3. Change `level-seed=12345`
4. Click **Save**
5. Go to **Status** tab → **Restart Server**

### Install a Plugin
1. **⚙️ Manage** → **Plugins** tab
2. Enter plugin name and URL
3. Click **Install from URL**
4. Go to **Status** tab → **Restart Server**

### View Recent Activity
1. **⚙️ Manage** → **Logs** tab
2. Click **Refresh** for latest logs

---

## 🐛 Quick Troubleshooting

### "SSH connection test failed"
```bash
# Test manually first:
ssh -i ~/.ssh/minecraft_manager root@YOUR_VM_IP

# If that fails, check:
# - Is SSH running on VM? sudo systemctl status ssh
# - Firewall blocking? sudo ufw allow 22
# - Correct IP address?
```

### "Permission denied"
```bash
# Fix SSH key permissions:
chmod 600 ~/.ssh/minecraft_manager

# Verify key was copied:
ssh -i ~/.ssh/minecraft_manager root@YOUR_VM_IP "cat ~/.ssh/authorized_keys"
```

### Server won't start
```bash
# Check on VM:
sudo systemctl status minecraft.service
sudo journalctl -u minecraft.service -n 50

# Common issues:
# - Java not installed
# - Server jar missing
# - Port 25565 already in use
```

---

## 📚 Full Documentation

For complete details, see [MINECRAFT_MANAGEMENT.md](./MINECRAFT_MANAGEMENT.md)

---

## 🎉 You're Ready!

You can now:
- ✅ Control your Minecraft server from the web
- ✅ Install and manage plugins
- ✅ Update server configuration
- ✅ Monitor logs and system resources
- ✅ Clone servers with custom configurations

**Next:** Click **📋 Clone** to create more servers based on your template!
