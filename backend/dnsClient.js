import SSHClient from './sshClient.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class DNSClient {
  constructor(config = {}) {
    // DNS server connection details
    this.host = config.host || process.env.DNS_HOST;
    this.port = config.port || process.env.DNS_PORT || 22;
    this.username = config.username || process.env.DNS_USER;
    this.zone = config.zone || process.env.DNS_ZONE;
    this.zoneFile = config.zoneFile || process.env.DNS_ZONE_FILE;
    this.privateKeyPath = config.privateKeyPath || process.env.DNS_SSH_KEY;
    this.privateKey = config.privateKey;  // Allow private key to be passed directly
    this.password = config.password; // For initial setup
  }

  isConfigured() {
    return !!(this.host && this.zone);
  }

  /**
   * Generate SSH key pair if it doesn't exist
   */
  async generateSSHKey() {
    try {
      // Use temp directory for key generation since /root/.ssh is not persistent in container
      const tempKeyPath = `/tmp/dns_ssh_key_${Date.now()}`;
      
      console.log(`🔑 Generating SSH key pair at ${tempKeyPath}...`);
      
      // Generate RSA key pair without passphrase
      await execAsync(
        `ssh-keygen -t rsa -b 4096 -f "${tempKeyPath}" -N "" -C "minecraft-manager-dns"`
      );

      console.log('✓ SSH key pair generated successfully');
      return tempKeyPath;
    } catch (error) {
      throw new Error(`Failed to generate SSH key: ${error.message}`);
    }
  }

  /**
   * Setup SSH key authentication using password
   */
  async setupSSHKeyAuth() {
    if (!this.password) {
      throw new Error('Password is required for initial SSH key setup');
    }

    let tempKeyPath = null;

    try {
      // Generate a temporary SSH key
      tempKeyPath = await this.generateSSHKey();

      // Read the public key
      const publicKey = fs.readFileSync(`${tempKeyPath}.pub`, 'utf8').trim();

      console.log(`🔐 Setting up SSH key authentication for ${this.username}@${this.host}...`);

      // Ensure sshpass is available
      try {
        await execAsync(`which sshpass`);
      } catch {
        console.log('📦 Installing sshpass...');
        await execAsync('apk add --no-cache sshpass');
      }

      // Use sshpass to copy public key to DNS server
      const copyKeyCmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo SSH_KEY_INSTALLED`;
      
      const result = await execAsync(
        `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -p ${this.port} ${this.username}@${this.host} "${copyKeyCmd}"`
      );

      if (!result.stdout.includes('SSH_KEY_INSTALLED')) {
        throw new Error('Key installation verification failed');
      }

      console.log('✓ SSH key installed on DNS server');

      // Step 2: Retrieve the private key from DNS server and store in database
      // This is done via a separate endpoint call, not here
      // For now, user should call /api/admin/config/store-dns-ssh-key

      return { success: true, message: 'SSH key authentication configured. Now retrieve and store the private key via /api/admin/config/store-dns-ssh-key' };
    } catch (error) {
      console.error('❌ SSH key setup failed:', error.message);
      throw error;
    } finally {
      // Clean up temporary key files
      if (tempKeyPath) {
        try {
          await execAsync(`rm -f "${tempKeyPath}" "${tempKeyPath}.pub"`);
          console.log('✓ Cleaned up temporary SSH key files');
        } catch (cleanupError) {
          console.warn('⚠️  Failed to clean up temporary SSH key files:', cleanupError.message);
        }
      }
    }
  }

  /**
   * Test connection with password (before key setup)
   */
  async testPasswordConnection() {
    if (!this.password) {
      throw new Error('Password is required');
    }

    try {
      // Check if sshpass is available
      try {
        await execAsync('which sshpass');
      } catch {
        await execAsync('apk add --no-cache sshpass');
      }

      const result = await execAsync(
        `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p ${this.port} ${this.username}@${this.host} "echo DNS_CONNECTION_OK"`
      );

      if (result.stdout.includes('DNS_CONNECTION_OK')) {
        return { success: true, message: 'Password authentication successful' };
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      throw new Error(`Password authentication failed: ${error.message}`);
    }
  }

  /**
   * Get SSH client for DNS server
   */
  _getSSHClient() {
    let privateKey;
    
    // Try to use private key from config first (from database)
    if (this.privateKey) {
      console.log(`✓ Using DNS private key from database`);
      privateKey = this.privateKey;
    } else if (this.privateKeyPath) {
      // Fall back to reading from file
      console.log(`📖 Reading DNS private key from file: ${this.privateKeyPath}`);
      try {
        privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
      } catch (error) {
        throw new Error(`Cannot read SSH private key at ${this.privateKeyPath}: ${error.message}`);
      }
    } else {
      throw new Error(`No DNS SSH private key available (not in database or file)`);
    }

    return new SSHClient({
      host: this.host,
      port: this.port,
      username: this.username,
      privateKey: privateKey
    });
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
      await ssh.executeCommand(`sudo cp ${this.zoneFile} ${this.zoneFile}.backup`);
      console.log(`✓ [DNS] Backup created`);

      // Add the new A record at the end of the file with proper BIND format
      // Format: hostname.zone.     IN      A       ipAddress
      const fqdn = `${hostname}.${this.zone}.`;
      const addCmd = `echo "${fqdn}\tIN\tA\t${ipAddress}" | sudo tee -a ${this.zoneFile} > /dev/null`;
      console.log(`✍️  [DNS] Adding record with command: ${addCmd}`);
      await ssh.executeCommand(addCmd);
      console.log(`✓ [DNS] Record added to zone file`);

      // Increment SOA serial number (format: YYYYMMDDNN)
      console.log(`🔢 [DNS] Updating SOA serial number...`);
      const today = new Date();
      const datePrefix = today.getFullYear().toString() + 
                         (today.getMonth() + 1).toString().padStart(2, '0') + 
                         today.getDate().toString().padStart(2, '0');
      
      // Get current serial and increment the revision number
      const getSerialCmd = `grep -oP '(?<=SOA\\s+\\S+\\s+\\S+\\s+\\(\\s+)\\d+' ${this.zoneFile} | head -1`;
      const serialResult = await ssh.executeCommand(getSerialCmd);
      const currentSerial = serialResult.stdout.trim();
      console.log(`[DNS] Current serial: ${currentSerial}`);
      
      let newSerial;
      if (currentSerial.startsWith(datePrefix)) {
        // Same day, increment revision number
        const revision = parseInt(currentSerial.slice(-2)) + 1;
        newSerial = datePrefix + revision.toString().padStart(2, '0');
      } else {
        // New day, start at 00
        newSerial = datePrefix + '00';
      }

      const serialCmd = `sudo sed -i 's/${currentSerial}/${newSerial}/' ${this.zoneFile}`;
      console.log(`🔄 [DNS] Updating serial: ${currentSerial} -> ${newSerial}`);
      await ssh.executeCommand(serialCmd);
      console.log(`✓ [DNS] Serial updated successfully`);

      // Reload the zone
      console.log(`🔄 [DNS] Reloading DNS zone...`);
      const reloadCmd = 'sudo rndc reload zanarkand.site 2>/dev/null || sudo systemctl reload bind9 2>/dev/null || sudo systemctl reload named 2>/dev/null';
      await ssh.executeCommand(reloadCmd);
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
      await ssh.executeCommand(`sudo cp ${this.zoneFile} ${this.zoneFile}.backup`);

      // Remove the record - match full FQDN
      const fqdn = `${hostname}.${this.zone}.`;
      const removeCmd = `sudo sed -i '/^${fqdn.replace(/\./g, '\\.')}/d' ${this.zoneFile}`;
      await ssh.executeCommand(removeCmd);

      // Increment SOA serial number (same logic as addARecord)
      const today = new Date();
      const datePrefix = today.getFullYear().toString() + 
                         (today.getMonth() + 1).toString().padStart(2, '0') + 
                         today.getDate().toString().padStart(2, '0');
      
      const getSerialCmd = `grep -oP '(?<=SOA\\s+\\S+\\s+\\S+\\s+\\(\\s+)\\d+' ${this.zoneFile} | head -1`;
      const serialResult = await ssh.executeCommand(getSerialCmd);
      const currentSerial = serialResult.stdout.trim();
      
      let newSerial;
      if (currentSerial.startsWith(datePrefix)) {
        const revision = parseInt(currentSerial.slice(-2)) + 1;
        newSerial = datePrefix + revision.toString().padStart(2, '0');
      } else {
        newSerial = datePrefix + '00';
      }

      const serialCmd = `sudo sed -i 's/${currentSerial}/${newSerial}/' ${this.zoneFile}`;
      await ssh.executeCommand(serialCmd);

      // Reload the zone
      const reloadCmd = 'sudo rndc reload zanarkand.site 2>/dev/null || sudo systemctl reload bind9 2>/dev/null || sudo systemctl reload named 2>/dev/null';
      await ssh.executeCommand(reloadCmd);

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
