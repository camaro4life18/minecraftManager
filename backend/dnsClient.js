import SSHClient from './sshClient.js';
import fs from 'fs';

class DNSClient {
  constructor(config = {}) {
    // DNS server connection details
    this.host = config.host || process.env.DNS_HOST || '192.168.1.240';
    this.port = config.port || process.env.DNS_PORT || 22;
    this.username = config.username || process.env.DNS_USER || 'root';
    this.zone = config.zone || process.env.DNS_ZONE || 'zanarkand.site';
    this.zoneFile = config.zoneFile || process.env.DNS_ZONE_FILE || '/etc/bind/zones/zanarkand.site';
    this.privateKeyPath = config.privateKeyPath || process.env.DNS_SSH_KEY || '/root/.ssh/id_rsa';
  }

  isConfigured() {
    return !!(this.host && this.zone);
  }

  /**
   * Get SSH client for DNS server
   */
  _getSSHClient() {
    let privateKey;
    try {
      privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
    } catch (error) {
      throw new Error(`Cannot read SSH private key at ${this.privateKeyPath}: ${error.message}`);
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
    if (!this.isConfigured()) {
      console.warn('⚠️  DNS not configured. Skipping DNS setup.');
      return { success: false, message: 'DNS not configured' };
    }

    try {
      console.log(`📝 Adding DNS record: ${hostname}.${this.zone} -> ${ipAddress}`);

      const ssh = this._getSSHClient();

      // First, check if the record already exists
      const checkCmd = `grep -q "^${hostname}" ${this.zoneFile} && echo "EXISTS" || echo "NOT_EXISTS"`;
      const checkResult = await ssh.executeCommand(checkCmd);
      const exists = checkResult.stdout.trim() === 'EXISTS';

      if (exists) {
        console.log(`✓ DNS record already exists for ${hostname}`);
        return { success: true, message: 'DNS record already exists' };
      }

      // Create backup
      await ssh.executeCommand(`sudo cp ${this.zoneFile} ${this.zoneFile}.backup`);

      // Add the new A record after the last minecraft entry or at the end of [servers] section
      // Insert before the "try" section if it exists
      const addCmd = `sudo sed -i '/^# In what order/i ${hostname} A ${ipAddress}' ${this.zoneFile}`;
      await ssh.executeCommand(addCmd);

      console.log(`✓ Added DNS record: ${hostname} -> ${ipAddress}`);

      // Increment SOL serial number for zone file
      const now = Math.floor(Date.now() / 1000);
      const serialCmd = `sudo sed -i 's/^; Serial: .*/; Serial: ${now}/' ${this.zoneFile}`;
      try {
        await ssh.executeCommand(serialCmd);
      } catch {
        // Serial update might fail if format is different, that's ok
      }

      // Reload the zone
      console.log('🔄 Reloading DNS zone...');
      const reloadCmd = 'sudo rndc reload zanarkand.site 2>/dev/null || sudo systemctl reload bind9 2>/dev/null || sudo systemctl reload named 2>/dev/null';
      await ssh.executeCommand(reloadCmd);

      console.log('✓ DNS zone reloaded successfully');
      return { success: true, message: 'DNS record added and zone reloaded' };
    } catch (error) {
      console.error('⚠️  DNS configuration error:', error.message);
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

      // Remove the record
      const removeCmd = `sudo sed -i '/^${hostname}[ \\t]/d' ${this.zoneFile}`;
      await ssh.executeCommand(removeCmd);

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
