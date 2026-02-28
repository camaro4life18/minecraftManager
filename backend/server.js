import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import multer from 'multer';
import path from 'path';
import ProxmoxClient from './proxmoxClient.js';
import VelocityClient from './velocityClient.js';
import SSHClient, { MinecraftServerManager } from './sshClient.js';
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
import CloneStatus from './cloneStatus.js';
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
const routerServiceUrl = process.env.ROUTER_SERVICE_URL || 'http://localhost:7001';
const dhcpEnabled = process.env.DHCP_ENABLED !== 'false';
const liveCloneProgress = new Map();

const setLiveCloneProgress = (requestId, payload) => {
  if (!requestId) {
    return;
  }

  liveCloneProgress.set(requestId, {
    ...payload,
    updatedAt: new Date().toISOString()
  });
};

const clearLiveCloneProgressLater = (requestId, delayMs = 30 * 60 * 1000) => {
  if (!requestId) {
    return;
  }

  setTimeout(() => {
    liveCloneProgress.delete(requestId);
  }, delayMs);
};

const routerServicePost = async (path, payload) => {
  try {
    const response = await axios.post(`${routerServiceUrl}${path}`, payload, {
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.error || error.message;
    throw new Error(message);
  }
};

// Rate limiting configurations
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.'
    });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login requests per windowMs
  message: 'Too many login attempts, please try again later.',
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many login attempts, please try again later.'
    });
  }
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

    // Multer configuration for plugin uploads
    const upload = multer({ 
      dest: 'uploads/',
      limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
    });

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
        const { proxmox, velocity, node, router } = req.body;

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

        if (router) {
          if (router.host) await AppConfig.set('router_host', router.host, req.user.userId, 'Router hostname or IP');
          if (router.username) await AppConfig.set('router_username', router.username, req.user.userId, 'Router admin username');
          if (router.password) await AppConfig.set('router_password', router.password, req.user.userId, 'Router admin password', 'password');
          await AppConfig.set('router_use_https', (router.useHttps === true).toString(), req.user.userId, 'Router uses HTTPS');
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

    // Test ASUS Router connection
    app.post('/api/admin/config/test-router', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, username, password, useHttps } = req.body;

        if (!host || !username || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'Router host, username, and password are required' 
          });
        }

        try {
          console.log(`🧪 Testing ASUS router connection to ${host}...`);
          const result = await routerServicePost('/test', {
            host,
            username,
            password,
            useHttps: useHttps !== false
          });

          res.json(result);
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

    // Get router configuration
    app.get('/api/admin/config/router', verifyToken, requireAdmin, async (req, res) => {
      try {
        const routerHost = await AppConfig.get('router_host');
        const routerUsername = await AppConfig.get('router_username');
        // Don't send password back to client
        
        res.json({
          configured: !!(routerHost && routerUsername),
          host: routerHost || '',
          username: routerUsername || '',
          useHttps: (await AppConfig.get('router_use_https')) !== 'false'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update router configuration
    app.put('/api/admin/config/router', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, username, password, useHttps } = req.body;

        if (!host || !username || !password) {
          return res.status(400).json({ 
            error: 'Router host, username, and password are required' 
          });
        }

        // Save router config to database
        await AppConfig.set('router_host', host, req.user.userId, 'ASUS Router IP address');
        await AppConfig.set('router_username', username, req.user.userId, 'ASUS Router username');
        await AppConfig.set('router_password', password, req.user.userId, 'ASUS Router password');
        await AppConfig.set('router_use_https', useHttps ? 'true' : 'false', req.user.userId, 'Use HTTPS for router');

        console.log(`✅ Router configuration updated by ${req.user.username}`);
        res.json({ success: true, message: 'Router configuration saved' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get DHCP reservations from router
    app.get('/api/admin/router/dhcp-reservations', verifyToken, requireAdmin, async (req, res) => {
      try {
        if (!dhcpEnabled) {
          return res.status(503).json({
            error: 'DHCP functionality is disabled on the server.'
          });
        }

        const routerHost = await AppConfig.get('router_host');
        const routerUsername = await AppConfig.get('router_username');
        const routerPassword = await AppConfig.get('router_password');
        const routerUseHttps = (await AppConfig.get('router_use_https')) !== 'false';

        if (!routerHost || !routerUsername || !routerPassword) {
          return res.status(400).json({ 
            error: 'Router not configured. Please configure in admin settings.' 
          });
        }

        const result = await routerServicePost('/dhcp-reservations', {
          host: routerHost,
          username: routerUsername,
          password: routerPassword,
          useHttps: routerUseHttps
        });

        res.json({ reservations: result.reservations || [] });
      } catch (error) {
        res.status(500).json({ error: error.message });
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
        const sortBy = req.query.sortBy || 'id';
        const sortOrder = req.query.sortOrder || 'asc';

        // Get managed servers from database
        console.log('📋 Fetching managed servers from database...');
        const result = await pool.query(
          'SELECT * FROM managed_servers ORDER BY id'
        );
        
        let servers = result.rows.map(row => ({
          id: row.id,
          vmid: row.vmid,
          name: row.server_name,
          creator_id: row.creator_id,
          is_owned_by_user: row.creator_id === req.user.userId,
          seed: row.seed,
          created_at: row.created_at
        }));
        
        console.log(`✓ Found ${servers.length} managed servers`);
        
        // Apply filters
        let filteredServers = servers;

        // Search filter (by name)
        if (search) {
          filteredServers = filteredServers.filter(server =>
            server.name.toLowerCase().includes(search.toLowerCase())
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

    // Get available servers from Proxmox (for adding to managed list) - protected
    app.get('/api/proxmox/available-servers', verifyToken, async (req, res) => {
      try {
        console.log('📋 Request to fetch available servers from Proxmox...');
        
        // Check if user is admin
        if (req.user.role !== 'admin') {
          console.log('❌ Non-admin user attempted to access available servers');
          return res.status(403).json({ error: 'Only admins can view available servers' });
        }

        console.log('✓ Admin check passed');

        // Load Proxmox config from database
        console.log('📋 Loading Proxmox config from database...');
        const proxmoxHost = await AppConfig.get('proxmox_host');
        const proxmoxUsername = await AppConfig.get('proxmox_username');
        const proxmoxPassword = await AppConfig.get('proxmox_password');
        const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';

        console.log(`📋 Proxmox config loaded: host=${proxmoxHost}, user=${proxmoxUsername}, realm=${proxmoxRealm}`);

        if (!proxmoxHost || !proxmoxUsername || !proxmoxPassword) {
          console.log('❌ Proxmox not configured properly');
          return res.status(400).json({ 
            error: 'Proxmox not configured',
            message: 'Please configure Proxmox credentials in Admin Settings → Configuration'
          });
        }

        // Get all servers from Proxmox (not just minecraft-named ones)
        const currentProxmox = new ProxmoxClient({
          host: proxmoxHost,
          username: proxmoxUsername,
          password: proxmoxPassword,
          realm: proxmoxRealm
        });

        console.log('📋 Fetching all available servers from Proxmox...');
        let allServers = [];

        try {
          if (!currentProxmox.token) {
            console.log('🔐 Authenticating with Proxmox...');
            await currentProxmox.authenticate();
            console.log('✓ Authenticated successfully');
          }

          const response = await currentProxmox.api.get('/nodes');
          const nodes = response.data.data;
          console.log(`✓ Found ${nodes.length} Proxmox nodes`);

          for (const node of nodes) {
            console.log(`📋 Fetching VMs and containers from node: ${node.node}`);
            // Get QEMU VMs
            const vmsResponse = await currentProxmox.api.get(`/nodes/${node.node}/qemu`);
            const vms = vmsResponse.data.data || [];
            console.log(`  ✓ Found ${vms.length} QEMU VMs`);
            allServers.push(...vms.map(vm => ({
              vmid: vm.vmid,
              name: vm.name,
              type: 'qemu',
              node: node.node,
              status: vm.status
            })));

            // Get LXC containers
            const lxcResponse = await currentProxmox.api.get(`/nodes/${node.node}/lxc`);
            const lxcs = lxcResponse.data.data || [];
            console.log(`  ✓ Found ${lxcs.length} LXC containers`);
            allServers.push(...lxcs.map(lxc => ({
              vmid: lxc.vmid,
              name: lxc.hostname || lxc.name,
              type: 'lxc',
              node: node.node,
              status: lxc.status
            })));
          }
        } catch (error) {
          console.error('❌ Error fetching from Proxmox:', error);
          return res.status(500).json({ 
            error: 'Failed to fetch servers from Proxmox',
            message: error.message 
          });
        }

        // Get already managed server IDs
        console.log('📋 Checking already managed servers...');
        const managedResult = await pool.query('SELECT vmid FROM managed_servers');
        const managedVmids = new Set(managedResult.rows.map(r => r.vmid));

        // Filter out already managed servers
        const availableServers = allServers.filter(s => !managedVmids.has(s.vmid));

        console.log(`✓ Found ${availableServers.length} available servers (${allServers.length} total, ${managedVmids.size} already managed)`);
        res.json({ servers: availableServers });
      } catch (error) {
        console.error('❌ Error fetching available servers:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({ error: error.message || 'Internal server error' });
      }
    });

    // Get clone options (nodes and storage) - protected
    app.get('/api/clone-options', verifyToken, async (req, res) => {
      try {
        // Load Proxmox config from database
        const proxmoxHost = await AppConfig.get('proxmox_host');
        const proxmoxUsername = await AppConfig.get('proxmox_username');
        const proxmoxPassword = await AppConfig.get('proxmox_password');
        const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';

        if (!proxmoxHost || !proxmoxUsername || !proxmoxPassword) {
          return res.status(400).json({
            error: 'Proxmox not configured'
          });
        }

        // Create Proxmox client with database config
        const cloneProxmox = new ProxmoxClient({
          host: proxmoxHost,
          username: proxmoxUsername,
          password: proxmoxPassword,
          realm: proxmoxRealm
        });

        // Get nodes
        const nodes = await cloneProxmox.getNodes();
        
        // Get storage
        const storage = await cloneProxmox.getStorage();

        const result = { 
          nodes: nodes
            .map(n => ({ id: n.node, name: n.node }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          storage: storage
            .map(s => {
              const available = s.avail || s.available || 0;
              const used = s.used || 0;
              const total = s.size || s.maxfiles || (available + used) || 1;
              return {
                id: s.storage, 
                name: s.storage,
                type: s.type,
                available: Math.max(0, available), // Ensure non-negative
                used: Math.max(0, used),
                size: Math.max(0, total)
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name))
        };
        
        console.log(`✅ Sending ${result.storage.length} storage options to client`);
        result.storage.forEach(st => {
          const gb = Math.round(st.available / (1024 * 1024 * 1024));
          console.log(`   ${st.name} (${st.type}): ${gb} GB available`);
        });
        
        res.json(result);
      } catch (error) {
        console.error('❌ Error fetching clone options:', error);
        res.status(500).json({ error: error.message || 'Failed to fetch clone options' });
      }
    });

    // Add a server to managed list - protected (admin only)
    app.post('/api/servers', verifyToken, async (req, res) => {
      try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Only admins can add servers' });
        }

        const { vmid, serverName } = req.body;
        
        if (!vmid || !serverName) {
          return res.status(400).json({ 
            error: 'Missing required fields: vmid, serverName' 
          });
        }

        // Check if already managed
        const existing = await pool.query(
          'SELECT id FROM managed_servers WHERE vmid = $1',
          [vmid]
        );

        if (existing.rows.length > 0) {
          return res.status(400).json({ 
            error: 'Server already in managed list' 
          });
        }

        // Add to managed servers
        const result = await pool.query(
          'INSERT INTO managed_servers (vmid, creator_id, server_name) VALUES ($1, $2, $3) RETURNING *',
          [vmid, req.user.userId, serverName]
        );

        console.log(`✓ Added server ${vmid} (${serverName}) to managed list`);
        res.status(201).json({
          id: result.rows[0].id,
          vmid: result.rows[0].vmid,
          name: result.rows[0].server_name,
          message: 'Server added to managed list'
        });
      } catch (error) {
        console.error('❌ Error adding server:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Remove a server from managed list - protected (admin only)
    app.delete('/api/servers/:id', verifyToken, async (req, res) => {
      try {
        // Check if user is admin
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Only admins can remove servers' });
        }

        const serverId = req.params.id;

        // Get server info first
        const serverResult = await pool.query(
          'SELECT vmid, server_name FROM managed_servers WHERE id = $1',
          [serverId]
        );

        if (serverResult.rows.length === 0) {
          return res.status(404).json({ error: 'Server not found' });
        }

        const { vmid, server_name } = serverResult.rows[0];

        // Delete from managed servers
        await pool.query(
          'DELETE FROM managed_servers WHERE id = $1',
          [serverId]
        );

        console.log(`✓ Removed server ${vmid} (${server_name}) from managed list`);
        res.json({ message: 'Server removed from managed list' });
      } catch (error) {
        console.error('❌ Error removing server:', error);
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
    app.get('/api/servers/clone-progress/:requestId', verifyToken, async (req, res) => {
      try {
        const { requestId } = req.params;
        const progress = liveCloneProgress.get(requestId);

        if (!progress) {
          return res.status(404).json({ error: 'Progress not found' });
        }

        if (req.user.role !== 'admin' && progress.userId !== req.user.userId) {
          return res.status(403).json({ error: 'Permission denied' });
        }

        res.json(progress);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post('/api/servers/clone', verifyToken, async (req, res) => {
      try {
        // Check permissions
        if (!canCloneServer(req.user)) {
          return res.status(403).json({ error: 'You do not have permission to clone servers' });
        }

        const { sourceVmId, newVmId, domainName, seed, targetNode, targetStorage, clientRequestId } = req.body;
        
        // newVmId is now optional - Proxmox will auto-assign if not provided
        if (!sourceVmId || !domainName) {
          return res.status(400).json({ 
            error: 'Missing required fields: sourceVmId, domainName' 
          });
        }

        // Enforce clone limit per user
        const maxClonesPerUser = 5;
        const existingServers = await ManagedServer.getByCreator(req.user.userId);
        if (existingServers.length >= maxClonesPerUser) {
          return res.status(400).json({
            error: `Clone limit reached. Max ${maxClonesPerUser} managed servers per user.`
          });
        }

        setLiveCloneProgress(clientRequestId, {
          userId: req.user.userId,
          status: 'in-progress',
          currentStep: 'initializing',
          progressPercent: 1,
          message: 'Clone request accepted'
        });

        const localIp = process.env.VELOCITY_BACKEND_NETWORK || '192.168.1';

        // Load Proxmox config from database
        const proxmoxHost = await AppConfig.get('proxmox_host');
        const proxmoxUsername = await AppConfig.get('proxmox_username');
        const proxmoxPassword = await AppConfig.get('proxmox_password');
        const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';

        console.log(`📋 Clone: Proxmox config - host=${proxmoxHost}, user=${proxmoxUsername}, realm=${proxmoxRealm}, password=${proxmoxPassword ? '***SET***' : 'NOT SET'}`);

        if (!proxmoxHost || !proxmoxUsername || !proxmoxPassword) {
          return res.status(400).json({
            error: 'Proxmox not configured. Configure Proxmox credentials in Admin Settings → Configuration.'
          });
        }

        // Create Proxmox client with database config
        const cloneProxmox = new ProxmoxClient({
          host: proxmoxHost,
          username: proxmoxUsername,
          password: proxmoxPassword,
          realm: proxmoxRealm
        });

        console.log(`🔄 Attempting to clone VM ${sourceVmId} to ${domainName}...`);

        let targetIp = null;
        let routerHost = null;
        let routerUsername = null;
        let routerPassword = null;
        let routerUseHttps = true;

        if (dhcpEnabled) {
          // Router config is required for IP reservation
          routerHost = await AppConfig.get('router_host');
          routerUsername = await AppConfig.get('router_username');
          routerPassword = await AppConfig.get('router_password');
          routerUseHttps = (await AppConfig.get('router_use_https')) !== 'false';

          if (!routerHost || !routerUsername || !routerPassword) {
            return res.status(400).json({
              error: 'Router not configured. Configure ASUS router before cloning.'
            });
          }

          // Pick an available IP from 192.168.1.225-230 (or configured network prefix)
          const reservationsResult = await routerServicePost('/dhcp-reservations', {
            host: routerHost,
            username: routerUsername,
            password: routerPassword,
            useHttps: routerUseHttps
          });

          // SAFETY CHECK: Verify we got a valid result from router service
          if (reservationsResult.error) {
            console.error(`❌ Router service error getting reservations: ${reservationsResult.error}`);
            return res.status(500).json({
              error: `Failed to get current DHCP reservations from router: ${reservationsResult.error}. Cannot safely proceed with clone.`
            });
          }

          const reservations = reservationsResult.reservations || [];
          
          // LOG: How many reservations we found
          console.log(`📊 Current DHCP reservations: ${reservations.length}`);
          if (reservations.length > 0) {
            console.log(`   Found IPs: ${reservations.map(r => r.ip).join(', ')}`);
          } else {
            console.log(`   ⚠️  WARNING: No existing DHCP reservations found on router`);
          }
          
          const usedIps = new Set(reservations.map(r => r.ip));
          const ipRangeStart = 225;
          const ipRangeEnd = 230;

          for (let i = ipRangeStart; i <= ipRangeEnd; i += 1) {
            const candidate = `${localIp}.${i}`;
            if (!usedIps.has(candidate)) {
              targetIp = candidate;
              break;
            }
          }

          if (!targetIp) {
            return res.status(400).json({
              error: `No available IPs in ${localIp}.${ipRangeStart}-${ipRangeEnd}.`
            });
          }
        } else {
          console.log('⚠️  DHCP is disabled. Skipping router integration and IP reservation.');
        }

        // Generate random seed if not provided or if explicitly requested
        let serverSeed = seed;
        if (!seed || seed === 'random') {
          serverSeed = Math.floor(Math.random() * 9223372036854775807).toString();
        }

        // Use domain name as the VM name
        const newVmName = domainName;
        console.log(`📍 Clone parameters - targetNode: ${targetNode}, targetStorage: ${targetStorage}`);
        const result = await cloneProxmox.cloneServer(sourceVmId, newVmId, newVmName, targetNode, targetStorage);
        setLiveCloneProgress(clientRequestId, {
          userId: req.user.userId,
          status: 'in-progress',
          currentStep: 'clone_requested',
          progressPercent: 2,
          message: 'Clone task requested in Proxmox'
        });
        
        // Extract the actual assigned VM ID from the result
        // If newVmId was provided, use it; otherwise Proxmox assigned one
        const assignedVmId = newVmId || result.newid || result.vmid;
        
        if (!assignedVmId) {
          console.warn('⚠️  Could not determine assigned VM ID from clone result:', result);
        }

        // Wait for clone task to complete using the UPID
        if (result.upid) {
          console.log(`⏳ Waiting for clone task to complete (UPID: ${result.upid})...`);
          try {
            function extractNodeFromUpid(upid) {
              // UPID format: UPID:node:pid:starttime:type:ID:user
              const parts = upid.split(':');
              return parts[1] || 'proxmox1'; // Default to first node if parsing fails
            }

            function extractProgressFromTaskLog(logEntries) {
              if (!Array.isArray(logEntries) || logEntries.length === 0) {
                return null;
              }

              let maxPercent = null;
              for (const entry of logEntries) {
                const line = entry?.t || entry?.msg || entry?.line || '';
                if (!line) {
                  continue;
                }

                const matches = line.match(/(\d{1,3}(?:\.\d+)?)%/g);
                if (!matches) {
                  continue;
                }

                for (const match of matches) {
                  const numeric = parseFloat(match.replace('%', ''));
                  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
                    const rounded = Math.round(numeric);
                    maxPercent = maxPercent === null ? rounded : Math.max(maxPercent, rounded);
                  }
                }
              }

              return maxPercent;
            }

            const node = extractNodeFromUpid(result.upid);
            const encodedUpid = encodeURIComponent(result.upid);
            let cloneTaskComplete = false;
            let waitAttempts = 0;
            const pollIntervalMs = 2000; // 2-second checks
            const maxWaitMs = 20 * 60 * 1000; // 20 minutes total wait for large full clones
            const maxWaitAttempts = Math.ceil(maxWaitMs / pollIntervalMs);
            let lastKnownPercent = 2;

            while (!cloneTaskComplete && waitAttempts < maxWaitAttempts) {
              try {
                // Query task status from Proxmox
                const taskResponse = await cloneProxmox.api.get(`/nodes/${node}/tasks/${encodedUpid}/status`);
                const taskStatus = taskResponse.data.data;

                // Extract progress if available (ranges from 0 to 1)
                let progressPercent = taskStatus.pct !== undefined
                  ? Math.round(taskStatus.pct * 100)
                  : null;

                // Some Proxmox endpoints do not return pct for clone tasks; parse from task log as fallback.
                if (progressPercent === null) {
                  try {
                    const taskLogResponse = await cloneProxmox.api.get(`/nodes/${node}/tasks/${encodedUpid}/log`);
                    const parsedPercent = extractProgressFromTaskLog(taskLogResponse.data?.data);
                    if (parsedPercent !== null) {
                      progressPercent = parsedPercent;
                    }
                  } catch (logError) {
                    // Non-fatal fallback; we'll continue with no percentage for this poll cycle.
                  }
                }

                if (progressPercent !== null) {
                  progressPercent = Math.max(lastKnownPercent, progressPercent);
                  lastKnownPercent = progressPercent;
                }

                if (taskStatus.status === 'stopped') {
                  if (taskStatus.exitstatus === 'OK') {
                    console.log(`✅ Clone task completed successfully!`);
                    await CloneStatus.updateStep(assignedVmId, 'cloning', 100);
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'in-progress',
                      currentStep: 'clone_completed',
                      progressPercent: 100,
                      message: 'Clone task completed'
                    });
                    cloneTaskComplete = true;
                  } else {
                    console.warn(`⚠️  Clone task ended with status: ${taskStatus.exitstatus}`);
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'failed',
                      currentStep: 'cloning',
                      progressPercent: progressPercent ?? 0,
                      message: `Clone task ended with status: ${taskStatus.exitstatus}`
                    });
                    cloneTaskComplete = true;
                  }
                } else {
                  // Update progress in database
                  if (progressPercent !== null) {
                    await CloneStatus.updateStep(assignedVmId, 'cloning', progressPercent);
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'in-progress',
                      currentStep: 'cloning',
                      progressPercent,
                      message: `Cloning in progress: ${progressPercent}%`
                    });
                    console.log(`⏳ Clone in progress... ${progressPercent}% (attempt ${waitAttempts + 1}/${maxWaitAttempts})`);
                  } else {
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'in-progress',
                      currentStep: 'cloning',
                      progressPercent: lastKnownPercent,
                      message: `Cloning in progress (attempt ${waitAttempts + 1})`
                    });
                    console.log(`⏳ Clone in progress... (attempt ${waitAttempts + 1}/${maxWaitAttempts})`);
                  }
                  await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                }
              } catch (taskError) {
                // If we can't query the task, assume it's still running
                console.log(`⏳ Checking clone status... (attempt ${waitAttempts + 1}/${maxWaitAttempts})`);
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
              }
              waitAttempts++;
            }

            if (!cloneTaskComplete) {
              const waitedMinutes = Math.round((maxWaitAttempts * pollIntervalMs) / 60000);
              console.warn(`⚠️  Clone task did not complete within ${waitedMinutes} minutes. Aborting workflow to avoid acting on a partially cloned VM.`);
              setLiveCloneProgress(clientRequestId, {
                userId: req.user.userId,
                status: 'failed',
                currentStep: 'cloning',
                progressPercent: lastKnownPercent,
                message: `Clone did not complete within ${waitedMinutes} minutes. Please retry.`
              });
              return res.status(504).json({
                error: `Clone task did not complete within ${waitedMinutes} minutes. VM is likely still cloning in Proxmox.`,
                vmid: assignedVmId,
                canRetry: true
              });
            }
          } catch (waitError) {
            console.warn(`⚠️  Could not wait for clone task, proceeding anyway: ${waitError.message}`);
          }
        }
        
        // Log the action and track as managed server with seed
        await ServerCloneLog.create(req.user.userId, sourceVmId, assignedVmId, newVmName, 'pending');
        await ManagedServer.create(assignedVmId, req.user.userId, newVmName, serverSeed);
        
        // Create clone status tracker
        const cloneStatus = await CloneStatus.create(assignedVmId, req.user.userId, domainName, sourceVmId);
        await CloneStatus.updateStep(assignedVmId, 'vm_cloned');

        // Copy SSH configuration from source to destination
        // This allows us to immediately configure the world without manual SSH setup
        const sshConfigCopied = await ManagedServer.copySSHConfig(
          sourceVmId,
          assignedVmId,
          null,
          targetIp
        );

        // Create DHCP reservation in ASUS router (required)
        let dhcpReservationResult = null;
        try {
          await CloneStatus.updateStep(assignedVmId, 'dhcp_reservation');
          
          if (!assignedVmId) {
            await CloneStatus.markPaused(assignedVmId, 'Could not determine assigned VM ID', 'dhcp_reservation');
            return res.status(500).json({
              error: 'Could not determine assigned VM ID for DHCP reservation.',
              vmid: assignedVmId,
              canRetry: true
            });
          }

          if (!dhcpEnabled) {
            console.log('⚠️  DHCP is disabled. Skipping DHCP reservation step.');
            dhcpReservationResult = { success: false, skipped: true };
            await CloneStatus.completeStep(assignedVmId, 'dhcp_reserved');
          } else {
            console.log(`🌐 Creating DHCP reservation for VM ${assignedVmId}...`);

            // Get VM's MAC address from Proxmox with retry (VM network config may take a few seconds)
            let networkConfig = null;
            let retryCount = 0;
            const maxRetries = 10; // 10 attempts × 3 seconds = 30 seconds (clone is already complete)
            
            while (retryCount < maxRetries) {
              try {
                networkConfig = await cloneProxmox.getVMNetworkConfig(assignedVmId);
                if (networkConfig.primaryMac) {
                  break; // MAC found, exit retry loop
                }
              } catch (err) {
                console.warn(`⚠️  Attempt ${retryCount + 1}: Could not get MAC, retrying...`);
              }
              
              retryCount++;
              if (retryCount < maxRetries) {
                // Wait 3 seconds before retry
                console.log(`⏳ Waiting 3 seconds before retry (${retryCount}/${maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
            }
            
            if (networkConfig?.primaryMac) {
              const macAddress = networkConfig.primaryMac;

              console.log(`   MAC: ${macAddress}`);
              console.log(`   Target IP: ${targetIp}`);

              dhcpReservationResult = await routerServicePost('/dhcp-reservation', {
                host: routerHost,
                username: routerUsername,
                password: routerPassword,
                useHttps: routerUseHttps,
                mac: macAddress,
                ip: targetIp,
                name: domainName
              });

              if (dhcpReservationResult.success) {
                console.log(`✅ DHCP reservation created: ${macAddress} → ${targetIp}`);
                await CloneStatus.completeStep(assignedVmId, 'dhcp_reserved', { ipAddress: targetIp, macAddress });
              } else {
                await CloneStatus.markPaused(assignedVmId, 'Failed to create DHCP reservation', 'dhcp_reservation');
                return res.status(500).json({
                  error: 'Failed to create DHCP reservation on router.',
                  vmid: assignedVmId,
                  canRetry: true
                });
              }
            } else {
              await CloneStatus.markPaused(assignedVmId, `Could not get MAC address after ${maxRetries} attempts`, 'dhcp_reservation');
              return res.status(500).json({
                error: `Could not get MAC address for VM ${assignedVmId} after ${maxRetries} attempts (${maxRetries * 3} seconds). The network config may be delayed.`,
                vmId: assignedVmId,
                vmid: assignedVmId,
                canRetry: true
              });
            }
          }
        } catch (routerError) {
          console.error(`⚠️  Failed to create DHCP reservation:`, routerError.message);
          await CloneStatus.markPaused(assignedVmId, routerError.message, 'dhcp_reservation');
          return res.status(500).json({
            error: `Failed to create DHCP reservation: ${routerError.message}`,
            vmid: assignedVmId,
            canRetry: true
          });
        }

        // Start the newly cloned VM
        // Note: VM config file takes a moment to be written after clone/migration
        console.log(`🚀 Starting VM ${assignedVmId}...`);
        
        // Wait for VM to be ready by checking its status
        let vmReady = false;
        let waitAttempts = 0;
        const maxWaitAttempts = 10; // ~10 seconds total (1 second per attempt)
        
        while (!vmReady && waitAttempts < maxWaitAttempts) {
          try {
            // Check VM status directly - this will fail if config doesn't exist
            const vmDetails = await cloneProxmox.getServerDetails(assignedVmId);
            
            if (vmDetails && vmDetails.status) {
              vmReady = true;
              console.log(`✅ VM config confirmed (status: ${vmDetails.status.status || 'unknown'}) after ${waitAttempts} second(s)`);
            } else {
              waitAttempts++;
              if (waitAttempts < maxWaitAttempts) {
                console.log(`⏳ Waiting for VM status... (${waitAttempts}/${maxWaitAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          } catch (checkErr) {
            // VM not ready yet (config file doesn't exist or other issue)
            waitAttempts++;
            if (waitAttempts < maxWaitAttempts) {
              console.log(`⏳ VM config not ready yet, retrying... (${waitAttempts}/${maxWaitAttempts}): ${checkErr.message}`);
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        if (!vmReady) {
          console.warn(`⚠️  VM status not confirmed after ${maxWaitAttempts} seconds. Proceeding anyway...`);
        }
        
        // If targetNode was specified, migrate the cloned VM to that node BEFORE starting
        if (targetNode) {
          try {
            console.log(`🔄 Preparing to migrate VM ${assignedVmId} to node ${targetNode}...`);
            
            // Wait for VM lock to be released (clone operations lock the VM)
            let lockCleared = false;
            let lockAttempts = 0;
            const maxLockAttempts = 30; // 30 seconds to wait for lock
            
            while (!lockCleared && lockAttempts < maxLockAttempts) {
              try {
                const vmDetails = await cloneProxmox.getServerDetails(assignedVmId);
                const isLocked = vmDetails.status.lock;
                
                if (!isLocked) {
                  lockCleared = true;
                  console.log(`✅ VM lock cleared after ${lockAttempts} second(s)`);
                } else {
                  lockAttempts++;
                  if (lockAttempts < maxLockAttempts) {
                    console.log(`⏳ VM is locked (${isLocked}), waiting... (${lockAttempts}/${maxLockAttempts})`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  }
                }
              } catch (err) {
                lockAttempts++;
                if (lockAttempts < maxLockAttempts) {
                  console.log(`⏳ Checking VM lock... (${lockAttempts}/${maxLockAttempts})`);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }
            
            if (!lockCleared) {
              console.warn(`⚠️  VM lock did not clear after ${maxLockAttempts} seconds, attempting migration anyway...`);
            }
            
            // Now attempt migration
            const sourceVmDetails = await cloneProxmox.getServerDetails(assignedVmId);
            const currentNode = sourceVmDetails.node;
            
            if (targetNode !== currentNode) {
              console.log(`📍 Current node: ${currentNode}, Target node: ${targetNode}`);
              console.log(`🚀 Migrating VM ${assignedVmId} from ${currentNode} to ${targetNode}...`);
              
              const migrationResult = await cloneProxmox.migrateServer(assignedVmId, targetNode);
              console.log(`✓ Migration initiated with UPID: ${migrationResult.upid}`);
              
              // Wait for migration to complete before starting
              console.log(`⏳ Waiting for migration to complete...`);
              const migrationSuccess = await cloneProxmox.waitForTask(migrationResult.upid, 300);
              
              if (migrationSuccess) {
                console.log(`✅ VM ${assignedVmId} successfully migrated to ${targetNode}`);
              } else {
                console.warn(`⚠️  Migration task completed with warnings or timed out`);
              }
            } else {
              console.log(`ℹ️  VM already on target node ${targetNode}, no migration needed`);
            }
          } catch (migrationError) {
            console.warn(`⚠️  Migration failed: ${migrationError.message}`);
            console.warn(`⚠️  VM will remain on current node. Starting VM anyway...`);
            // Don't fail the entire clone operation if migration fails
            // The VM was cloned successfully, just not on the target node
          }
        }
        
        try {
          const startUpid = await cloneProxmox.startServer(assignedVmId);
          console.log(`✅ VM ${assignedVmId} starting with task: ${startUpid}`);
          
          // Wait for the start task to complete
          console.log(`⏳ Waiting for VM start task to complete...`);
          const startSuccess = await cloneProxmox.waitForTask(startUpid, 120);
          
          if (!startSuccess) {
            throw new Error('VM start task failed or timed out');
          }
          
          console.log(`✅ VM ${assignedVmId} started successfully`);
          
          // Wait additional time for SSH to be ready
          console.log(`⏳ Waiting for SSH to be ready (45 seconds)...`);
          await new Promise(resolve => setTimeout(resolve, 45000));
        } catch (startError) {
          console.warn(`⚠️  Failed to start VM (non-fatal): ${startError.message}`);
          // Don't fail the entire operation if start fails, but it will affect world setup
        }

        // Set up fresh world with the new seed
        // This will delete old world data and configure server.properties
        let worldSetupResult = null;
        if (sshConfigCopied && assignedVmId) {
          try {
            console.log(`🌍 Configuring fresh world for VM ${assignedVmId} with seed ${serverSeed}...`);
            
            // Get SSH client and manager
            const sshConfig = await ManagedServer.getSSHConfig(assignedVmId);
            if (sshConfig && sshConfig.ssh_configured) {
              // Retry SSH connection up to 5 times with increasing delays
              let sshConnected = false;
              let retryCount = 0;
              const maxRetries = 5;
              
              while (!sshConnected && retryCount < maxRetries) {
                try {
                  const ssh = new SSHClient({
                    host: sshConfig.ssh_host,
                    port: sshConfig.ssh_port,
                    username: sshConfig.ssh_username,
                    privateKey: sshConfig.ssh_private_key
                  });

                  const manager = new MinecraftServerManager(
                    ssh,
                    sshConfig.minecraft_path,
                    sshConfig.minecraft_user || 'minecraft'
                  );

                  worldSetupResult = await manager.setupFreshWorld(serverSeed);
                  sshConnected = true;
                  
                  if (worldSetupResult.success) {
                    console.log(`✅ World setup successful for VM ${assignedVmId}`);
                  } else {
                    console.warn(`⚠️  World setup had issues: ${worldSetupResult.message}`);
                  }
                } catch (sshError) {
                  retryCount++;
                  if (retryCount < maxRetries) {
                    const waitTime = retryCount * 10; // 10, 20, 30, 40 seconds
                    console.log(`⏳ SSH not ready (attempt ${retryCount}/${maxRetries}), waiting ${waitTime}s before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
                  } else {
                    throw sshError;
                  }
                }
              }
            }
          } catch (worldError) {
            console.error(`⚠️  Failed to setup fresh world after SSH retries:`, worldError.message);
            // Don't fail the entire clone operation if world setup fails
            // User can always manually configure later
          }
        } else {
          console.log(`⚠️  SSH config not available for VM ${assignedVmId}, skipping automatic world setup`);
          console.log(`   User will need to manually configure SSH and world settings`);
        }

        // Try to add to Velocity server list (optional - won't fail clone if it fails)
        // Note: This assumes the new server IP will be on the Proxmox local network
        // You may need to adjust the IP or add additional configuration
        let velocityResult = null;
        if (velocity.isConfigured() && assignedVmId && targetIp) {
          const serverIp = targetIp;
          
          console.log(`🎮 Adding to Velocity: ${domainName} → ${serverIp}:25565`);
          
          velocityResult = await velocity.addServer(
            domainName,
            serverIp,
            25565
          );
          
          if (velocityResult.success) {
            console.log(`✅ Added to Velocity proxy successfully`);
          } else {
            console.warn(`⚠️  Could not fully configure velocity, but VM clone succeeded: ${velocityResult.message}`);
          }
        } else if (velocity.isConfigured() && assignedVmId && !targetIp) {
          console.log('⚠️  Skipping Velocity registration because DHCP is disabled and no target IP is available.');
        }

        // Mark clone as completed
        await CloneStatus.markComplete(assignedVmId);

        setLiveCloneProgress(clientRequestId, {
          userId: req.user.userId,
          status: 'completed',
          currentStep: 'completed',
          progressPercent: 100,
          message: 'Clone completed successfully',
          vmid: assignedVmId
        });
        clearLiveCloneProgressLater(clientRequestId);

        res.json({ 
          success: true, 
          taskId: result, 
          vmid: assignedVmId, 
          domainName, 
          seed: serverSeed,
          worldSetup: worldSetupResult ? worldSetupResult.success : false,
          dhcpReservation: dhcpReservationResult ? dhcpReservationResult.success : false,
          velocityAdded: velocityResult ? velocityResult.success : false,
          ipAddress: dhcpReservationResult?.ip || null,
          macAddress: dhcpReservationResult?.mac || null
        });
      } catch (error) {
        console.error(`❌ Clone failed:`, error);
        console.error(`Error details:`, error.response?.data || error.message);
        const { clientRequestId } = req.body || {};
        setLiveCloneProgress(clientRequestId, {
          userId: req.user?.userId,
          status: 'failed',
          currentStep: 'failed',
          progressPercent: 0,
          message: error.message || 'Clone failed'
        });
        clearLiveCloneProgressLater(clientRequestId);
        
        // Try to mark the clone as failed (if we have a VM ID context)
        try {
          const vmidFromError = error.vmid || error.assignedVmId;
          if (vmidFromError) {
            await CloneStatus.markFailed(vmidFromError, error.message, 'unknown_step');
          }
        } catch (statusUpdateError) {
          console.warn('Could not update clone status:', statusUpdateError.message);
        }
        
        res.status(500).json({ 
          error: error.message,
          details: error.response?.data?.errors || error.response?.statusText || 'See server logs for details'
        });
      }
    });

    // Get clone status (protected)
    app.get('/api/servers/:vmid/clone-status', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const status = await CloneStatus.getByVmId(vmid);
        
        if (!status) {
          return res.status(404).json({ error: 'Clone status not found for VM' });
        }

        // Check permissions - user can only see their own, admin sees all
        if (req.user.role !== 'admin' && status.creator_id !== req.user.userId) {
          return res.status(403).json({ error: 'Permission denied' });
        }

        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Resume a paused clone (protected)
    app.post('/api/servers/:vmid/clone-resume', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const cloneStatus = await CloneStatus.getByVmId(vmid);
        
        if (!cloneStatus) {
          return res.status(404).json({ error: 'Clone status not found' });
        }

        // Check permissions
        if (req.user.role !== 'admin' && cloneStatus.creator_id !== req.user.userId) {
          return res.status(403).json({ error: 'Permission denied' });
        }

        if (cloneStatus.status !== 'paused' && cloneStatus.status !== 'failed') {
          return res.status(400).json({ 
            error: `Clone is ${cloneStatus.status}, cannot resume. Only paused or failed clones can be resumed.` 
          });
        }

        // Get the managed server info
        const server = await ManagedServer.getServer(vmid);
        if (!server) {
          return res.status(404).json({ error: 'Server record not found' });
        }

        // Determine what step to retry based on what failed
        console.log(`🔄 Resuming clone for VM ${vmid}, current step was: ${cloneStatus.error_step}`);

        // Retry the failed step
        const failedStep = cloneStatus.error_step;
        let result = { success: false };

        try {
          if (failedStep === 'dhcp_reservation' || !cloneStatus.dhcp_reserved) {
            // Load config
            const proxmoxHost = await AppConfig.get('proxmox_host');
            const proxmoxUsername = await AppConfig.get('proxmox_username');
            const proxmoxPassword = await AppConfig.get('proxmox_password');
            const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';
            const routerHost = await AppConfig.get('router_host');
            const routerUsername = await AppConfig.get('router_username');
            const routerPassword = await AppConfig.get('router_password');
            const routerUseHttps = (await AppConfig.get('router_use_https')) !== 'false';

            if (!routerHost) {
              return res.status(400).json({ error: 'Router not configured for DHCP retry' });
            }

            const currentProxmox = new ProxmoxClient({
              host: proxmoxHost,
              username: proxmoxUsername,
              password: proxmoxPassword,
              realm: proxmoxRealm
            });

            // Get MAC address and create reservation
            try {
              const networkConfig = await currentProxmox.getVMNetworkConfig(vmid);
              if (networkConfig.primaryMac) {
                const macAddress = networkConfig.primaryMac;
                const targetIp = cloneStatus.ip_address;

                console.log(`🔄 Retrying DHCP reservation: ${macAddress} → ${targetIp}`);

                result = await routerServicePost('/dhcp-reservation', {
                  host: routerHost,
                  username: routerUsername,
                  password: routerPassword,
                  useHttps: routerUseHttps,
                  mac: macAddress,
                  ip: targetIp,
                  name: cloneStatus.domain_name
                });

                if (result.success) {
                  await CloneStatus.completeStep(vmid, 'dhcp_reserved', { ipAddress: targetIp, macAddress });
                  console.log(`✅ DHCP reservation retry successful`);
                } else {
                  throw new Error('DHCP reservation failed');
                }
              } else {
                throw new Error('Could not get MAC address');
              }
            } catch (retryError) {
              return res.status(500).json({ 
                error: `Failed to retry DHCP reservation: ${retryError.message}` 
              });
            }
          }

          // Mark as resumed/completed if retry was successful
          await CloneStatus.resume(vmid);
          res.json({ 
            success: true, 
            message: `Clone resumed for VM ${vmid}`,
            status: 'resumed' 
          });
        } catch (resumeError) {
          return res.status(500).json({ error: resumeError.message });
        }
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

    // Retry MAC address lookup for an already-cloned VM
    app.post('/api/servers/:vmid/retry-mac-lookup', verifyToken, async (req, res) => {
      try {
        if (!dhcpEnabled) {
          return res.status(503).json({ error: 'DHCP functionality is disabled on the server.' });
        }

        const vmid = parseInt(req.params.vmid);
        const { targetIp } = req.body;

        if (!targetIp) {
          return res.status(400).json({
            error: 'targetIp is required'
          });
        }

        // Load Proxmox config for MAC lookup
        const proxmoxHost = await AppConfig.get('proxmox_host');
        const proxmoxUsername = await AppConfig.get('proxmox_username');
        const proxmoxPassword = await AppConfig.get('proxmox_password');
        const proxmoxRealm = await AppConfig.get('proxmox_realm') || 'pam';

        if (!proxmoxHost || !proxmoxUsername || !proxmoxPassword) {
          return res.status(400).json({
            error: 'Proxmox not configured'
          });
        }

        const retryProxmox = new ProxmoxClient({
          host: proxmoxHost,
          username: proxmoxUsername,
          password: proxmoxPassword,
          realm: proxmoxRealm
        });

        console.log(`🔄 Retrying MAC lookup for VM ${vmid}...`);

        // Try to get MAC with retry
        let networkConfig = null;
        let retryCount = 0;
        const maxRetries = 10; // 10 attempts × 3 seconds = 30 seconds max wait

        while (retryCount < maxRetries) {
          try {
            networkConfig = await retryProxmox.getVMNetworkConfig(vmid);
            if (networkConfig.primaryMac) {
              break; // MAC found, exit retry loop
            }
          } catch (err) {
            console.warn(`⚠️  Attempt ${retryCount + 1}: Could not get MAC, retrying...`);
          }

          retryCount++;
          if (retryCount < maxRetries) {
            console.log(`⏳ Waiting 3 seconds before retry (${retryCount}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
          }
        }

        if (networkConfig?.primaryMac) {
          const macAddress = networkConfig.primaryMac;

          // Load router config for DHCP
          const routerHost = await AppConfig.get('router_host');
          const routerUsername = await AppConfig.get('router_username');
          const routerPassword = await AppConfig.get('router_password');
          const routerUseHttps = (await AppConfig.get('router_use_https')) === 'true';

          if (routerHost && routerUsername && routerPassword) {
            // Get domain name from database
            const serverInfo = await ManagedServer.get(vmid);
            const domainName = serverInfo?.name || `server-${vmid}`;

            console.log(`🌐 Retrying DHCP reservation...`);
            console.log(`   MAC: ${macAddress}`);
            console.log(`   Target IP: ${targetIp}`);

            const dhcpResult = await routerServicePost('/dhcp-reservation', {
              host: routerHost,
              username: routerUsername,
              password: routerPassword,
              useHttps: routerUseHttps,
              mac: macAddress,
              ip: targetIp,
              name: domainName
            });

            if (dhcpResult.success) {
              console.log(`✅ DHCP reservation created: ${macAddress} → ${targetIp}`);
              return res.json({
                success: true,
                macAddress: macAddress,
                ip: targetIp,
                message: 'MAC address retrieved and DHCP reservation created successfully'
              });
            } else {
              return res.status(500).json({
                error: 'Failed to create DHCP reservation on router',
                macAddress: macAddress
              });
            }
          } else {
            // Router not configured, but we got the MAC
            return res.json({
              success: true,
              macAddress: macAddress,
              ip: targetIp,
              message: 'MAC address retrieved (DHCP reservation skipped - router not configured)'
            });
          }
        } else {
          return res.status(500).json({
            error: `Could not get MAC address for VM ${vmid} after ${maxRetries} attempts (${maxRetries * 3} seconds). The VM may still be initializing.`,
            vmId: vmid,
            retryable: true
          });
        }
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

    // ============================================
    // MINECRAFT SERVER MANAGEMENT ROUTES
    // ============================================

    // Helper function to get SSH client for a server
    const getSSHClient = async (vmid) => {
      const sshConfig = await ManagedServer.getSSHConfig(vmid);
      if (!sshConfig || !sshConfig.ssh_configured) {
        throw new Error('SSH not configured for this server');
      }
      
      return new SSHClient({
        host: sshConfig.ssh_host,
        port: sshConfig.ssh_port,
        username: sshConfig.ssh_username,
        privateKey: sshConfig.ssh_private_key
      });
    };

    // Helper function to get Minecraft manager
    const getMinecraftManager = async (vmid) => {
      const ssh = await getSSHClient(vmid);
      const sshConfig = await ManagedServer.getSSHConfig(vmid);
      return new MinecraftServerManager(
        ssh, 
        sshConfig.minecraft_path,
        sshConfig.minecraft_user || 'minecraft'
      );
    };

    // Generate SSH keys on a Minecraft server (admin or creator only)
    app.post('/api/servers/:vmid/ssh-generate-keys', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can generate SSH keys' });
        }

        const { host, port, username, password } = req.body;
        
        if (!host || !username || !password) {
          return res.status(400).json({ 
            error: 'Missing required fields: host, username, password' 
          });
        }

        // Generate SSH keys on the remote server
        const { privateKey, publicKey } = await SSHClient.generateSSHKeys(
          host,
          port || 22,
          username,
          password
        );

        res.json({ 
          success: true, 
          privateKey,
          publicKey,
          message: 'SSH keys generated successfully'
        });
      } catch (error) {
        console.error('SSH key generation failed:', error);
        res.status(500).json({ error: `Failed to generate SSH keys: ${error.message}` });
      }
    });

    // Configure SSH for a server (admin or creator only)
    app.post('/api/servers/:vmid/ssh-config', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can configure SSH' });
        }

        const { host, port, username, privateKey, minecraftPath, minecraftUser } = req.body;
        
        if (!host || !username || !privateKey) {
          return res.status(400).json({ 
            error: 'Missing required fields: host, username, privateKey' 
          });
        }

        // Test SSH connection
        let testSSH;
        try {
          testSSH = new SSHClient({ host, port, username, privateKey });
          await testSSH.executeCommand('echo "SSH test successful"');
        } catch (error) {
          return res.status(400).json({ 
            error: `SSH connection test failed: ${error.message}` 
          });
        }

        // Auto-detect Minecraft path if not provided
        let finalMinecraftPath = minecraftPath;
        let finalMinecraftUser = minecraftUser || 'minecraft';
        
        if (!minecraftPath) {
          console.log('🔍 Auto-detecting Minecraft path...');
          const commonPaths = [
            '/opt/minecraft/paper',
            '/opt/minecraft',
            '/home/minecraft',
            '/home/minecraft/paper',
            '/srv/minecraft',
            '/srv/minecraft/paper'
          ];

          for (const path of commonPaths) {
            try {
              const checkCmd = `test -d "${path}/plugins" && echo "FOUND" || echo "NOT_FOUND"`;
              const result = await testSSH.executeCommand(checkCmd);
              if (result.includes('FOUND')) {
                finalMinecraftPath = path;
                console.log(`✓ Auto-detected Minecraft path: ${path}`);
                break;
              }
            } catch (err) {
              // Continue to next path
            }
          }

          if (!finalMinecraftPath) {
            return res.status(400).json({ 
              error: 'Could not auto-detect Minecraft path. Please manually specify the path (e.g., /opt/minecraft or /opt/minecraft/paper)' 
            });
          }
        }

        // Auto-detect Minecraft user if not provided
        if (!minecraftUser) {
          try {
            console.log('🔍 Auto-detecting Minecraft user...');
            const userCheckCmd = `find "${finalMinecraftPath}" -maxdepth 0 -exec stat -c '%U' {} \\; 2>/dev/null`;
            const result = await testSSH.executeCommand(userCheckCmd);
            const detectedUser = result.trim();
            if (detectedUser && detectedUser !== 'root') {
              finalMinecraftUser = detectedUser;
              console.log(`✓ Auto-detected Minecraft user: ${detectedUser}`);
            }
          } catch (err) {
            console.log('Could not auto-detect Minecraft user, using default: minecraft');
          }
        }

        await ManagedServer.updateSSHConfig(vmid, { 
          host, 
          port, 
          username, 
          privateKey, 
          minecraftPath: finalMinecraftPath,
          minecraftUser: finalMinecraftUser
        });

        res.json({ 
          success: true, 
          message: 'SSH configured successfully',
          detectedPath: finalMinecraftPath,
          detectedUser: finalMinecraftUser
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get SSH configuration status (admin or creator only)
    app.get('/api/servers/:vmid/ssh-config', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Permission denied' });
        }

        const sshConfig = await ManagedServer.getSSHConfig(vmid);
        
        if (!sshConfig) {
          return res.json({ configured: false });
        }

        // Don't send the private key to the client
        const { ssh_private_key, ...safeConfig } = sshConfig;
        
        res.json({
          configured: sshConfig.ssh_configured,
          host: sshConfig.ssh_host,
          port: sshConfig.ssh_port,
          username: sshConfig.ssh_username,
          minecraftPath: sshConfig.minecraft_path,
          minecraftUser: sshConfig.minecraft_user || 'minecraft'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get Minecraft server status
    app.get('/api/servers/:vmid/minecraft/status', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const status = await manager.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Start Minecraft server service
    app.post('/api/servers/:vmid/minecraft/start', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const success = await manager.start();
        res.json({ success });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Stop Minecraft server service
    app.post('/api/servers/:vmid/minecraft/stop', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const success = await manager.stop();
        res.json({ success });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Restart Minecraft server service
    app.post('/api/servers/:vmid/minecraft/restart', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const success = await manager.restart();
        res.json({ success });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get server.properties
    app.get('/api/servers/:vmid/minecraft/properties', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const properties = await manager.getServerProperties();
        res.json(properties);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update server.properties
    app.patch('/api/servers/:vmid/minecraft/properties', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can update properties' });
        }

        const manager = await getMinecraftManager(vmid);
        await manager.updateServerProperties(req.body);
        res.json({ success: true, message: 'Properties updated successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get Minecraft server version
    app.get('/api/servers/:vmid/minecraft/version', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const version = await manager.getVersion();
        res.json({ version });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update Minecraft server version
    app.post('/api/servers/:vmid/minecraft/update-version', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can update version' });
        }

        const { downloadUrl, jarName } = req.body;
        
        if (!downloadUrl || !jarName) {
          return res.status(400).json({ 
            error: 'Missing required fields: downloadUrl, jarName' 
          });
        }

        const manager = await getMinecraftManager(vmid);
        const result = await manager.updateVersion(downloadUrl, jarName);
        
        if (result.success) {
          await ManagedServer.updateMinecraftVersion(vmid, jarName);
        }
        
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // List installed plugins
    app.get('/api/servers/:vmid/minecraft/plugins', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const plugins = await manager.listPlugins();
        res.json({ plugins });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Install plugin from URL
    app.post('/api/servers/:vmid/minecraft/plugins', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can install plugins' });
        }

        const { pluginName, downloadUrl } = req.body;
        
        if (!pluginName || !downloadUrl) {
          return res.status(400).json({ 
            error: 'Missing required fields: pluginName, downloadUrl' 
          });
        }

        const manager = await getMinecraftManager(vmid);
        const success = await manager.installPlugin(pluginName, downloadUrl);
        
        res.json({ success, message: success ? 'Plugin installed successfully' : 'Failed to install plugin' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Upload plugin file
    app.post('/api/servers/:vmid/minecraft/plugins/upload', verifyToken, upload.single('plugin'), async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can upload plugins' });
        }

        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const pluginName = req.file.originalname;
        const manager = await getMinecraftManager(vmid);
        await manager.uploadPlugin(req.file.path, pluginName);
        
        // Clean up uploaded file
        const fs = await import('fs');
        fs.unlinkSync(req.file.path);
        
        res.json({ success: true, message: 'Plugin uploaded successfully', pluginName });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete a plugin
    app.delete('/api/servers/:vmid/minecraft/plugins/:pluginName', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can delete plugins' });
        }

        const manager = await getMinecraftManager(vmid);
        const success = await manager.removePlugin(req.params.pluginName);
        
        res.json({ success, message: success ? 'Plugin deleted successfully' : 'Failed to delete plugin' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Upgrade an installed plugin to the latest version
    app.post('/api/servers/:vmid/minecraft/plugins/:pluginName/upgrade', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const pluginName = req.params.pluginName;
        
        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can upgrade plugins' });
        }

        console.log(`⬆️ Upgrading plugin ${pluginName} on server ${vmid}`);
        const manager = await getMinecraftManager(vmid);
        const result = await manager.upgradePlugin(pluginName);
        
        res.json(result);
      } catch (error) {
        console.error('❌ Error upgrading plugin:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available plugins from PaperMC repository
    app.get('/api/minecraft/plugins/repository', verifyToken, async (req, res) => {
      try {
        const searchQuery = req.query.search || '';
        console.log(`🔍 Fetching PaperMC plugins${searchQuery ? ` (search: ${searchQuery})` : ''}...`);

        // Fetch from Hangar API (PaperMC plugin repository)
        // https://hangar.papermc.io/api/v1/projects?limit=25&offset=0&q=search_query
        const limit = 50;
        const offset = (parseInt(req.query.page) || 1 - 1) * limit;
        const query = searchQuery ? `&q=${encodeURIComponent(searchQuery)}` : '';
        
        const response = await fetch(`https://hangar.papermc.io/api/v1/projects?limit=${limit}&offset=${offset}${query}`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch from Hangar API: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✅ Received ${data.result?.length || 0} plugins from Hangar`);
        if (data.result && data.result[0]) {
          console.log(`🔧 Sample plugin structure:`, Object.keys(data.result[0]));
        }
        
        // Transform the response to match our needs
        const plugins = data.result.map(plugin => {
          // Handle various possible icon URL field names
          let iconUrl = plugin.iconUrl || plugin.avatar?.url || plugin.icon?.url || null;
          // If it's a relative URL, make it absolute
          if (iconUrl && !iconUrl.startsWith('http')) {
            iconUrl = `https://hangar.papermc.io${iconUrl}`;
          }
          
          return {
            name: plugin.name,
            slug: plugin.slug,
            description: plugin.description,
            author: plugin.owner,
            downloads: plugin.stats?.downloads || 0,
            icon: iconUrl,
            url: `https://hangar.papermc.io/${plugin.owner}/${plugin.slug}`
          };
        });

        const page = parseInt(req.query.page) || 1;
        const total = data.pagination?.totalSize || 0;
        const totalPages = Math.ceil(total / limit);
        
        res.json({
          plugins,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, totalPages)
          },
          totalPages: Math.max(1, totalPages)
        });
      } catch (error) {
        console.error('❌ Error fetching plugins from repository:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get popular/trending plugins from PaperMC repository
    app.get('/api/minecraft/plugins/popular', verifyToken, async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        console.log(`🔍 Fetching popular PaperMC plugins (page ${page})...`);

        // Fetch popular plugins sorted by downloads with pagination
        const limit = 20;
        const offset = (page - 1) * limit;
        const response = await fetch(`https://hangar.papermc.io/api/v1/projects?limit=${limit}&offset=${offset}&sort=downloads`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch from Hangar API: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Transform the response
        const plugins = data.result.map(plugin => {
          // Handle various possible icon URL field names
          let iconUrl = plugin.iconUrl || plugin.avatar?.url || plugin.icon?.url || null;
          // If it's a relative URL, make it absolute
          if (iconUrl && !iconUrl.startsWith('http')) {
            iconUrl = `https://hangar.papermc.io${iconUrl}`;
          }
          
          return {
            name: plugin.name,
            slug: plugin.slug,
            description: plugin.description,
            author: plugin.owner,
            downloads: plugin.stats?.downloads || 0,
            icon: iconUrl,
            url: `https://hangar.papermc.io/${plugin.owner}/${plugin.slug}`
          };
        });

        // Calculate total pages based on pagination info from Hangar
        const total = data.pagination?.totalSize || 0;
        const totalPages = Math.ceil(total / limit);

        res.json({ 
          plugins,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.max(1, totalPages)
          },
          totalPages: Math.max(1, totalPages)
        });
      } catch (error) {
        console.error('❌ Error fetching popular plugins:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get plugin details with metadata from repository
    app.get('/api/minecraft/plugins/:slug', verifyToken, async (req, res) => {
      try {
        const { slug } = req.params;
        console.log(`🔍 Fetching plugin details: ${slug}`);

        const response = await fetch(`https://hangar.papermc.io/api/v1/projects/${slug}`);
        
        if (!response.ok) {
          // Plugin not found in repository, return basic info
          return res.json({
            name: slug,
            description: 'Plugin not found in repository',
            icon: null,
            found: false
          });
        }

        const plugin = await response.json();
        
        // Handle various possible icon URL field names
        let iconUrl = plugin.iconUrl || plugin.avatar?.url || plugin.icon?.url || null;
        // If it's a relative URL, make it absolute
        if (iconUrl && !iconUrl.startsWith('http')) {
          iconUrl = `https://hangar.papermc.io${iconUrl}`;
        }
        
        res.json({
          name: plugin.name,
          slug: plugin.slug,
          description: plugin.description,
          author: plugin.owner,
          downloads: plugin.stats?.downloads || 0,
          icon: iconUrl,
          url: `https://hangar.papermc.io/${plugin.owner}/${plugin.slug}`,
          found: true
        });
      } catch (error) {
        console.error('❌ Error fetching plugin details:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Install a plugin from repository
    app.post('/api/servers/:vmid/minecraft/plugins/install-from-repo', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const { pluginName, version } = req.body;

        if (!pluginName) {
          return res.status(400).json({ error: 'Plugin name is required' });
        }

        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can install plugins' });
        }

        console.log(`📥 Installing plugin from repository: ${pluginName} on server ${vmid}`);
        const manager = await getMinecraftManager(vmid);
        const result = await manager.installPluginFromRepository(pluginName, version);
        
        res.json(result);
      } catch (error) {
        console.error('❌ Error installing plugin from repository:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get PaperMC version
    app.get('/api/servers/:vmid/minecraft/version', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const version = await manager.getPaperMCVersion();
        res.json({ version, isPaperMC: version !== null });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Update PaperMC version
    app.post('/api/servers/:vmid/minecraft/version', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const { version } = req.body;

        if (!version) {
          return res.status(400).json({ error: 'Version is required' });
        }

        // Check permissions - admin or creator only
        const creatorId = await ManagedServer.getCreator(vmid);
        if (req.user.role !== 'admin' && creatorId !== req.user.userId) {
          return res.status(403).json({ error: 'Only admins or server creators can update PaperMC' });
        }

        console.log(`📥 Updating PaperMC on server ${vmid} to version ${version}`);
        const manager = await getMinecraftManager(vmid);
        const result = await manager.updatePaperMC(version);
        
        res.json(result);
      } catch (error) {
        console.error('❌ Error updating PaperMC:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get available PaperMC versions
    app.get('/api/minecraft/versions', verifyToken, async (req, res) => {
      try {
        console.log('🔍 Fetching available PaperMC versions...');

        // First get the list of available versions from API
        const apiResponse = await fetch('https://api.papermc.io/v2/projects/paper');
        if (!apiResponse.ok) {
          throw new Error(`API request failed: ${apiResponse.statusText}`);
        }
        const apiData = await apiResponse.json();
        const versions = apiData.versions.slice(-20).reverse(); // Last 20 versions, newest first
        
        console.log(`✓ Found ${versions.length} versions from API`);

        // Scrape website for download URLs with hashes
        let websiteDownloadUrls = {};
        try {
          const websiteRes = await fetch('https://papermc.io/downloads/paper', { 
            headers: { 'User-Agent': 'Mozilla/5.0' }
          });
          const html = await websiteRes.text();
          
          // Extract download URLs from the page
          // Format: https://fill-data.papermc.io/v1/objects/{hash}/paper-{version}-{build}.jar
          const downloadRegex = /https:\/\/fill-data\.papermc\.io\/v1\/objects\/[a-f0-9]+\/(paper-[\d.a-z\-]+?-(\d+)\.jar)/g;
          let match;
          
          while ((match = downloadRegex.exec(html)) !== null) {
            const fullFilename = match[1]; // paper-X.X.X-BUILD.jar
            const build = parseInt(match[2]); // BUILD number
            const downloadUrl = match[0]; // Full URL
            
            // Extract version from filename
            const versionMatch = fullFilename.match(/paper-([\d.a-z\-]+?)-\d+\.jar/);
            if (versionMatch) {
              const version = versionMatch[1];
              
              // Store all builds for each version (in case there are multiple)
              if (!websiteDownloadUrls[version]) {
                websiteDownloadUrls[version] = [];
              }
              websiteDownloadUrls[version].push({ build, downloadUrl });
            }
          }
          
          console.log(`✓ Found download URLs for ${Object.keys(websiteDownloadUrls).length} versions from website`);
        } catch (e) {
          console.warn('⚠️  Website scraping failed:', e.message);
        }

        // For each version, get build info
        const versionsWithBuilds = [];
        for (const version of versions) {
          try {
            let build = null;
            let downloadUrl = null;
            
            // Check if we have a website download URL for this version
            if (websiteDownloadUrls[version] && websiteDownloadUrls[version].length > 0) {
              // Get the highest build from website
              const maxBuildInfo = websiteDownloadUrls[version].reduce((max, current) => 
                current.build > max.build ? current : max
              );
              build = maxBuildInfo.build;
              downloadUrl = maxBuildInfo.downloadUrl;
              console.log(`✓ Version ${version}: Build ${build} (from website with hash)`);
            } else {
              // Fallback to API for build number
              const versionRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
              if (versionRes.ok) {
                const versionData = await versionRes.json();
                if (versionData.builds && versionData.builds.length > 0) {
                  build = versionData.builds[versionData.builds.length - 1];
                  console.log(`✓ Version ${version}: Build ${build} (from API)`);
                }
              }
            }
            
            if (build) {
              versionsWithBuilds.push({ version, build, downloadUrl });
            }
          } catch (e) {
            console.warn(`⚠️  Error processing version ${version}:`, e.message);
          }
        }

        console.log(`✓ Returning ${versionsWithBuilds.length} versions total`);
        res.json({ versions: versionsWithBuilds });
      } catch (error) {
        console.error('❌ Error fetching PaperMC versions:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get server logs
    app.get('/api/servers/:vmid/minecraft/logs', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const lines = parseInt(req.query.lines) || 100;
        const manager = await getMinecraftManager(vmid);
        const logs = await manager.getLogs(lines);
        res.json({ logs });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Run system updates
    app.post('/api/servers/:vmid/system/update', verifyToken, requireAdmin, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const result = await manager.runSystemUpdate();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get system information
    app.get('/api/servers/:vmid/system/info', verifyToken, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const manager = await getMinecraftManager(vmid);
        const info = await manager.getSystemInfo();
        res.json({ info });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ============================================
    // HEALTH CHECK
    // ============================================

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
