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
import fs from 'fs';
import ProxmoxClient from './proxmoxClient.js';
import VelocityClient from './velocityClient.js';
import DNSClient from './dnsClient.js';
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
  max: 2000, // Limit each IP to 2000 requests per windowMs
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

    // Proxmox client will be loaded from database config via getProxmoxClient() helper
    // Velocity client will be loaded from database config via getVelocityClient() helper
    // DNS client will be loaded from database config via getDNSClient() helper

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

    // Helper function to get Proxmox client with current configuration
    async function getProxmoxClient() {
      const host = await AppConfig.get('proxmox_host');
      const username = await AppConfig.get('proxmox_username');
      const password = await AppConfig.get('proxmox_password');
      const realm = await AppConfig.get('proxmox_realm') || 'pam';
      
      if (!host || !username || !password) {
        throw new Error('Proxmox not configured - please configure in Admin Settings');
      }
      
      return new ProxmoxClient({
        host,
        username,
        password,
        realm
      });
    }

    // Helper function to get Velocity client with current configuration
    async function getVelocityClient() {
      const host = await AppConfig.get('velocity_host');
      if (!host) {
        // Return unconfigured client
        return new VelocityClient();
      }
      
      const sshPort = await AppConfig.get('velocity_ssh_port');
      const sshUser = await AppConfig.get('velocity_ssh_user');
      const sshKeyPath = await AppConfig.get('velocity_ssh_key');
      const sshPrivateKey = await AppConfig.get('velocity_ssh_private_key');
      const configPath = await AppConfig.get('velocity_config_path');
      const serviceName = await AppConfig.get('velocity_service_name');
      
      console.log(`🔌 Loading Velocity config: host=${host}, user=${sshUser}, privateKey=${sshPrivateKey ? 'from_db' : 'from_file'}`);
      
      return new VelocityClient({
        host,
        port: sshPort ? parseInt(sshPort) : undefined,
        username: sshUser,
        privateKeyPath: sshKeyPath,
        privateKey: sshPrivateKey,
        configPath,
        serviceName
      });
    }

    // Helper function to get DNS client with current configuration
    async function getDNSClient() {
      const host = await AppConfig.get('dns_host');
      if (!host) {
        // Return unconfigured client
        return new DNSClient();
      }
      
      // For backward compatibility, use first host if multiple are specified
      const firstHost = host.split(',')[0].trim();
      
      const sshPort = await AppConfig.get('dns_ssh_port');
      const sshUser = await AppConfig.get('dns_ssh_user');
      const sshKeyPath = await AppConfig.get('dns_ssh_key');
      const sshPrivateKey = await AppConfig.get('dns_ssh_private_key');
      const zone = await AppConfig.get('dns_zone');
      const zoneFile = await AppConfig.get('dns_zone_file');
      
      console.log(`🔐 Loading DNS client: host=${firstHost}, user=${sshUser}, keyPath=${sshKeyPath}, hasPrivateKey=${!!sshPrivateKey}`);      
      return new DNSClient({
        host: firstHost,
        port: sshPort ? parseInt(sshPort) : undefined,
        username: sshUser,
        privateKeyPath: sshKeyPath,
        privateKey: sshPrivateKey,
        zone,
        zoneFile
      });
    }

    // Helper function to get all DNS clients for all configured servers
    async function getAllDNSClients() {
      const hosts = await AppConfig.get('dns_host');
      if (!hosts) {
        return [];
      }
      
      const hostList = hosts.split(',').map(h => h.trim()).filter(h => h);
      if (hostList.length === 0) {
        return [];
      }
      
      const sshPort = await AppConfig.get('dns_ssh_port');
      const sshUser = await AppConfig.get('dns_ssh_user');
      const sshKeyPath = await AppConfig.get('dns_ssh_key');
      const sshPrivateKey = await AppConfig.get('dns_ssh_private_key');
      const zone = await AppConfig.get('dns_zone');
      const zoneFile = await AppConfig.get('dns_zone_file');
      
      console.log(`🔐 Loading ${hostList.length} DNS client(s): hosts=${hosts}, user=${sshUser}, hasPrivateKey=${!!sshPrivateKey}`);
      
      return hostList.map(host => new DNSClient({
        host,
        port: sshPort ? parseInt(sshPort) : undefined,
        username: sshUser,
        privateKeyPath: sshKeyPath,
        privateKey: sshPrivateKey,
        zone,
        zoneFile
      }));
    }

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

    // Create new user (admin only)
    app.post('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { username, email, password, role } = req.body;

        // Validate inputs
        if (!username || !password) {
          return res.status(400).json({ error: 'Username and password are required' });
        }

        if (role && !['admin', 'user'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }

        // Check if username already exists
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
          return res.status(409).json({ error: 'Username already exists' });
        }

        // Check if email already exists (if provided)
        if (email) {
          const existingEmail = await User.findByEmail(email);
          if (existingEmail) {
            return res.status(409).json({ error: 'Email already exists' });
          }
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Create user
        const userId = await User.create(username, email, passwordHash, role || 'user');

        // Return created user (without password hash)
        const user = await User.findById(userId);
        res.status(201).json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at
        });
      } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update user password (admin only)
    app.put('/api/admin/users/:userId/password', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { password } = req.body;
        const userId = parseInt(req.params.userId);

        if (!password) {
          return res.status(400).json({ error: 'Password is required' });
        }

        if (password.length < 6) {
          return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        // Hash new password
        const passwordHash = await bcrypt.hash(password, 10);

        // Update password
        await pool.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [passwordHash, userId]
        );

        // Revoke all sessions for this user to force re-login
        await Session.revokeAllForUser(userId);

        res.json({ success: true, message: 'Password updated successfully' });
      } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Update user details (admin only)
    app.put('/api/admin/users/:userId', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { username, email, role } = req.body;
        const userId = parseInt(req.params.userId);

        // Validate role if provided
        if (role && !['admin', 'user'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }

        // Check if username already exists (if changed)
        if (username) {
          const existingUser = await User.findByUsername(username);
          if (existingUser && existingUser.id !== userId) {
            return res.status(409).json({ error: 'Username already exists' });
          }
        }

        // Check if email already exists (if changed)
        if (email) {
          const existingEmail = await User.findByEmail(email);
          if (existingEmail && existingEmail.id !== userId) {
            return res.status(409).json({ error: 'Email already exists' });
          }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (username) {
          updates.push(`username = $${paramIndex++}`);
          values.push(username);
        }
        if (email !== undefined) {
          updates.push(`email = $${paramIndex++}`);
          values.push(email);
        }
        if (role) {
          updates.push(`role = $${paramIndex++}`);
          values.push(role);
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(userId);
        await pool.query(
          `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values
        );

        // Return updated user
        const user = await User.findById(userId);
        res.json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          created_at: user.created_at,
          last_login: user.last_login
        });
      } catch (error) {
        console.error('Error updating user:', error);
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
        const { proxmox, velocity, dns, node, router } = req.body;

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
          if (velocity.host) await AppConfig.set('velocity_host', velocity.host, req.user.userId, 'Velocity server hostname or IP');
          if (velocity.sshPort) await AppConfig.set('velocity_ssh_port', velocity.sshPort.toString(), req.user.userId, 'Velocity SSH port');
          if (velocity.sshUser) await AppConfig.set('velocity_ssh_user', velocity.sshUser, req.user.userId, 'Velocity SSH username');
          if (velocity.sshKeyPath) await AppConfig.set('velocity_ssh_key', velocity.sshKeyPath, req.user.userId, 'Velocity SSH private key path');
          if (velocity.configPath) await AppConfig.set('velocity_config_path', velocity.configPath, req.user.userId, 'Velocity config file path');
          if (velocity.serviceName) await AppConfig.set('velocity_service_name', velocity.serviceName, req.user.userId, 'Velocity systemd service name');
          if (velocity.backendNetwork) await AppConfig.set('velocity_backend_network', velocity.backendNetwork, req.user.userId, 'Velocity backend network range');
        }

        if (dns) {
          if (dns.host) await AppConfig.set('dns_host', dns.host, req.user.userId, 'DNS server hostnames or IPs (comma-separated)');
          if (dns.sshPort) await AppConfig.set('dns_ssh_port', dns.sshPort.toString(), req.user.userId, 'DNS SSH port');
          if (dns.sshUser) await AppConfig.set('dns_ssh_user', dns.sshUser, req.user.userId, 'DNS SSH username');
          if (dns.sshKeyPath) await AppConfig.set('dns_ssh_key', dns.sshKeyPath, req.user.userId, 'DNS SSH private key path');
          if (dns.zone) await AppConfig.set('dns_zone', dns.zone, req.user.userId, 'DNS zone name');
          if (dns.zoneFile) await AppConfig.set('dns_zone_file', dns.zoneFile, req.user.userId, 'DNS zone file path');
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
        const { host, sshPort, sshUser, sshKeyPath, configPath, serviceName } = req.body;

        if (!host) {
          return res.status(400).json({ 
            success: false, 
            error: 'Velocity host is required' 
          });
        }

        try {
          // Create a temporary Velocity client to test connection
          const testVelocity = new VelocityClient({ 
            host, 
            port: sshPort ? parseInt(sshPort) : undefined,
            username: sshUser,
            privateKeyPath: sshKeyPath,
            configPath,
            serviceName
          });
          const result = await testVelocity.listServers();
          
          res.json({ 
            success: true, 
            message: `Connection successful. Found ${result.servers.length} server(s) in config.`,
            servers: result.servers
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

    // Test Velocity password authentication
    app.post('/api/admin/config/test-velocity-password', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, sshPort, sshUser, password } = req.body;

        if (!host || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'Velocity host and password are required' 
          });
        }

        try {
          const testVelocity = new VelocityClient({ 
            host, 
            port: sshPort ? parseInt(sshPort) : undefined,
            username: sshUser,
            password
          });
          await testVelocity.testPasswordConnection();
          
          res.json({ 
            success: true, 
            message: 'Password authentication successful'
          });
        } catch (error) {
          res.json({ 
            success: false, 
            error: error.message 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Setup SSH key authentication for Velocity
    app.post('/api/admin/config/setup-velocity-ssh', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, sshPort, sshUser, password, sshKeyPath, configPath, serviceName } = req.body;

        if (!host || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'Velocity host and password are required' 
          });
        }

        try {
          console.log(`🔐 Setting up SSH key authentication for ${host}...`);
          
          const velocityClient = new VelocityClient({ 
            host, 
            port: sshPort ? parseInt(sshPort) : undefined,
            username: sshUser,
            password,
            privateKeyPath: sshKeyPath,
            configPath,
            serviceName
          });

          // Setup SSH key authentication and capture generated private key
          const setupResult = await velocityClient.setupSSHKeyAuth();

          if (setupResult?.privateKey) {
            await AppConfig.set('velocity_ssh_private_key', setupResult.privateKey);
            console.log('✓ Velocity private key stored in database during setup');
          }

          // Test the key-based connection
          const testResult = await velocityClient.listServers();
          
          res.json({ 
            success: true, 
            message: `SSH key authentication configured successfully and key saved to database. Found ${testResult.servers.length} server(s).`,
            servers: testResult.servers
          });
        } catch (error) {
          console.error('SSH setup error:', error);
          res.json({ 
            success: false, 
            error: error.message 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Check SSH key status for Velocity
    app.get('/api/admin/config/velocity-ssh-status', verifyToken, requireAdmin, async (req, res) => {
      try {
        const host = await AppConfig.get('velocity_host');
        if (!host) {
          return res.json({ 
            configured: false, 
            hasSSHKey: false,
            message: 'Velocity not configured'
          });
        }

        const sshUser = await AppConfig.get('velocity_ssh_user');
        const privateKey = await AppConfig.get('velocity_ssh_private_key');

        res.json({ 
          configured: true,
          hasSSHKey: !!privateKey,
          host,
          sshUser: sshUser,
          message: privateKey ? '✓ SSH key is stored in database' : '⚠️ SSH key not yet stored. Run setup-velocity-ssh to generate and store it.'
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test DNS password authentication
    app.post('/api/admin/config/test-dns-password', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, sshPort, sshUser, password } = req.body;

        if (!host || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'DNS host and password are required' 
          });
        }

        try {
          const testDns = new DNSClient({ 
            host, 
            port: sshPort || 22,
            username: sshUser,
            password
          });
          await testDns.testPasswordConnection();
          
          res.json({ 
            success: true, 
            message: 'Password authentication successful'
          });
        } catch (error) {
          res.json({ 
            success: false, 
            error: error.message 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Setup SSH key authentication for DNS
    app.post('/api/admin/config/setup-dns-ssh', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, sshPort, sshUser, password, sudoPassword, zone, zoneFile } = req.body;
        
        // Get configured values if not provided in request
        const configuredHosts = host || await AppConfig.get('dns_host');
        const configuredSshPort = sshPort || await AppConfig.get('dns_ssh_port') || 22;
        const configuredSshUser = sshUser || await AppConfig.get('dns_ssh_user');
        const configuredZone = zone || await AppConfig.get('dns_zone');
        const configuredZoneFile = zoneFile || await AppConfig.get('dns_zone_file');

        if (!configuredHosts || !configuredSshUser || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'DNS host(s), SSH user, and password are required' 
          });
        }

        try {
          // Parse comma-separated hosts
          const hostList = configuredHosts.split(',').map(h => h.trim()).filter(h => h);
          console.log(`🔐 Setting up SSH key authentication for ${hostList.length} DNS server(s): ${hostList.join(', ')}...`);
          
          let privateKey = null;
          const results = [];

          // Setup SSH authentication on each DNS server
          for (const dnsHost of hostList) {
            try {
              console.log(`\n📝 Setting up ${dnsHost}...`);
              const dnsClient = new DNSClient({ 
                host: dnsHost, 
                port: configuredSshPort,
                username: configuredSshUser,
                password,
                sudoPassword: sudoPassword || password,
                zone: configuredZone,
                zoneFile: configuredZoneFile
              });

              // Setup SSH key authentication (generates temp key, adds to DNS server)
              const setupResult = await dnsClient.setupSSHKeyAuth();

              if (setupResult?.privateKey && !privateKey) {
                privateKey = setupResult.privateKey;
              }

              console.log(`✓ ${dnsHost} setup complete`);
              results.push({ host: dnsHost, success: true });
            } catch (error) {
              console.error(`❌ ${dnsHost} setup failed:`, error.message);
              results.push({ host: dnsHost, success: false, error: error.message });
            }
          }

          // Store the private key if we got one
          if (privateKey) {
            await AppConfig.set('dns_ssh_private_key', privateKey);
            console.log('✓ DNS private key stored in database');
          }

          const successCount = results.filter(r => r.success).length;
          const failedHosts = results.filter(r => !r.success).map(r => r.host);

          console.log(`\n✅ DNS setup complete: ${successCount}/${hostList.length} server(s) configured`);
          if (failedHosts.length > 0) {
            console.log(`⚠️  Failed hosts: ${failedHosts.join(', ')}`);
          }
          console.log('⚠️  NEXT STEP: Configure passwordless sudo on each DNS server');
          console.log(`ℹ️  SSH into each server and run (with your password when prompted):`);
          console.log(`   echo '${configuredSshUser} ALL=(ALL) NOPASSWD:/bin/cp,/bin/sed,/bin/tee,/usr/sbin/rndc,/bin/systemctl' | sudo tee /etc/sudoers.d/dns-ops`);
          console.log(`   sudo chmod 440 /etc/sudoers.d/dns-ops`);

          if (successCount === 0) {
            res.json({ 
              success: false, 
              error: 'Failed to setup SSH on any DNS server',
              results
            });
          } else {
            res.json({ 
              success: true, 
              message: `SSH key authentication configured on ${successCount}/${hostList.length} server(s). Configure passwordless sudo on each server.`,
              results
            });
          }
        } catch (error) {
          console.error('DNS SSH setup error:', error);
          res.json({ 
            success: false, 
            error: error.message 
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Check SSH key status for DNS
    app.get('/api/admin/config/dns-ssh-status', verifyToken, requireAdmin, async (req, res) => {
      try {
        const host = await AppConfig.get('dns_host');
        if (!host) {
          return res.json({ 
            configured: false, 
            hasSSHKey: false,
            message: 'DNS not configured'
          });
        }

        const sshUser = await AppConfig.get('dns_ssh_user');
        const privateKey = await AppConfig.get('dns_ssh_private_key');

        res.json({ 
          configured: true,
          hasSSHKey: !!privateKey,
          host,
          sshUser: sshUser,
          message: privateKey ? '✓ SSH key is stored in database' : '⚠️ SSH key not yet stored. Follow setup steps: 1) setup-dns-ssh, then 2) store-dns-ssh-key'
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Retrieve and store DNS SSH private key from remote server
    app.post('/api/admin/config/store-dns-ssh-key', verifyToken, requireAdmin, async (req, res) => {
      try {
        const host = await AppConfig.get('dns_host');
        const sshUser = await AppConfig.get('dns_ssh_user');
        const sshPort = await AppConfig.get('dns_ssh_port') || 22;
        const { password, remoteKeyPath } = req.body;

        if (!host || !sshUser || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'DNS host, SSH user, and password are all required. Configure DNS settings first.' 
          });
        }

        try {
          console.log(`🔐 Retrieving DNS private key from ${sshUser}@${host}...`);
          
          // Use sshpass to read the private key from remote server's user home directory
          const keyPath = remoteKeyPath || '~/.ssh/id_rsa';
          const cmd = `sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -p ${sshPort} ${sshUser}@${host} "cat ${keyPath}"`;
          
          const { stdout } = await execAsync(cmd);
          
          if (!stdout || !stdout.includes('BEGIN RSA PRIVATE KEY')) {
            throw new Error(`Key not found at ${keyPath}. Make sure you've called /api/admin/config/setup-dns-ssh first to generate the key.`);
          }

          // Store the private key in database
          await AppConfig.set('dns_ssh_private_key', stdout);
          
          console.log('✓ DNS private key stored in database');
          
          res.json({ 
            success: true, 
            message: 'DNS private key retrieved and stored successfully',
            status: '✓ DNS is now fully configured and ready to use'
          });
        } catch (error) {
          console.error('Error retrieving DNS key:', error);
          res.json({ 
            success: false, 
            error: `Failed to retrieve key: ${error.message}`
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Retrieve and store Velocity SSH private key from remote server
    app.post('/api/admin/config/store-velocity-ssh-key', verifyToken, requireAdmin, async (req, res) => {
      try {
        const host = await AppConfig.get('velocity_host');
        const sshUser = await AppConfig.get('velocity_ssh_user');
        const sshPort = await AppConfig.get('velocity_ssh_port') || 22;
        const { password, remoteKeyPath } = req.body;

        if (!host || !sshUser || !password) {
          return res.status(400).json({ 
            success: false, 
            error: 'Velocity host, SSH user, and password are all required. Configure Velocity settings first.' 
          });
        }

        try {
          console.log(`🔐 Retrieving Velocity private key from ${sshUser}@${host}...`);
          
          // Use sshpass to read the private key from remote server's user home directory
          const keyPath = remoteKeyPath || '~/.ssh/id_rsa';
          const cmd = `sshpass -p "${password}" ssh -o StrictHostKeyChecking=no -p ${sshPort} ${sshUser}@${host} "cat ${keyPath}"`;
          
          const { stdout } = await execAsync(cmd);
          
          if (!stdout || !stdout.includes('BEGIN RSA PRIVATE KEY')) {
            throw new Error('Invalid private key format or key not found');
          }

          // Store the private key in database
          await AppConfig.set('velocity_ssh_private_key', stdout);
          
          console.log('✓ Velocity private key stored in database');
          
          res.json({ 
            success: true, 
            message: 'Velocity private key retrieved and stored successfully'
          });
        } catch (error) {
          console.error('Error retrieving Velocity key:', error);
          res.json({ 
            success: false, 
            error: `Failed to retrieve key: ${error.message}`
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get all available storages and current configuration
    app.get('/api/admin/config/storages', verifyToken, requireAdmin, async (req, res) => {
      try {
        const cloneProxmox = await getProxmoxClient();
        const allStorages = await cloneProxmox.getStorage();
        const allNodes = await cloneProxmox.getNodes();
        const baseServerResult = await pool.query(
          'SELECT vmid, server_name FROM managed_servers ORDER BY server_name ASC'
        );
        
        // Get configured storages
        let configuredStorages = await AppConfig.get('available_storages');
        let configuredNodes = await AppConfig.get('available_nodes');
        const configuredBaseServerVmid = await AppConfig.get('clone_base_server_vmid');
        
        const allStorageNames = allStorages.map(s => s.storage);
        let parsedConfigured = allStorageNames;
        if (configuredStorages) {
          const parsed = typeof configuredStorages === 'string' ? JSON.parse(configuredStorages) : configuredStorages;
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedConfigured = parsed;
          }
        }

        const allNodeNames = allNodes.map(n => n.node);
        let parsedConfiguredNodes = allNodeNames;
        if (configuredNodes) {
          const parsed = typeof configuredNodes === 'string' ? JSON.parse(configuredNodes) : configuredNodes;
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsedConfiguredNodes = parsed;
          }
        }
        
        const storageList = allStorages.map(s => ({
          name: s.storage,
          type: s.type,
          enabled: true,
          configured: parsedConfigured.includes(s.storage),
          availableGB: Math.round(Math.max(0, parseInt(s.avail || 0)) / (1024 * 1024 * 1024) * 100) / 100,
          sizeGB: Math.round(Math.max(0, parseInt(s.size || s.total || 0)) / (1024 * 1024 * 1024) * 100) / 100
        }));

        const nodeList = allNodes
          .map(n => ({
            name: n.node,
            configured: parsedConfiguredNodes.includes(n.node)
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        const baseServerOptions = baseServerResult.rows.map(row => ({
          vmid: row.vmid,
          name: row.server_name
        }));
        
        res.json({
          allStorages: storageList,
          configured: parsedConfigured,
          filteringEnabled: true,
          allNodes: nodeList,
          configuredNodes: parsedConfiguredNodes,
          nodeFilteringEnabled: true,
          baseServerOptions,
          selectedBaseServerVmid: configuredBaseServerVmid ? parseInt(configuredBaseServerVmid) : null
        });
      } catch (error) {
        console.error('Error fetching storages:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Configure available storages
    app.post('/api/admin/config/storages', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { storages, nodes, baseServerVmid } = req.body;
        
        if (!Array.isArray(storages)) {
          return res.status(400).json({ error: 'storages must be an array' });
        }

        if (nodes !== undefined && !Array.isArray(nodes)) {
          return res.status(400).json({ error: 'nodes must be an array when provided' });
        }
        
        // Store configured storages
        await AppConfig.set('available_storages', storages, req.user.userId, 'List of available storage names for cloning', 'json');
        await AppConfig.set('enable_storage_filtering', 'true', req.user.userId, 'Enable storage filtering for users');

        if (Array.isArray(nodes)) {
          await AppConfig.set('available_nodes', nodes, req.user.userId, 'List of available Proxmox nodes for cloning', 'json');
        }
        await AppConfig.set('enable_node_filtering', 'true', req.user.userId, 'Enable Proxmox node filtering for users');

        if (baseServerVmid !== undefined && baseServerVmid !== null && baseServerVmid !== '') {
          const parsedBaseVmId = parseInt(baseServerVmid);
          if (Number.isNaN(parsedBaseVmId)) {
            return res.status(400).json({ error: 'baseServerVmid must be a valid number' });
          }

          const baseServerExists = await pool.query(
            'SELECT vmid FROM managed_servers WHERE vmid = $1',
            [parsedBaseVmId]
          );

          if (baseServerExists.rows.length === 0) {
            return res.status(400).json({ error: 'Selected base server does not exist in managed servers' });
          }

          await AppConfig.set('clone_base_server_vmid', parsedBaseVmId.toString(), req.user.userId, 'Base managed server VMID used for create-server cloning');
        }
        
        res.json({ 
          success: true, 
          message: 'Storage configuration updated',
          configured: storages,
          filteringEnabled: true,
          configuredNodes: Array.isArray(nodes) ? nodes : null,
          nodeFilteringEnabled: true,
          selectedBaseServerVmid: (baseServerVmid !== undefined && baseServerVmid !== null && baseServerVmid !== '') ? parseInt(baseServerVmid) : null
        });
      } catch (error) {
        console.error('Error updating storage config:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Test DNS connection
    app.post('/api/admin/config/test-dns', verifyToken, requireAdmin, async (req, res) => {
      try {
        const { host, sshPort, sshUser, sshKeyPath, zone, zoneFile } = req.body;

        if (!host) {
          return res.status(400).json({ 
            success: false, 
            error: 'DNS host is required' 
          });
        }

        try {
          const dns = new DNSClient({ 
            host, 
            port: sshPort || 22,
            username: sshUser,
            privateKeyPath: sshKeyPath,
            zone: zone,
            zoneFile: zoneFile
          });
          
          // Try to list records to test connection
          const records = await dns.listARecords();
          
          res.json({ 
            success: true, 
            message: `DNS connection successful. Found ${records.length} A record(s).`,
            records
          });
        } catch (error) {
          res.json({ 
            success: false, 
            error: error.message 
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

        // Get Proxmox client with current config from database
        console.log('📋 Loading Proxmox client from database config...');
        let currentProxmox;
        try {
          currentProxmox = await getProxmoxClient();
          console.log(`✓ Proxmox client loaded successfully`);
        } catch (error) {
          console.log('❌ Proxmox not configured properly:', error.message);
          return res.status(400).json({ 
            error: 'Proxmox not configured',
            message: 'Please configure Proxmox credentials in Admin Settings → Configuration'
          });
        }

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
        // Get Proxmox client with current config from database
        const cloneProxmox = await getProxmoxClient();

        // Get nodes
        const allNodes = await cloneProxmox.getNodes();

        // Get configured available nodes from app config
        let availableNodeNames = await AppConfig.get('available_nodes');

        const nodeList = availableNodeNames
          ? (typeof availableNodeNames === 'string' ? JSON.parse(availableNodeNames) : availableNodeNames)
          : allNodes.map(n => n.node);
        const nodes = allNodes.filter(n => nodeList.includes(n.node));
        
        // Get storage
        const allStorage = await cloneProxmox.getStorage();
        
        // Get configured available storages from app config
        let availableStorageNames = await AppConfig.get('available_storages');

        const storageList = availableStorageNames
          ? (typeof availableStorageNames === 'string' ? JSON.parse(availableStorageNames) : availableStorageNames)
          : allStorage.map(s => s.storage);
        const storage = allStorage.filter(s => storageList.includes(s.storage));

        const configuredBaseServerVmid = await AppConfig.get('clone_base_server_vmid');
        let baseServer = null;
        if (configuredBaseServerVmid) {
          const baseServerResult = await pool.query(
            'SELECT vmid, server_name FROM managed_servers WHERE vmid = $1',
            [parseInt(configuredBaseServerVmid)]
          );
          if (baseServerResult.rows.length > 0) {
            baseServer = {
              vmid: baseServerResult.rows[0].vmid,
              name: baseServerResult.rows[0].server_name
            };
          }
        }

        const result = { 
          nodes: nodes
            .map(n => ({ id: n.node, name: n.node }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          storage: storage
            .map(s => {
              const available = parseInt(s.avail || s.available || 0);
              const used = parseInt(s.used || 0);
              const total = parseInt(s.size || s.total || s.maxfiles || (available + used) || 0);
              return {
                id: s.storage, 
                name: s.storage,
                type: s.type,
                availableBytes: Math.max(0, available),
                availableGB: Math.round(Math.max(0, available) / (1024 * 1024 * 1024) * 100) / 100,
                usedBytes: Math.max(0, used),
                usedGB: Math.round(Math.max(0, used) / (1024 * 1024 * 1024) * 100) / 100,
                sizeBytes: Math.max(0, total),
                sizeGB: Math.round(Math.max(0, total) / (1024 * 1024 * 1024) * 100) / 100
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
          baseServer
        };
        
        console.log(`✅ Sending ${result.storage.length} storage options to client`);
        console.log(`✅ Sending ${result.nodes.length} node options to client`);
        result.storage.forEach(st => {
          console.log(`   ${st.name} (${st.type}): ${st.availableGB} GB available, ${st.sizeGB} GB total`);
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

    // Get server details (protected)
    app.get('/api/servers/:vmid', verifyToken, async (req, res) => {
      try {
        const proxmox = await getProxmoxClient();
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
        const configuredBaseVmId = await AppConfig.get('clone_base_server_vmid');
        const effectiveSourceVmId = sourceVmId || configuredBaseVmId;
        
        // newVmId is now optional - Proxmox will auto-assign if not provided
        if (!effectiveSourceVmId || !domainName) {
          return res.status(400).json({ 
            error: 'Missing required fields: domainName and configured base clone server' 
          });
        }

        const parsedSourceVmId = parseInt(effectiveSourceVmId);
        if (Number.isNaN(parsedSourceVmId)) {
          return res.status(400).json({ error: 'Configured source VM is invalid' });
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

        // Get Proxmox client with current config from database
        console.log('📋 Loading Proxmox client from database config...');
        let cloneProxmox;
        try {
          cloneProxmox = await getProxmoxClient();
          console.log('✓ Proxmox client loaded successfully');
        } catch (error) {
          console.log('❌ Proxmox not configured:', error.message);
          return res.status(400).json({
            error: 'Proxmox not configured. Configure Proxmox credentials in Admin Settings → Configuration.'
          });
        }

        console.log(`🔄 Attempting to clone VM ${parsedSourceVmId} to ${domainName}...`);

        let routerHost = null;
        let routerUsername = null;
        let routerPassword = null;
        let routerUseHttps = true;

        if (dhcpEnabled) {
          // Get router config for later use when VM gets an IP
          routerHost = await AppConfig.get('router_host');
          routerUsername = await AppConfig.get('router_username');
          routerPassword = await AppConfig.get('router_password');
          routerUseHttps = (await AppConfig.get('router_use_https')) !== 'false';

          if (!routerHost || !routerUsername || !routerPassword) {
            return res.status(400).json({
              error: 'Router not configured. Configure ASUS router before cloning.'
            });
          }
          
          console.log('✓ Router configured. Will reserve IP once VM gets assigned one.');
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
        const result = await cloneProxmox.cloneServer(parsedSourceVmId, newVmId, newVmName, targetNode, targetStorage);
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
        await ServerCloneLog.create(req.user.userId, parsedSourceVmId, assignedVmId, newVmName, 'pending');
        await ManagedServer.create(assignedVmId, req.user.userId, newVmName, serverSeed);
        
        // Create clone status tracker
        const cloneStatus = await CloneStatus.create(assignedVmId, req.user.userId, domainName, parsedSourceVmId);
        await CloneStatus.updateStep(assignedVmId, 'vm_cloned');

        // Copy SSH configuration from source to destination
        // This allows us to immediately configure the world without manual SSH setup
        const sshConfigCopied = await ManagedServer.copySSHConfig(
          parsedSourceVmId,
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
            console.log(`🌐 Waiting for VM to get DHCP IP and then locking it in as static reservation...`);

            // Get VM's MAC address from Proxmox with retry (VM network config may take a few seconds)
            let networkConfig = null;
            let macAddress = null;
            let vmIp = null;
            let retryCount = 0;
            const maxRetries = 15; // 15 attempts × 2 seconds = 30 seconds (clone is already complete)
            
            while (retryCount < maxRetries) {
              try {
                // Try to get network config and IP
                if (!networkConfig) {
                  networkConfig = await cloneProxmox.getVMNetworkConfig(assignedVmId);
                  if (networkConfig.primaryMac) {
                    macAddress = networkConfig.primaryMac;
                    console.log(`✅ Got MAC address: ${macAddress}`);
                  }
                }
                
                // Try to get the actual IP the VM got from DHCP
                if (macAddress && !vmIp) {
                  vmIp = await cloneProxmox.getGuestAgentIP(assignedVmId);
                  if (vmIp) {
                    console.log(`✅ Got VM IP from guest agent: ${vmIp}`);
                  }
                }
                
                // If we have both MAC and IP, we're done
                if (macAddress && vmIp) {
                  break;
                }
              } catch (err) {
                // Guest agent may not be ready yet
                const suffix = !vmIp ? ' (waiting for guest agent)' : ' (waiting for MAC)';
                console.log(`⏳ Attempt ${retryCount + 1}/${maxRetries}: Still waiting${suffix}...`);
              }
              
              retryCount++;
              if (retryCount < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            }
            
            if (macAddress && vmIp) {
              console.log(`   MAC: ${macAddress}`);
              console.log(`   IP from DHCP: ${vmIp}`);

              // Add this MAC+IP combo to the router's static reservation list (just append)
              dhcpReservationResult = await routerServicePost('/dhcp-reservation', {
                host: routerHost,
                username: routerUsername,
                password: routerPassword,
                useHttps: routerUseHttps,
                mac: macAddress,
                ip: vmIp,
                name: domainName
              });

              if (dhcpReservationResult.success) {
                console.log(`✅ DHCP reservation created: ${macAddress} → ${vmIp} (locked from DHCP)`);
                await CloneStatus.completeStep(assignedVmId, 'dhcp_reserved', { ipAddress: vmIp, macAddress });
              } else {
                await CloneStatus.markPaused(assignedVmId, 'Failed to create DHCP reservation', 'dhcp_reservation');
                return res.status(500).json({
                  error: 'Failed to create DHCP reservation on router.',
                  vmid: assignedVmId,
                  canRetry: true
                });
              }
            } else {
              const missing = !macAddress ? 'MAC address' : 'IP address';
              await CloneStatus.markPaused(assignedVmId, `Could not get ${missing} after ${maxRetries} attempts`, 'dhcp_reservation');
              return res.status(500).json({
                error: `Could not get ${missing} for VM ${assignedVmId} after ${maxRetries * 2} seconds. Check that guest agent is installed on template.`,
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

          // Try to get IP from QEMU guest agent (if installed)
          try {
            console.log(`🔍 Waiting for QEMU guest agent to start (30s)...`);
            setLiveCloneProgress(clientRequestId, {
              userId: req.user.userId,
              status: 'in-progress',
              currentStep: 'waiting-for-agent',
              progressPercent: 45,
              message: 'Waiting for QEMU guest agent to start (30s)...'
            });
            
            // Wait with periodic progress updates
            for (let i = 0; i < 6; i++) {
              await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds at a time
              setLiveCloneProgress(clientRequestId, {
                userId: req.user.userId,
                status: 'in-progress',
                currentStep: 'waiting-for-agent',
                progressPercent: 45 + (i * 2),
                message: `Waiting for QEMU guest agent... (${(i + 1) * 5}s / 30s)`
              });
            }
            
            console.log(`🔍 Querying QEMU guest agent for IP address...`);
            const guestInfo = await cloneProxmox.getGuestAgentIP(assignedVmId);
            
            if (guestInfo && guestInfo.ip) {
              console.log(`✅ Guest agent reported IP: ${guestInfo.ip}`);
              
              // Update SSH config in database with the actual IP
              try {
                await pool.query(
                  'UPDATE managed_servers SET ssh_host = $1 WHERE vmid = $2',
                  [guestInfo.ip, assignedVmId]
                );
                console.log(`✅ Updated SSH config in database with guest agent IP: ${guestInfo.ip}`);
              } catch (dbError) {
                console.warn(`⚠️  Failed to update SSH config in database: ${dbError.message}`);
              }
            } else {
              console.log(`ℹ️  Guest agent did not report an IP (may not be installed or not ready yet)`);
            }
          } catch (agentError) {
            console.log(`ℹ️  Could not get IP from guest agent: ${agentError.message}`);
            console.log(`   This is normal if QEMU guest agent is not installed. Will use configured IP.`);
          }
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
              // Retry SSH connection up to 30 times with 10-second intervals (5 minutes total)
              let sshConnected = false;
              let retryCount = 0;
              const maxRetries = 30;
              const retryInterval = 10; // seconds between retries
              
              console.log(`⏳ Waiting for SSH to be ready at ${sshConfig.ssh_host}:${sshConfig.ssh_port} (up to ${maxRetries * retryInterval}s)...`);
              
              while (!sshConnected && retryCount < maxRetries) {
                try {
                  const ssh = new SSHClient({
                    host: sshConfig.ssh_host,
                    port: sshConfig.ssh_port,
                    username: sshConfig.ssh_username,
                    privateKey: sshConfig.ssh_private_key
                  });

                  // Test SSH connection with a simple command first
                  console.log(`🔍 Testing SSH connection (attempt ${retryCount + 1}/${maxRetries})...`);
                  const testResult = await ssh.executeCommand('echo "SSH connection test"');
                  console.log(`✅ SSH connection successful!`);
                  
                  setLiveCloneProgress(clientRequestId, {
                    userId: req.user.userId,
                    status: 'in-progress',
                    currentStep: 'setting-up-world',
                    progressPercent: 75,
                    message: 'SSH connected, setting up world...'
                  });

                  const manager = new MinecraftServerManager(
                    ssh,
                    sshConfig.minecraft_path,
                    sshConfig.minecraft_user || 'minecraft'
                  );

                  worldSetupResult = await manager.setupFreshWorld(serverSeed);
                  sshConnected = true;
                  
                  if (worldSetupResult.success) {
                    console.log(`✅ World setup successful for VM ${assignedVmId} after ${retryCount + 1} attempt(s)`);
                    
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'in-progress',
                      currentStep: 'restarting-service',
                      progressPercent: 82,
                      message: 'Restarting minecraft.service...'
                    });
                    
                    // Restart the minecraft service to start with fresh world
                    console.log(`🔄 Restarting minecraft.service with new world...`);
                    try {
                      await ssh.executeCommand('sudo -n systemctl restart minecraft.service');
                      console.log(`✅ Service restart command sent`);
                      // Wait a moment for service to start
                      await new Promise(resolve => setTimeout(resolve, 3000));
                    } catch (restartError) {
                      console.warn(`⚠️  Service restart failed: ${restartError.message}`);
                    }
                    
                    // Check minecraft.service status
                    try {
                      console.log(`🔍 Checking minecraft.service status...`);
                      const serviceStatus = await ssh.executeCommand('systemctl status minecraft.service');
                      let statusStr = '';
                      
                      // Handle both object and string responses
                      if (typeof serviceStatus === 'object' && serviceStatus.stdout) {
                        statusStr = serviceStatus.stdout;
                      } else if (typeof serviceStatus === 'string') {
                        statusStr = serviceStatus;
                      } else {
                        statusStr = JSON.stringify(serviceStatus);
                      }
                      
                      console.log(`📊 Service status output:\n${statusStr.substring(0, 500)}`);
                      
                      // Check if service is running
                      if (statusStr.includes('active (running)')) {
                        console.log(`✅ minecraft.service is running!`);
                      } else if (statusStr.includes('active (exited)')) {
                        console.log(`ℹ️  minecraft.service exited cleanly`);
                      } else if (statusStr.includes('failed') || statusStr.includes('inactive')) {
                        console.warn(`⚠️  minecraft.service failed or is inactive`);
                        console.warn(`⚠️  Service may need manual restart. Status:\n${statusStr.substring(0, 300)}`);
                      } else {
                        console.warn(`⚠️  minecraft.service status unknown`);
                      }
                    } catch (serviceError) {
                      console.warn(`⚠️  Could not check service status: ${serviceError.message}`);
                    }
                  } else {
                    console.warn(`⚠️  World setup had issues: ${worldSetupResult.message}`);
                  }
                } catch (sshError) {
                  retryCount++;
                  if (retryCount < maxRetries) {
                    console.log(`⏳ SSH connection failed (attempt ${retryCount}/${maxRetries}): ${sshError.message}`);
                    console.log(`   Retrying in ${retryInterval}s...`);
                    const progressPercent = 55 + (retryCount * 2);
                    setLiveCloneProgress(clientRequestId, {
                      userId: req.user.userId,
                      status: 'in-progress',
                      currentStep: 'waiting-for-ssh',
                      progressPercent: Math.min(progressPercent, 75),
                      message: `Waiting for SSH connection (${retryCount}/${maxRetries})...`
                    });
                    await new Promise(resolve => setTimeout(resolve, retryInterval * 1000));
                  } else {
                    console.error(`❌ SSH failed after ${maxRetries} attempts: ${sshError.message}`);
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
        // Use the SSH host from database (which has the guest agent detected IP)
        let velocityResult = null;
        
        setLiveCloneProgress(clientRequestId, {
          userId: req.user.userId,
          status: 'in-progress',
          currentStep: 'configuring-proxy',
          progressPercent: 90,
          message: 'Registering with Velocity proxy...'
        });
        
        // Get current Velocity configuration from AppConfig
        const velocity = await getVelocityClient();
        
        if (velocity.isConfigured() && assignedVmId) {
          try {
            // Get the actual SSH host (with guest agent IP if available)
            const sshConfig = await ManagedServer.getSSHConfig(assignedVmId);
            if (sshConfig && sshConfig.ssh_host) {
              const serverIp = sshConfig.ssh_host;
              
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
            } else {
              console.log('⚠️  Could not get SSH config for Velocity registration');
            }
          } catch (velocityError) {
            console.warn(`⚠️  Error during Velocity registration: ${velocityError.message}`);
          }
        }

        // Try to add DNS record (optional - won't fail clone if it fails)
        setLiveCloneProgress(clientRequestId, {
          userId: req.user.userId,
          status: 'in-progress',
          currentStep: 'configuring-dns',
          progressPercent: 95,
          message: 'Adding DNS records...'
        });

        try {
         const velocityHost = await AppConfig.get('velocity_host');
          if (!velocityHost) {
            console.warn('⚠️  Velocity host not configured, skipping DNS record');
          } else {
            // Get all configured DNS servers
            const dnsClients = await getAllDNSClients();
            
            if (dnsClients.length > 0 && assignedVmId) {
              console.log(`📝 Adding DNS record to ${dnsClients.length} DNS server(s): ${domainName} -> ${velocityHost}`);
              
              for (let i = 0; i < dnsClients.length; i++) {
                const dns = dnsClients[i];
                try {
                  const dnsResult = await dns.addARecord(domainName, velocityHost);
                  if (dnsResult.success) {
                    console.log(`✅ Added DNS record to ${dns.host} successfully`);
                  } else {
                    console.warn(`⚠️  Could not add DNS record to ${dns.host}: ${dnsResult.message}`);
                  }
                } catch (dnsServerError) {
                  console.warn(`⚠️  Error adding DNS record to ${dns.host}: ${dnsServerError.message}`);
                }
              }
            } else {
              console.log('ℹ️  No DNS servers configured');
            }
          }
        } catch (dnsError) {
          console.warn(`⚠️  Error during DNS registration: ${dnsError.message}`);
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
            // Load router config
            const routerHost = await AppConfig.get('router_host');
            const routerUsername = await AppConfig.get('router_username');
            const routerPassword = await AppConfig.get('router_password');
            const routerUseHttps = (await AppConfig.get('router_use_https')) !== 'false';

            if (!routerHost) {
              return res.status(400).json({ error: 'Router not configured for DHCP retry' });
            }

            // Get Proxmox client
            const currentProxmox = await getProxmoxClient();

            // Get MAC address and create reservation with current IP
            try {
              const networkConfig = await currentProxmox.getVMNetworkConfig(vmid);
              if (networkConfig.primaryMac) {
                const macAddress = networkConfig.primaryMac;
                
                // Get the current IP the VM has (not pre-assigned one)
                let vmIp = null;
                try {
                  vmIp = await currentProxmox.getGuestAgentIP(vmid);
                } catch (err) {
                  // If guest agent not available, try stored IP as fallback
                  vmIp = cloneStatus.ip_address;
                  if (!vmIp) {
                    throw new Error('Could not get VM IP from guest agent and no stored IP available');
                  }
                  console.log(`⚠️  Using stored IP ${vmIp} (guest agent not available)`);
                }

                console.log(`🔄 Retrying DHCP reservation: ${macAddress} → ${vmIp}`);

                result = await routerServicePost('/dhcp-reservation', {
                  host: routerHost,
                  username: routerUsername,
                  password: routerPassword,
                  useHttps: routerUseHttps,
                  mac: macAddress,
                  ip: vmIp,
                  name: cloneStatus.domain_name
                });

                if (result.success) {
                  await CloneStatus.completeStep(vmid, 'dhcp_reserved', { ipAddress: vmIp, macAddress });
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

        const proxmox = await getProxmoxClient();
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

        const proxmox = await getProxmoxClient();
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

        // Get Proxmox client for MAC lookup
        const retryProxmox = await getProxmoxClient();

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

        // Get server name from database before deletion (for velocity/dns cleanup)
        const managedServer = await ManagedServer.getServer(vmid);
        const serverName = managedServer?.server_name;

        console.log(`🗑️  Deleting server ${vmid} (${serverName})...`);
        
        // Try to delete from Proxmox (but don't fail if it doesn't exist)
        let taskId = null;
        try {
          const proxmox = await getProxmoxClient();
          taskId = await proxmox.deleteServer(vmid);
          console.log(`✓ Proxmox deletion initiated for ${vmid}`);
        } catch (proxmoxError) {
          if (proxmoxError.message.includes('not found') || proxmoxError.message.includes('No such element')) {
            console.warn(`⚠️  Server ${vmid} not found in Proxmox (may have been deleted externally) - continuing with cleanup`);
          } else {
            throw proxmoxError;
          }
        }
        
        // Remove from managed servers tracking (always do this)
        await ManagedServer.delete(vmid);
        console.log(`✓ Removed from managed servers database`);

        // Remove from Velocity server list if configured
        const velocity = await getVelocityClient();
        if (velocity.isConfigured() && serverName) {
          const velocityResult = await velocity.removeServer(serverName);
          if (!velocityResult.success) {
            console.warn(`⚠️  Could not remove from velocity: ${velocityResult.message}`);
          } else {
            console.log(`✓ Removed ${serverName} from Velocity`);
          }
        }

        // Remove DNS record if configured
        try {
          const dnsClients = await getAllDNSClients();
          if (dnsClients.length > 0 && serverName) {
            for (let i = 0; i < dnsClients.length; i++) {
              const dns = dnsClients[i];
              const serverLabel = dnsClients.length > 1 ? ` (server ${i + 1})` : '';
              console.log(`🗑️  Removing DNS record${serverLabel}: ${serverName}`);
              
              const dnsResult = await dns.removeARecord(serverName);
              if (!dnsResult.success) {
                console.warn(`⚠️  Could not remove DNS record${serverLabel}: ${dnsResult.message}`);
              } else {
                console.log(`✓ Removed DNS record${serverLabel} for ${serverName}`);
              }
            }
          }
        } catch (dnsError) {
          console.warn(`⚠️  Error removing DNS record: ${dnsError.message}`);
        }
        
        console.log(`✅ Server ${vmid} cleanup complete`);
        res.json({ success: true, taskId: taskId, message: 'Server removed from management' });
      } catch (error) {
        console.error('❌ Error deleting server:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Get task status (protected)
    app.get('/api/tasks/:taskId', verifyToken, async (req, res) => {
      try {
        const proxmox = await getProxmoxClient();
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

    // Manually setup fresh world (admin only - for debugging/recovery)
    app.post('/api/servers/:vmid/minecraft/setup-world', verifyToken, requireAdmin, async (req, res) => {
      try {
        const vmid = parseInt(req.params.vmid);
        const { ip, port, username, privateKey, minecraftPath, minecraftUser, seed } = req.body;

        if (!ip || !port || !username || !privateKey) {
          return res.status(400).json({ error: 'Missing SSH config: ip, port, username, privateKey required' });
        }

        const seedToUse = seed || Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
        
        // Create SSH client with provided config
        const ssh = new SSHClient({
          host: ip,
          port: port,
          username: username,
          privateKey: privateKey
        });

        // Test SSH connection first
        console.log(`🔍 Testing SSH connection to ${username}@${ip}:${port}...`);
        await ssh.executeCommand('echo "SSH connection test"');
        console.log(`✅ SSH connection successful!`);

        const manager = new MinecraftServerManager(
          ssh,
          minecraftPath || '/opt/minecraft',
          minecraftUser || 'minecraft'
        );

        console.log(`🌍 Setting up fresh world with seed ${seedToUse}...`);
        const result = await manager.setupFreshWorld(seedToUse);

        if (result.success) {
          console.log(`✅ World setup successful for VM ${vmid}`);
          
          // Restart the minecraft service to start with fresh world
          console.log(`🔄 Restarting minecraft.service with new world...`);
          try {
            await ssh.executeCommand('sudo -n systemctl restart minecraft.service');
            console.log(`✅ Service restart command sent`);
            // Wait a moment for service to start
            await new Promise(resolve => setTimeout(resolve, 3000));
          } catch (restartError) {
            console.warn(`⚠️  Service restart failed: ${restartError.message}`);
          }
          
          // Check minecraft.service status
          try {
            console.log(`🔍 Checking minecraft.service status...`);
            const serviceStatus = await ssh.executeCommand('systemctl status minecraft.service');
            const statusStr = typeof serviceStatus === 'string' ? serviceStatus : JSON.stringify(serviceStatus);
            console.log(`📊 Service status output:\n${statusStr}`);
            
            // Check if service is running
            let serviceRunning = false;
            if (statusStr.includes('active (running)') || statusStr.includes('active') && statusStr.includes('running')) {
              console.log(`✅ minecraft.service is running!`);
              serviceRunning = true;
            } else if (statusStr.includes('inactive')) {
              console.warn(`⚠️  minecraft.service is inactive`);
            } else {
              console.warn(`⚠️  minecraft.service status unknown`);
            }
            
            res.json({ success: true, seed: seedToUse, serviceRunning, message: 'World setup completed successfully' });
          } catch (serviceError) {
            console.warn(`⚠️  Could not check service status: ${serviceError.message}`);
            res.json({ success: true, seed: seedToUse, serviceRunning: null, message: 'World setup completed but could not verify service status' });
          }
        } else {
          console.warn(`⚠️  World setup had issues: ${result.message}`);
          res.status(400).json({ success: false, message: result.message });
        }
      } catch (error) {
        console.error(`❌ World setup failed: ${error.message}`);
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

      // Install QEMU guest agent on VM (for Proxmox IP reporting)
      app.post('/api/servers/:vmid/system/install-qemu-agent', verifyToken, requireAdmin, async (req, res) => {
        try {
          const vmid = parseInt(req.params.vmid);
          const { ip, port = 22, username = 'joseph', privateKey } = req.body;

          if (!ip || !privateKey) {
            return res.status(400).json({ 
              error: 'Missing required fields: ip, privateKey' 
            });
          }

          console.log(`🔧 Installing QEMU guest agent on VM ${vmid} (${ip})...`);
          const ssh = new SSHClient({ host: ip, port, username, privateKey });

          // Test connection first
          try {
            await ssh.executeCommand('echo "SSH connection test"');
          } catch (e) {
            console.error(`❌ SSH connection failed to ${ip}`);
            return res.status(500).json({ error: `SSH connection failed: ${e.message}` });
          }

          // Install and enable QEMU guest agent
          console.log(`📦 Installing package on ${ip}...`);
          const result = await ssh.executeCommand(
            'sudo apt-get update && sudo apt-get install -y qemu-guest-agent && sudo systemctl enable qemu-guest-agent && sudo systemctl restart qemu-guest-agent && echo "QEMU_AGENT_INSTALLED"'
          );

          console.log(`✅ QEMU guest agent installation output: ${result}`);

          // Update database with the correct SSH config
          try {
            const server = await ManagedServer.findById(vmid);
            if (server) {
              await pool.query(
                'UPDATE managed_servers SET ssh_host = $1 WHERE vmid = $2',
                [ip, vmid]
              );
              console.log(`✅ Updated SSH config in database for VM ${vmid} with IP ${ip}`);
            }
          } catch (dbError) {
            console.warn(`⚠️  Database update failed: ${dbError.message}`);
            // Don't fail the request - agent install was successful
          }

          res.json({
            success: true,
            message: 'QEMU guest agent installed successfully',
            vm: vmid,
            ip: ip,
            note: 'VM IP updated in database. Guest agent will report IP to Proxmox automatically.'
          });
        } catch (error) {
          console.error(`❌ Failed to install QEMU guest agent: ${error.message}`);
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
