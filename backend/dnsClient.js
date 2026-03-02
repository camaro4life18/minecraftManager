import RemoteServiceClient from './remoteServiceClient.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class DNSClient extends RemoteServiceClient {
  constructor(config = {}) {
    // Initialize base class with SSH config
    super({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKeyPath: config.privateKeyPath,
      privateKey: config.privateKey,
      serviceId: 'dns'
    });

    // DNS-specific configuration
    this.zone = config.zone;
    this.zoneFile = config.zoneFile;
    this.sudoPassword = config.sudoPassword;
  }

  isConfigured() {
    return !!(this.host && this.zone);
  }

  async _execOrThrow(ssh, command, step) {
    const result = await ssh.executeCommand(command);
    if (result.code !== 0) {
      throw new Error(`${step} failed (exit ${result.code}): ${result.stderr || result.stdout || 'Unknown error'}`);
    }
    return result;
  }

  _buildSudoCommand(command) {
    if (this.sudoPassword) {
      // Use printf to avoid issues with special characters in heredoc
      // Pass password to sudo via stdin with -S flag
      return `printf '%s\n' '${this.sudoPassword.replace(/'/g, "'\"'\"'")}' | sudo -S -p '' ${command}`;
    }

    // Fallback to no-password sudo (requires NOPASSWD in sudoers)
    return `sudo -n ${command}`;
  }

  /**
   * Add an A record to the DNS zone
   */
  async addARecord(hostname, ipAddress) {
    console.log(`\n📝 [DNS] Starting addARecord: hostname=${hostname}, ip=${ipAddress}`);
    
    if (!this.isConfigured()) {
      console.warn('⚠️  [DNS] Not configured (missing host or zone). Skipping DNS setup.');
      return { success: false, message: 'DNS not configured' };
    }

    console.log(`✓ [DNS] DNS configured: host=${this.host}, zone=${this.zone}, zoneFile=${this.zoneFile}`);

    try {
      console.log(`🔗 [DNS] Creating SSH client to ${this.username}@${this.host}:${this.port}...`);
      const ssh = this._getSSHClient();
      console.log(`✓ [DNS] SSH client created successfully`);

      // First, check if the record already exists
      const checkCmd = `grep -q "^${hostname}\\.${this.zone}\\." ${this.zoneFile} && echo "EXISTS" || echo "NOT_EXISTS"`;
      console.log(`🔍 [DNS] Checking if record exists: ${checkCmd}`);
      const checkResult = await ssh.executeCommand(checkCmd);
      const exists = checkResult.stdout.trim() === 'EXISTS';
      console.log(`[DNS] Record exists check result: ${exists ? 'YES' : 'NO'}`);

      if (exists) {
        console.log(`✓ [DNS] DNS record already exists for ${hostname}`);
        return { success: true, message: 'DNS record already exists' };
      }

      // Create backup
      console.log(`💾 [DNS] Creating backup of zone file...`);
      await this._execOrThrow(ssh, this._buildSudoCommand(`cp ${this.zoneFile} ${this.zoneFile}.backup`), 'Zone backup');
      console.log(`✓ [DNS] Backup created`);

      // Add the new A record at the end of the file with proper BIND format
      // Format: hostname.zone.     IN      A       ipAddress
      const fqdn = `${hostname}.${this.zone}.`;
      const addCmd = this._buildSudoCommand(`tee -a ${this.zoneFile} > /dev/null <<'EOF'\n${fqdn}\tIN\tA\t${ipAddress}\nEOF`);
      console.log(`✍️  [DNS] Adding record with command: ${addCmd}`);
      await this._execOrThrow(ssh, addCmd, 'Add DNS record');
      console.log(`✓ [DNS] Record added to zone file`);

      // Increment SOA serial number (format: YYYYMMDDNN)
      console.log(`🔢 [DNS] Updating SOA serial number...`);
      const today = new Date();
      const datePrefix = today.getFullYear().toString() + 
                         (today.getMonth() + 1).toString().padStart(2, '0') + 
                         today.getDate().toString().padStart(2, '0');
      
      // Get current serial and increment the revision number
      const getSerialCmd = `grep -Eo '^[[:space:]]*[0-9]{10}[[:space:]]*$' ${this.zoneFile} | head -1 | tr -d '[:space:]'`;
      const serialResult = await this._execOrThrow(ssh, getSerialCmd, 'Read SOA serial');
      const currentSerial = serialResult.stdout.trim();
      console.log(`[DNS] Current serial: ${currentSerial}`);

      if (!currentSerial) {
        throw new Error('Could not find current SOA serial in zone file');
      }
      
      let newSerial;
      if (currentSerial.startsWith(datePrefix)) {
        // Same day, increment revision number
        const revision = parseInt(currentSerial.slice(-2)) + 1;
        newSerial = datePrefix + revision.toString().padStart(2, '0');
      } else {
        // New day, start at 00
        newSerial = datePrefix + '00';
      }

      const serialCmd = this._buildSudoCommand(`sed -i '0,/${currentSerial}/s//${newSerial}/' ${this.zoneFile}`);
      console.log(`🔄 [DNS] Updating serial: ${currentSerial} -> ${newSerial}`);
      await this._execOrThrow(ssh, serialCmd, 'Update SOA serial');
      console.log(`✓ [DNS] Serial updated successfully`);

      // Reload the zone
      console.log(`🔄 [DNS] Reloading DNS zone...`);
      const reloadCmd = this._buildSudoCommand(`rndc reload ${this.zone} 2>/dev/null || systemctl reload bind9 2>/dev/null || systemctl reload named 2>/dev/null`);
      await this._execOrThrow(ssh, reloadCmd, 'Reload DNS zone');
      console.log(`✓ [DNS] Zone reloaded successfully\n`);
      
      return { success: true, message: 'DNS record added and zone reloaded' };
    } catch (error) {
      console.error(`\n❌ [DNS] Error adding DNS record: ${error.message}\n`);
      return {
        success: false,
        message: `Could not update DNS: ${error.message}`,
        partialSuccess: true // Clone succeeded even though DNS failed
      };
    }
  }

  /**
   * Remove an A record from the DNS zone
   */
  async removeARecord(hostname) {
    if (!this.isConfigured()) {
      return { success: false, message: 'DNS not configured' };
    }

    try {
      console.log(`🗑️  Removing DNS record: ${hostname}.${this.zone}`);

      const ssh = this._getSSHClient();

      // Create backup
      await this._execOrThrow(ssh, this._buildSudoCommand(`cp ${this.zoneFile} ${this.zoneFile}.backup`), 'Zone backup');

      // Remove the record - match full FQDN
      const fqdn = `${hostname}.${this.zone}.`;
      const removeCmd = this._buildSudoCommand(`sed -i '/^${fqdn.replace(/\./g, '\\.')}/d' ${this.zoneFile}`);
      await this._execOrThrow(ssh, removeCmd, 'Remove DNS record');

      // Increment SOA serial number (same logic as addARecord)
      const today = new Date();
      const datePrefix = today.getFullYear().toString() + 
                         (today.getMonth() + 1).toString().padStart(2, '0') + 
                         today.getDate().toString().padStart(2, '0');
      
      const getSerialCmd = `grep -Eo '^[[:space:]]*[0-9]{10}[[:space:]]*$' ${this.zoneFile} | head -1 | tr -d '[:space:]'`;
      const serialResult = await this._execOrThrow(ssh, getSerialCmd, 'Read SOA serial');
      const currentSerial = serialResult.stdout.trim();

      if (!currentSerial) {
        throw new Error('Could not find current SOA serial in zone file');
      }
      
      let newSerial;
      if (currentSerial.startsWith(datePrefix)) {
        const revision = parseInt(currentSerial.slice(-2)) + 1;
        newSerial = datePrefix + revision.toString().padStart(2, '0');
      } else {
        newSerial = datePrefix + '00';
      }

      const serialCmd = this._buildSudoCommand(`sed -i '0,/${currentSerial}/s//${newSerial}/' ${this.zoneFile}`);
      await this._execOrThrow(ssh, serialCmd, 'Update SOA serial');

      // Reload the zone
      const reloadCmd = this._buildSudoCommand(`rndc reload ${this.zone} 2>/dev/null || systemctl reload bind9 2>/dev/null || systemctl reload named 2>/dev/null`);
      await this._execOrThrow(ssh, reloadCmd, 'Reload DNS zone');

      console.log(`✓ DNS record removed for ${hostname}`);
      return { success: true };
    } catch (error) {
      console.error('⚠️  Error removing DNS record:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get list of A records from zone file
   */
  async listARecords() {
    if (!this.isConfigured()) {
      return { records: [] };
    }

    try {
      const ssh = this._getSSHClient();

      // Extract A records (lines with format: hostname A ip)
      const listCmd = `grep -E '^[a-zA-Z0-9_-]+ A ' ${this.zoneFile}`;
      const result = await ssh.executeCommand(listCmd);

      const records = [];
      const lines = result.stdout.trim().split('\n').filter(l => l);

      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)\s+A\s+([0-9.]+)/);
        if (match) {
          records.push({
            hostname: match[1],
            ipAddress: match[2]
          });
        }
      }

      return { records };
    } catch (error) {
      console.error('⚠️  Error fetching DNS records:', error.message);
      return { records: [] };
    }
  }
}

export default DNSClient;
