import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import ProxmoxClient from './proxmoxClient.js';
import VelocityClient from './velocityClient.js';
import { 
  initializeDatabase, 
  User, 
  Session,
  ServerCloneLog,
  ManagedServer,
  AppConfig
} from './database.js';
import { 
  generateToken, 
  verifyToken, 
  requireAdmin, 
  requireRole,
  canDeleteServer,
  canCloneServer,
  canStartStop
} from './auth.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('✓ Database initialized');

    // Initialize Proxmox client
    const proxmox = new ProxmoxClient({
      host: process.env.PROXMOX_HOST,
      username: process.env.PROXMOX_USERNAME,
      password: process.env.PROXMOX_PASSWORD,
      realm: process.env.PROXMOX_REALM || 'pam'
    });

    // Initialize Velocity client
    const velocity = new VelocityClient();
    if (velocity.isConfigured()) {
      console.log('✓ Velocity server configured');
    } else {
      console.log('ℹ  Velocity server not configured (optional)');
    }

    // Middleware
    app.use(cors());
    app.use(express.json());

    // ============================================
    // AUTHENTICATION ROUTES (No auth required)
    // ============================================

    // Login endpoint
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { username, password } = req.body;

        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password required' });
        }

        const user = await User.findByUsername(username);
        if (!user) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
          return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Update last login
        await User.updateLastLogin(user.id);

        // Generate JWT token
        const token = generateToken(user.id, user.username, user.role);

        res.json({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Register endpoint (admin only)
    app.post('/api/auth/register', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { username, email, password, role } = req.body;

        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password required' });
        }

        // Check if user already exists
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
          return res.status(400).json({ error: 'Username already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const userId = await User.create(username, email, passwordHash, role || 'user');

        res.json({
          success: true,
          user: {
            id: userId,
            username,
            email,
            role: role || 'user'
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Logout endpoint
    app.post('/api/auth/logout', verifyToken, (req, res) => {
      res.json({ success: true });
    });

    // Get current user
    app.get('/api/auth/me', verifyToken, async (req, res) => {
      try {
        const user = await User.findById(req.user.userId);
        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
          last_login: user.last_login
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================
    // USER MANAGEMENT ROUTES (Admin only)
    // ============================================

    // Get all users
    app.get('/api/users', verifyToken, requireAdmin, async (req, res) => {
      try {
        const users = await User.getAll();
        res.json(users);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete user (admin only)
    app.delete('/api/users/:userId', verifyToken, requireAdmin, async (req, res) => {
      try {
        // Prevent deleting yourself
        if (parseInt(req.params.userId) === req.user.userId) {
          return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        await User.delete(parseInt(req.params.userId));
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update user role (admin only)
    app.patch('/api/users/:userId/role', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { role } = req.body;

        if (!['admin', 'user'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }

        await User.updateRole(parseInt(req.params.userId), role);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================
    // CONFIGURATION MANAGEMENT ROUTES (Admin only)
    // ============================================

    // Get all configuration
    app.get('/api/admin/config', verifyToken, requireAdmin, async (req, res) => {
      try {
        const config = await AppConfig.getAll();
        // Mask sensitive values when sending to frontend
        const maskedConfig = {};
        for (const [key, data] of Object.entries(config)) {
          maskedConfig[key] = {
            value: key.includes('password') || key.includes('secret') || key.includes('token') || key.includes('key') 
              ? (data.value ? '••••••••' : '') 
              : data.value,
            type: data.type,
            description: data.description,
            isSensitive: key.includes('password') || key.includes('secret') || key.includes('token') || key.includes('key')
          };
        }
        res.json(maskedConfig);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update configuration
    app.put('/api/admin/config', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { proxmox, velocity, node } = req.body;

        if (proxmox) {
          await AppConfig.set('proxmox_host', proxmox.host, req.user.userId, 'Proxmox server hostname');
          if (proxmox.username) await AppConfig.set('proxmox_username', proxmox.username, req.user.userId, 'Proxmox API username');
          if (proxmox.password) await AppConfig.set('proxmox_password', proxmox.password, req.user.userId, 'Proxmox API password', 'password');
          if (proxmox.realm) await AppConfig.set('proxmox_realm', proxmox.realm, req.user.userId, 'Proxmox authentication realm');
        }

        if (node) {
          await AppConfig.set('proxmox_node', node, req.user.userId, 'Default Proxmox node name');
        }

        if (velocity) {
          if (velocity.host) await AppConfig.set('velocity_host', velocity.host, req.user.userId, 'Velocity server hostname');
          if (velocity.port) await AppConfig.set('velocity_port', velocity.port.toString(), req.user.userId, 'Velocity server port');
          if (velocity.apiKey) await AppConfig.set('velocity_api_key', velocity.apiKey, req.user.userId, 'Velocity API key', 'password');
          if (velocity.backendNetwork) await AppConfig.set('velocity_backend_network', velocity.backendNetwork, req.user.userId, 'Velocity backend network range');
        }

        res.json({ success: true, message: 'Configuration updated successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Test Proxmox connection
    app.post('/api/admin/config/test-proxmox', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, username, password, realm } = req.body;

        if (!host || !username || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'Proxmox host, username, and password are required' 
          });
        }

        try {
          // Create a temporary Proxmox client to test connection
          const testProxmox = new ProxmoxClient({
            host,
            username,
            password,
            realm: realm || 'pam'
          });

          // Try to get nodes list as a connection test
          const nodes = await testProxmox.getNodes();
          res.json({ 
            success: true, 
            message: 'Connection successful',
            nodes: nodes.map(n => n.node)
          });
        } catch (error) {
          res.json({ 
            success: false, 
            error: `Connection failed: ${error.message}` 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test Velocity connection
    app.post('/api/admin/config/test-velocity', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, port, apiKey } = req.body;

        if (!host || !port || !apiKey) {
          return res.status(400).json({ 
            success: false, 
            error: 'Velocity host, port, and API key are required' 
          });
        }

        try {
          // Create a temporary Velocity client to test connection
          const testVelocity = new VelocityClient({ host, port, apiKey });
          await testVelocity.listServers();
          
          res.json({ 
            success: true, 
            message: 'Connection successful'
          });
        } catch (error) {
          res.json({ 
            success: false, 
            error: `Connection failed: ${error.message}` 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // ============================================
    // SERVER MANAGEMENT ROUTES (Auth required)
    // ============================================

    // Get all servers (protected) - includes creator info and seed
    app.get('/api/servers', verifyToken, async (req, res) => {
      try {
        const servers = await proxmox.getServers();
        
        // Enrich servers with creator information and seed
        const enrichedServers = await Promise.all(
          servers.map(async (server) => {
            const creator = await ManagedServer.getCreator(server.vmid);
            const serverRecord = await ManagedServer.getServer(server.vmid);
            return {
              ...server,
              creator_id: creator,
              is_owned_by_user: creator === req.user.userId,
              seed: serverRecord?.seed || null
            };
          })
        );
        
        res.json(enrichedServers);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get server details (protected)
    app.get('/api/servers/:vmid', verifyToken, async (req, res) => {
      try {
        const server = await proxmox.getServerDetails(req.params.vmid);
        res.json(server);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clone a server (protected - users and admins)
    app.post('/api/servers/clone', verifyToken, async (req, res) => {
      try {
        // Check permissions
        if (!canCloneServer(req.user)) {
          return res.status(403).json({ error: 'You do not have permission to clone servers' });
        }

        const { sourceVmId, newVmId, domainName, seed } = req.body;
        
        if (!sourceVmId || !newVmId || !domainName) {
          return res.status(400).json({ 
            error: 'Missing required fields: sourceVmId, newVmId, domainName' 
          });
        }

        // Generate random seed if not provided or if explicitly requested
        let serverSeed = seed;
        if (!seed || seed === 'random') {
          serverSeed = Math.floor(Math.random() * 9223372036854775807).toString();
        }

        // Use domain name as the VM name
        const newVmName = domainName;
        const result = await proxmox.cloneServer(sourceVmId, newVmId, newVmName);
        
        // Log the action and track as managed server with seed
        await ServerCloneLog.create(req.user.userId, sourceVmId, newVmId, newVmName, 'pending');
        await ManagedServer.create(newVmId, req.user.userId, newVmName, serverSeed);

        // Try to add to Velocity server list (optional - won't fail clone if it fails)
        // Note: This assumes the new server IP will be on the Proxmox local network
        // You may need to adjust the IP or add additional configuration
        if (velocity.isConfigured()) {
          // Extract the numeric part to get the potential IP on local network
          // For example, minecraft02 might be 192.168.x.102 on your network
          const numericPart = newVmId.toString();
          const localIp = process.env.VELOCITY_BACKEND_NETWORK || '192.168.1';
          const serverIp = `${localIp}.${numericPart}`;
          
          const velocityResult = await velocity.addServer(
            domainName,
            serverIp,
            25565
          );
          
          if (!velocityResult.success) {
            console.warn(`⚠️  Could not fully configure velocity, but VM clone succeeded: ${velocityResult.message}`);
          }
        }

        res.json({ success: true, taskId: result, domainName, seed: serverSeed });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Start server (protected - users and admins)
    app.post('/api/servers/:vmid/start', verifyToken, async (req, res) => {
      try {
        if (!canStartStop(req.user)) {
          return res.status(403).json({ error: 'You do not have permission to start servers' });
        }

        const result = await proxmox.startServer(req.params.vmid);
        res.json({ success: true, taskId: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Stop server (protected - users and admins)
    app.post('/api/servers/:vmid/stop', verifyToken, async (req, res) => {
      try {
        if (!canStartStop(req.user)) {
          return res.status(403).json({ error: 'You do not have permission to stop servers' });
        }

        const result = await proxmox.stopServer(req.params.vmid);
        res.json({ success: true, taskId: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete server (creator or admin)
    app.delete('/api/servers/:vmid', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check if user is admin or the creator of this server
        let isCreator = false;
        if (req.user.role !== 'admin') {
          const creatorId = await ManagedServer.getCreator(vmid);
          isCreator = creatorId === req.user.userId;
        }

        if (req.user.role !== 'admin' && !isCreator) {
          return res.status(403).json({ error: 'You can only delete servers you created' });
        }

        // Get server name before deletion (for velocity cleanup)
        const servers = await proxmox.getServers();
        const server = servers.find(s => s.vmid === vmid);
        const serverName = server?.name;

        const result = await proxmox.deleteServer(vmid);
        
        // Remove from managed servers tracking
        await ManagedServer.delete(vmid);

        // Remove from Velocity server list if configured
        if (velocity.isConfigured() && serverName) {
          const velocityResult = await velocity.removeServer(serverName);
          if (!velocityResult.success) {
            console.warn(`⚠️  Could not remove from velocity, but VM deletion succeeded: ${velocityResult.message}`);
          }
        }
        
        res.json({ success: true, taskId: result });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get task status (protected)
    app.get('/api/tasks/:taskId', verifyToken, async (req, res) => {
      try {
        const status = await proxmox.getTaskStatus(req.params.taskId);
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get clone history (user gets own, admin gets all)
    app.get('/api/clone-history', verifyToken, async (req, res) => {
      try {
        let history;
        if (req.user.role === 'admin') {
          history = await ServerCloneLog.getAll();
        } else {
          history = await ServerCloneLog.getByUser(req.user.userId);
        }
        res.json(history);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health check (no auth required)
    app.get('/api/health', (req, res) => {
      res.json({ status: 'healthy' });
    });

    // Start listening
    app.listen(port, () => {
      console.log(`✓ Minecraft Server Manager API running on port ${port}`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
