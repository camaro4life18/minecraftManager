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
    await client.query('BEGIN');

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
    `);

    // Create sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(500) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL
      )
    `);

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
    `);

    // Create indexes for better query performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_server_clones_user_id ON server_clones(user_id)
    `);

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
    `);

    // Add seed column if it doesn't exist (for existing databases)
    try {
      await client.query(`
        ALTER TABLE managed_servers ADD COLUMN seed TEXT
      `);
    } catch (e) {
      // Column already exists, that's fine
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_managed_servers_creator_id ON managed_servers(creator_id)
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_managed_servers_vmid ON managed_servers(vmid)
    `);

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
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_app_config_key ON app_config(key)
    `);

    await client.query('COMMIT');
    console.log('✓ Database initialized');
  } catch (error) {
    await client.query('ROLLBACK');
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

// Get pool for direct queries if needed
export { pool };

export default pool;
