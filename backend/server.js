import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import ProxmoxClient from './proxmoxClient.js';
import VelocityClient from './velocityClient.js';
import { 
  initializeDatabase, 
  User, 
  Session,
  ServerCloneLog,
  ManagedServer,
  AppConfig,
  ErrorLog,
  PasswordResetToken,
  ApiMetric,
  pool
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
import { errorHandler, metricsMiddleware } from './middleware.js';
import { swaggerSpec } from './swagger.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Rate limiting configurations
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true
});

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
    app.use(metricsMiddleware); // Track API metrics
    app.use('/api/', generalLimiter); // Apply rate limiting to all API routes

    // ============================================
    // API DOCUMENTATION
    // ============================================

    // Swagger API documentation
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // ============================================
    // AUTHENTICATION ROUTES (No auth required)
    // ============================================

    /**
     * @swagger
     * /api/auth/login:
     *   post:
     *     summary: Login to get JWT token
     *     tags: [Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LoginRequest'
     *     responses:
     *       200:
     *         description: Login successful
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LoginResponse'
     *       401:
     *         description: Invalid credentials
     */
    // Login endpoint
    app.post('/api/auth/login', authLimiter, async (req, res) => {
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
    app.post('/api/auth/logout', verifyToken, async (req, res) => {
      try {
        // Optionally revoke the session token if tracking in DB
        // await Session.revoke(req.headers.authorization?.split(' ')[1]);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Request password reset
    app.post('/api/auth/request-reset', authLimiter, async (req, res) => {
      try {
        const { email } = req.body;

        if (!email) {
          return res.status(400).json({ error: 'Email is required' });
        }

        const user = await User.findByEmail(email);
        if (!user) {
          // Don't reveal whether email exists for security
          return res.json({ 
            success: true, 
            message: 'If an account with that email exists, a password reset link has been sent.' 
          });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

        await PasswordResetToken.create(user.id, resetToken, expiresAt);

        // In production, send email here
        // For now, return the token (REMOVE THIS IN PRODUCTION)
        console.log(`Password reset token for ${email}: ${resetToken}`);
        
        res.json({ 
          success: true, 
          message: 'If an account with that email exists, a password reset link has been sent.',
          // REMOVE IN PRODUCTION:
          resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Reset password with token
    app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
      try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
          return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const resetToken = await PasswordResetToken.findByToken(token);
        if (!resetToken) {
          return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update user password
        const user = await User.findById(resetToken.user_id);
        await pool.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [passwordHash, user.id]
        );

        // Mark token as used
        await PasswordResetToken.markAsUsed(token);

        // Revoke all existing sessions for security
        await Session.revokeAllForUser(user.id);

        res.json({ success: true, message: 'Password reset successful' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
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
    // SESSION MANAGEMENT ROUTES (Admin only)
    // ============================================

    // Get all active sessions
    app.get('/api/admin/sessions', verifyToken, requireAdmin, async (req, res) => {
      try {
        const result = await pool.query(
          'SELECT s.id, s.user_id, s.created_at, s.expires_at, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.expires_at > CURRENT_TIMESTAMP ORDER BY s.created_at DESC'
        );
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revoke specific session
    app.delete('/api/admin/sessions/:sessionId', verifyToken, requireAdmin, async (req, res) => {
      try {
        await pool.query('DELETE FROM sessions WHERE id = $1', [parseInt(req.params.sessionId)]);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Revoke all sessions for a user
    app.delete('/api/admin/users/:userId/sessions', verifyToken, requireAdmin, async (req, res) => {
      try {
        await Session.revokeAllForUser(parseInt(req.params.userId));
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================
    // ERROR LOG ROUTES (Admin only)
    // ============================================

    // Get error logs with pagination and filtering
    app.get('/api/admin/error-logs', verifyToken, requireAdmin, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const filters = {};
        if (req.query.errorType) filters.errorType = req.query.errorType;
        if (req.query.userId) filters.userId = parseInt(req.query.userId);
        if (req.query.startDate) filters.startDate = req.query.startDate;
        if (req.query.endDate) filters.endDate = req.query.endDate;

        const [logs, total] = await Promise.all([
          ErrorLog.getAll(limit, offset, filters),
          ErrorLog.getCount(filters)
        ]);

        res.json({
          logs,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get error log statistics
    app.get('/api/admin/error-logs/stats', verifyToken, requireAdmin, async (req, res) => {
      try {
        const hours = parseInt(req.query.hours) || 24;
        const result = await pool.query(
          `SELECT error_type, COUNT(*) as count 
           FROM error_logs 
           WHERE created_at > NOW() - INTERVAL '${hours} hours' 
           GROUP BY error_type 
           ORDER BY count DESC`
        );
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Clear old error logs
    app.delete('/api/admin/error-logs/cleanup', verifyToken, requireAdmin, async (req, res) => {
      try {
        const days = parseInt(req.query.days) || 30;
        await ErrorLog.deleteOlderThan(days);
        res.json({ success: true, message: `Deleted logs older than ${days} days` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================
    // API METRICS ROUTES (Admin only)
    // ============================================

    // Get API metrics
    app.get('/api/admin/metrics', verifyToken, requireAdmin, async (req, res) => {
      try {
        const hours = parseInt(req.query.hours) || 24;
        const endpoint = req.query.endpoint || null;

        const stats = await ApiMetric.getStats(endpoint, hours);
        
        // Get endpoint breakdown
        const endpointStats = await pool.query(
          `SELECT endpoint, COUNT(*) as count, AVG(response_time) as avg_time 
           FROM api_metrics 
           WHERE created_at > NOW() - INTERVAL '${hours} hours' 
           GROUP BY endpoint 
           ORDER BY count DESC 
           LIMIT 20`
        );

        res.json({
          overall: stats,
          byEndpoint: endpointStats.rows
        });
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

    /**
     * @swagger
     * /api/servers:
     *   get:
     *     summary: Get all servers with pagination and filtering
     *     tags: [Servers]
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *         description: Page number (default 1)
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *         description: Items per page (default 20)
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search by server name
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *         description: Filter by status (running/stopped)
     *       - in: query
     *         name: sortBy
     *         schema:
     *           type: string
     *         description: Sort by field (name/vmid/status)
     *       - in: query
     *         name: sortOrder
     *         schema:
     *           type: string
     *         description: Sort order (asc/desc)
     *     responses:
     *       200:
     *         description: List of servers
     */
    // Get all servers (protected) - includes creator info, seed, pagination, and filtering
    app.get('/api/servers', verifyToken, async (req, res) => {
      try {
        // Get query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const statusFilter = req.query.status || '';
        const sortBy = req.query.sortBy || 'vmid';
        const sortOrder = req.query.sortOrder || 'asc';

        // Load Proxmox config from database (updated in real-time when admin saves config)
        console.log('📋 Loading Proxmox config from database...');
        const proxmoxHost = await AppConfig.get('proxmox_host');
        const proxmoxUsername = await AppConfig.get('proxmox_username');
        const proxmoxPassword = await AppConfig.get('proxmox_password');
        const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';

        if (!proxmoxHost || !proxmoxUsername || !proxmoxPassword) {
          return res.status(400).json({ 
            error: 'Proxmox not configured',
            message: 'Please configure Proxmox credentials in Admin Settings → Configuration'
          });
        }

        // Create a fresh ProxmoxClient with current database credentials
        const currentProxmox = new ProxmoxClient({
          host: proxmoxHost,
          username: proxmoxUsername,
          password: proxmoxPassword,
          realm: proxmoxRealm
        });

        // Get all servers from Proxmox
        console.log(`📋 Fetching servers from Proxmox (${proxmoxHost})...`);
        let servers = await currentProxmox.getServers();
        console.log(`✓ Found ${servers.length} servers with 'minecraft' in name`);
        
        // Enrich servers with creator information and seed
        const enrichedServers = await Promise.all(
          servers.map(async (server) => {
            try {
              const creator = await ManagedServer.getCreator(server.vmid);
              const serverRecord = await ManagedServer.getServer(server.vmid);
              return {
                ...server,
                creator_id: creator,
                is_owned_by_user: creator === req.user.userId,
                seed: serverRecord?.seed || null
              };
            } catch (enrichError) {
              console.error(`⚠️  Error enriching server ${server.vmid}:`, enrichError.message);
              // Return server with partial data if enrichment fails
              return {
                ...server,
                creator_id: null,
                is_owned_by_user: false,
                seed: null
              };
            }
          })
        );

        // Apply filters
        let filteredServers = enrichedServers;

        // Search filter (by name)
        if (search) {
          filteredServers = filteredServers.filter(server =>
            server.name.toLowerCase().includes(search.toLowerCase())
          );
        }

        // Status filter
        if (statusFilter) {
          filteredServers = filteredServers.filter(server =>
            server.status === statusFilter
          );
        }

        // Sort servers
        filteredServers.sort((a, b) => {
          let aVal = a[sortBy];
          let bVal = b[sortBy];

          // Handle string comparisons
          if (typeof aVal === 'string') {
            aVal = aVal.toLowerCase();
            bVal = bVal.toLowerCase();
          }

          if (sortOrder === 'desc') {
            return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
          } else {
            return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
          }
        });

        // Calculate pagination
        const total = filteredServers.length;
        const totalPages = Math.ceil(total / limit);
        const offset = (page - 1) * limit;
        const paginatedServers = filteredServers.slice(offset, offset + limit);

        res.json({
          servers: paginatedServers,
          pagination: {
            page,
            limit,
            total,
            totalPages
          }
        });
      } catch (error) {
        console.error('❌ Error fetching servers:', error);
        res.status(500).json({ error: error.message, details: error.stack });
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

    // Global error handler (must be last)
    app.use(errorHandler);

    // Start listening
    app.listen(port, () => {
      console.log(`✓ Minecraft Server Manager API running on port ${port}`);
      console.log(`✓ API Documentation available at http://localhost:${port}/api-docs`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
