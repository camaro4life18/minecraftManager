import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Create connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'minecraft_user',
  password: process.env.DB_PASSWORD || 'minecraft_password',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'minecraft_manager'
});

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database tables
export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    // Don't use transaction wrapper - each CREATE TABLE IF NOT EXISTS
    // is idempotent and safe to execute independently
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `).catch(err => console.warn('Create users table:', err.message));

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `).catch(err => console.warn('Create sessions table:', err.message));

    // Create server clones audit log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS server_clones (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        source_vmid INTEGER NOT NULL,
        new_vmid INTEGER NOT NULL,
        new_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending'
      )
    `).catch(err => console.warn('Create server_clones table:', err.message));

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `).catch(err => console.warn('Create index idx_users_username:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `).catch(err => console.warn('Create index idx_users_email:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)
    `).catch(err => console.warn('Create index idx_sessions_token:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `).catch(err => console.warn('Create index idx_sessions_user_id:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_server_clones_user_id ON server_clones(user_id)
    `).catch(err => console.warn('Create index idx_server_clones_user_id:', err.message));

    // Create managed servers table (tracks which user created each VM)
    await client.query(`
      CREATE TABLE IF NOT EXISTS managed_servers (
        id SERIAL PRIMARY KEY,
        vmid INTEGER UNIQUE NOT NULL,
        creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
        server_name VARCHAR(255) NOT NULL,
        seed TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(err => console.warn('Create managed_servers table:', err.message));

    // Add seed column if it doesn't exist (for existing databases)
    await client.query(`
      ALTER TABLE managed_servers ADD COLUMN seed TEXT
    `).catch(err => {
      // Column already exists or other error, that's fine
      if (!err.message.includes('already exists')) {
        console.warn('Add seed column:', err.message);
      }
    });

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_managed_servers_creator_id ON managed_servers(creator_id)
    `).catch(err => console.warn('Create index idx_managed_servers_creator_id:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_managed_servers_vmid ON managed_servers(vmid)
    `).catch(err => console.warn('Create index idx_managed_servers_vmid:', err.message));

    // Create app configuration table
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_config (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT NOT NULL,
        value_type VARCHAR(50) DEFAULT 'string',
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
      )
    `).catch(err => console.warn('Create app_config table:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_config_key ON app_config(key)
    `).catch(err => console.warn('Create index idx_app_config_key:', err.message));

    // Create error logs table for persistent error tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        error_type VARCHAR(100) NOT NULL,
        error_message TEXT NOT NULL,
        stack_trace TEXT,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        endpoint VARCHAR(255),
        method VARCHAR(10),
        ip_address VARCHAR(45),
        user_agent TEXT,
        request_body TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(err => console.warn('Create error_logs table:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC)
    `).catch(err => console.warn('Create index idx_error_logs_created_at:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_error_logs_user_id ON error_logs(user_id)
    `).catch(err => console.warn('Create index idx_error_logs_user_id:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_error_logs_error_type ON error_logs(error_type)
    `).catch(err => console.warn('Create index idx_error_logs_error_type:', err.message));

    // Create password reset tokens table
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(255) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(err => console.warn('Create password_reset_tokens table:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token)
    `).catch(err => console.warn('Create index idx_password_reset_tokens_token:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id)
    `).catch(err => console.warn('Create index idx_password_reset_tokens_user_id:', err.message));

    // Create API metrics table for basic performance monitoring
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_metrics (
        id SERIAL PRIMARY KEY,
        endpoint VARCHAR(255) NOT NULL,
        method VARCHAR(10) NOT NULL,
        response_time INTEGER NOT NULL,
        status_code INTEGER NOT NULL,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(err => console.warn('Create api_metrics table:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_metrics_created_at ON api_metrics(created_at DESC)
    `).catch(err => console.warn('Create index idx_api_metrics_created_at:', err.message));

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_metrics_endpoint ON api_metrics(endpoint)
    `).catch(err => console.warn('Create index idx_api_metrics_endpoint:', err.message));

    console.log('✓ Database initialized');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// User management functions
export const User = {
  create: async (username, email, passwordHash, role = 'user') => {
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id',
      [username, email, passwordHash, role]
    );
    return result.rows[0].id;
  },

  findById: async (id) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  findByUsername: async (username) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    return result.rows[0];
  },

  findByEmail: async (email) => {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  },

  updateLastLogin: async (userId) => {
    await pool.query(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [userId]
    );
  },

  getAll: async () => {
    const result = await pool.query(
      'SELECT id, username, email, role, created_at, last_login FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  },

  updateRole: async (userId, role) => {
    await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2',
      [role, userId]
    );
  },

  delete: async (userId) => {
    await pool.query(
      'DELETE FROM users WHERE id = $1',
      [userId]
    );
  }
};

// Session management
export const Session = {
  create: async (userId, token, expiresAt) => {
    const result = await pool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [userId, token, expiresAt]
    );
    return result.rows[0].id;
  },

  findByToken: async (token) => {
    const result = await pool.query(
      'SELECT s.id, s.user_id, s.token, s.created_at, s.expires_at, u.username, u.role ' +
      'FROM sessions s JOIN users u ON s.user_id = u.id ' +
      'WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP',
      [token]
    );
    return result.rows[0];
  },

  revoke: async (token) => {
    await pool.query(
      'DELETE FROM sessions WHERE token = $1',
      [token]
    );
  },

  revokeAllForUser: async (userId) => {
    await pool.query(
      'DELETE FROM sessions WHERE user_id = $1',
      [userId]
    );
  },

  cleanup: async () => {
    // Delete expired sessions
    await pool.query(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );
  }
};

// Server clone audit log
export const ServerCloneLog = {
  create: async (userId, sourceVmId, newVmId, newName, status = 'pending') => {
    const result = await pool.query(
      'INSERT INTO server_clones (user_id, source_vmid, new_vmid, new_name, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, sourceVmId, newVmId, newName, status]
    );
    return result.rows[0].id;
  },

  getByUser: async (userId) => {
    const result = await pool.query(
      'SELECT * FROM server_clones WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  },

  getAll: async () => {
    const result = await pool.query(
      'SELECT * FROM server_clones ORDER BY created_at DESC'
    );
    return result.rows;
  },

  updateStatus: async (id, status) => {
    await pool.query(
      'UPDATE server_clones SET status = $1 WHERE id = $2',
      [status, id]
    );
  }
};

// Managed servers (tracks creator of each VM)
export const ManagedServer = {
  create: async (vmId, creatorId, serverName, seed = null) => {
    const result = await pool.query(
      'INSERT INTO managed_servers (vmid, creator_id, server_name, seed) VALUES ($1, $2, $3, $4) ON CONFLICT (vmid) DO UPDATE SET creator_id = $2, server_name = $3, seed = $4 RETURNING id',
      [vmId, creatorId, serverName, seed]
    );
    return result.rows[0].id;
  },

  getCreator: async (vmId) => {
    const result = await pool.query(
      'SELECT creator_id FROM managed_servers WHERE vmid = $1',
      [vmId]
    );
    return result.rows[0]?.creator_id || null;
  },

  getServer: async (vmId) => {
    const result = await pool.query(
      'SELECT * FROM managed_servers WHERE vmid = $1',
      [vmId]
    );
    return result.rows[0] || null;
  },

  getByCreator: async (creatorId) => {
    const result = await pool.query(
      'SELECT * FROM managed_servers WHERE creator_id = $1 ORDER BY created_at DESC',
      [creatorId]
    );
    return result.rows;
  },

  updateSeed: async (vmId, seed) => {
    await pool.query(
      'UPDATE managed_servers SET seed = $1 WHERE vmid = $2',
      [seed, vmId]
    );
  },

  delete: async (vmId) => {
    await pool.query(
      'DELETE FROM managed_servers WHERE vmid = $1',
      [vmId]
    );
  }
};

// Application configuration
export const AppConfig = {
  get: async (key) => {
    const result = await pool.query(
      'SELECT value, value_type FROM app_config WHERE key = $1',
      [key]
    );
    if (!result.rows[0]) return null;
    
    const { value, value_type } = result.rows[0];
    // Parse JSON values
    if (value_type === 'json') {
      return JSON.parse(value);
    }
    return value;
  },

  set: async (key, value, userId, description = null, valueType = 'string') => {
    const valueStr = valueType === 'json' ? JSON.stringify(value) : value;
    const result = await pool.query(
      'INSERT INTO app_config (key, value, value_type, description, updated_by) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key) DO UPDATE SET value = $2, value_type = $3, description = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP RETURNING id',
      [key, valueStr, valueType, description, userId]
    );
    return result.rows[0].id;
  },

  getAll: async () => {
    const result = await pool.query(
      'SELECT key, value, value_type, description, updated_at FROM app_config ORDER BY key'
    );
    const config = {};
    result.rows.forEach(row => {
      const value = row.value_type === 'json' ? JSON.parse(row.value) : row.value;
      config[row.key] = { value, type: row.value_type, description: row.description };
    });
    return config;
  },

  delete: async (key) => {
    await pool.query(
      'DELETE FROM app_config WHERE key = $1',
      [key]
    );
  }
};

// Error logging
export const ErrorLog = {
  create: async (errorType, errorMessage, stackTrace, userId, endpoint, method, ipAddress, userAgent, requestBody) => {
    const result = await pool.query(
      'INSERT INTO error_logs (error_type, error_message, stack_trace, user_id, endpoint, method, ip_address, user_agent, request_body) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id',
      [errorType, errorMessage, stackTrace, userId, endpoint, method, ipAddress, userAgent, requestBody]
    );
    return result.rows[0].id;
  },

  getAll: async (limit = 100, offset = 0, filters = {}) => {
    let query = 'SELECT e.*, u.username FROM error_logs e LEFT JOIN users u ON e.user_id = u.id WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.errorType) {
      query += ` AND e.error_type = $${paramIndex}`;
      params.push(filters.errorType);
      paramIndex++;
    }

    if (filters.userId) {
      query += ` AND e.user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND e.created_at >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND e.created_at <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    query += ` ORDER BY e.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  },

  getCount: async (filters = {}) => {
    let query = 'SELECT COUNT(*) FROM error_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (filters.errorType) {
      query += ` AND error_type = $${paramIndex}`;
      params.push(filters.errorType);
      paramIndex++;
    }

    if (filters.userId) {
      query += ` AND user_id = $${paramIndex}`;
      params.push(filters.userId);
      paramIndex++;
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count);
  },

  deleteOlderThan: async (days) => {
    await pool.query(
      'DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL \'$1 days\'',
      [days]
    );
  }
};

// Password reset tokens
export const PasswordResetToken = {
  create: async (userId, token, expiresAt) => {
    const result = await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3) RETURNING id',
      [userId, token, expiresAt]
    );
    return result.rows[0].id;
  },

  findByToken: async (token) => {
    const result = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND expires_at > CURRENT_TIMESTAMP AND used = FALSE',
      [token]
    );
    return result.rows[0];
  },

  markAsUsed: async (token) => {
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE token = $1',
      [token]
    );
  },

  deleteExpired: async () => {
    await pool.query(
      'DELETE FROM password_reset_tokens WHERE expires_at < CURRENT_TIMESTAMP OR used = TRUE'
    );
  }
};

// API metrics
export const ApiMetric = {
  create: async (endpoint, method, responseTime, statusCode, userId) => {
    const result = await pool.query(
      'INSERT INTO api_metrics (endpoint, method, response_time, status_code, user_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [endpoint, method, responseTime, statusCode, userId]
    );
    return result.rows[0].id;
  },

  getStats: async (endpoint = null, hours = 24) => {
    const query = endpoint
      ? 'SELECT AVG(response_time) as avg_time, MIN(response_time) as min_time, MAX(response_time) as max_time, COUNT(*) as count FROM api_metrics WHERE endpoint = $1 AND created_at > NOW() - INTERVAL \'$2 hours\''
      : 'SELECT AVG(response_time) as avg_time, MIN(response_time) as min_time, MAX(response_time) as max_time, COUNT(*) as count FROM api_metrics WHERE created_at > NOW() - INTERVAL \'$1 hours\'';
    
    const params = endpoint ? [endpoint, hours] : [hours];
    const result = await pool.query(query, params);
    return result.rows[0];
  },

  deleteOlderThan: async (days) => {
    await pool.query(
      'DELETE FROM api_metrics WHERE created_at < NOW() - INTERVAL \'$1 days\'',
      [days]
    );
  }
};

// Get pool for direct queries if needed
export { pool };

export default pool;
