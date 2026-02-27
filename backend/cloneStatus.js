import { pool } from './database.js';

export class CloneStatus {
  // Create a new clone status record
  static async create(vmid, creatorId, domainName, sourceVmid) {
    const result = await pool.query(
      `INSERT INTO clone_status 
       (vmid, creator_id, domain_name, source_vmid, status, current_step, updated_at)
       VALUES ($1, $2, $3, $4, 'in-progress', 'initializing', CURRENT_TIMESTAMP)
       RETURNING *`,
      [vmid, creatorId, domainName, sourceVmid]
    );
    return result.rows[0];
  }

  // Get clone status by VM ID
  static async getByVmId(vmid) {
    const result = await pool.query(
      `SELECT * FROM clone_status WHERE vmid = $1`,
      [vmid]
    );
    return result.rows[0];
  }

  // Get clone status by ID
  static async getById(id) {
    const result = await pool.query(
      `SELECT * FROM clone_status WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  // Get all clone statuses for a user
  static async getByCreator(creatorId) {
    const result = await pool.query(
      `SELECT * FROM clone_status 
       WHERE creator_id = $1 
       ORDER BY created_at DESC`,
      [creatorId]
    );
    return result.rows;
  }

  // Update clone step
  static async updateStep(vmid, currentStep, progressPercent = null) {
    let query = `UPDATE clone_status 
       SET current_step = $1, updated_at = CURRENT_TIMESTAMP`;
    const params = [currentStep, vmid];
    
    if (progressPercent !== null) {
      query += `, progress_percent = $3`;
      params.push(progressPercent);
    }
    
    query += ` WHERE vmid = $2 RETURNING *`;
    
    const result = await pool.query(query, params);
    return result.rows[0];
  }

  // Mark step as complete
  static async completeStep(vmid, step, details = {}) {
    const updateFields = {
      vm_cloned: 'vm_cloned = true',
      ssh_configured: 'ssh_configured = true',
      world_setup: 'world_setup = true',
      dhcp_reserved: 'dhcp_reserved = true',
      velocity_added: 'velocity_added = true'
    };

    const field = updateFields[step];
    if (!field) {
      throw new Error(`Unknown step: ${step}`);
    }

    let query = `UPDATE clone_status 
                 SET ${field}, updated_at = CURRENT_TIMESTAMP`;
    const params = [vmid];

    if (details.ipAddress) {
      query += `, ip_address = $2`;
      params[1] = details.ipAddress;
    }
    if (details.macAddress) {
      const paramIndex = details.ipAddress ? 3 : 2;
      query += `, mac_address = $${paramIndex}`;
      params[paramIndex - 1] = details.macAddress;
    }

    query += ` WHERE vmid = $1 RETURNING *`;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  // Mark clone as completed
  static async markComplete(vmid) {
    const result = await pool.query(
      `UPDATE clone_status 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE vmid = $1
       RETURNING *`,
      [vmid]
    );
    return result.rows[0];
  }

  // Mark clone as failed
  static async markFailed(vmid, errorMessage, errorStep) {
    const result = await pool.query(
      `UPDATE clone_status 
       SET status = 'failed', error_message = $1, error_step = $2, updated_at = CURRENT_TIMESTAMP
       WHERE vmid = $1
       RETURNING *`,
      [vmid, errorMessage, errorStep]
    );
    return result.rows[0];
  }

  // Mark clone as paused (waiting for user action)
  static async markPaused(vmid, reason, step) {
    const result = await pool.query(
      `UPDATE clone_status 
       SET status = 'paused', error_message = $1, error_step = $2, updated_at = CURRENT_TIMESTAMP
       WHERE vmid = $3
       RETURNING *`,
      [reason, step, vmid]
    );
    return result.rows[0];
  }

  // Resume a paused clone
  static async resume(vmid) {
    const result = await pool.query(
      `UPDATE clone_status 
       SET status = 'in-progress', error_message = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE vmid = $1
       RETURNING *`,
      [vmid]
    );
    return result.rows[0];
  }

  // Get clone history for admin or user
  static async getHistory(userId, isAdmin = false) {
    if (isAdmin) {
      const result = await pool.query(
        `SELECT cs.*, u.username FROM clone_status cs
         LEFT JOIN users u ON cs.creator_id = u.id
         ORDER BY cs.created_at DESC LIMIT 100`
      );
      return result.rows;
    } else {
      const result = await pool.query(
        `SELECT * FROM clone_status 
         WHERE creator_id = $1 
         ORDER BY created_at DESC LIMIT 50`,
        [userId]
      );
      return result.rows;
    }
  }

  // Get pending/failed clones that can be retried
  static async getRetryable(userId) {
    const result = await pool.query(
      `SELECT * FROM clone_status 
       WHERE creator_id = $1 AND status IN ('failed', 'paused')
       ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows;
  }
}

export default CloneStatus;
