import SSHClient from './sshClient.js';
import dotenv from 'dotenv';
import fs from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);
dotenv.config();

class VelocityClient {
  constructor(config = {}) {
    // SSH connection details for Velocity server
    this.host = config.host || process.env.VELOCITY_HOST;
    this.port = config.port || process.env.VELOCITY_SSH_PORT || 22;
    this.username = config.username || process.env.VELOCITY_SSH_USER || 'joseph';
    this.password = config.password; // For initial setup only
    this.privateKeyPath = config.privateKeyPath || process.env.VELOCITY_SSH_KEY || '/root/.ssh/id_rsa_velocity';
    this.velocityConfigPath = config.configPath || process.env.VELOCITY_CONFIG_PATH || '/opt/velocity-proxy/velocity.toml';
    this.velocityServiceName = config.serviceName || process.env.VELOCITY_SERVICE_NAME || 'velocity';
  }

  isConfigured() {
    return !!(this.host);
  }

  /**
   * Check if SSH key exists
   */
  hasSSHKey() {
    try {
      return fs.existsSync(this.privateKeyPath) && fs.existsSync(`${this.privateKeyPath}.pub`);
    } catch {
      return false;
    }
  }

  /**
   * Generate SSH key pair if it doesn't exist
   */
  async generateSSHKey() {
    if (this.hasSSHKey()) {
      console.log('✓ SSH key already exists');
      return { success: true, message: 'SSH key already exists' };
    }

    try {
      console.log(`🔑 Generating SSH key pair at ${this.privateKeyPath}...`);
      
      // Ensure .ssh directory exists
      const sshDir = this.privateKeyPath.substring(0, this.privateKeyPath.lastIndexOf('/'));
      if (!fs.existsSync(sshDir)) {
        fs.mkdirSync(sshDir, { recursive: true, mode: 0o700 });
      }

      // Generate key with ssh-keygen
      await execAsync(
        `ssh-keygen -t rsa -b 4096 -f "${this.privateKeyPath}" -N "" -C "velocity-manager@minecraft-web"`
      );

      // Set correct permissions
      fs.chmodSync(this.privateKeyPath, 0o600);
      fs.chmodSync(`${this.privateKeyPath}.pub`, 0o644);

      console.log('✓ SSH key pair generated successfully');
      return { success: true, message: 'SSH key generated' };
    } catch (error) {
      console.error('❌ Failed to generate SSH key:', error.message);
      throw new Error(`SSH key generation failed: ${error.message}`);
    }
  }

  /**
   * Setup SSH key authentication using password
   */
  async setupSSHKeyAuth() {
    if (!this.password) {
      throw new Error('Password is required for initial SSH key setup');
    }

    try {
      // Generate key if it doesn't exist
      await this.generateSSHKey();

      // Read the public key
      const publicKey = fs.readFileSync(`${this.privateKeyPath}.pub`, 'utf8').trim();

      console.log(`🔐 Setting up SSH key authentication for ${this.username}@${this.host}...`);

      // Use sshpass to copy the key to remote host
      // First, check if sshpass is available, if not use ssh-copy-id with expect
      const copyKeyCmd = `
        mkdir -p ~/.ssh && chmod 700 ~/.ssh && \
        echo '${publicKey}' >> ~/.ssh/authorized_keys && \
        chmod 600 ~/.ssh/authorized_keys && \
        echo "SSH_KEY_INSTALLED"
      `;

      // Use sshpass if available, otherwise provide instructions
      try {
        await execAsync(`which sshpass`);
        // sshpass is available
        const result = await execAsync(
          `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -p ${this.port} ${this.username}@${this.host} "${copyKeyCmd}"`
        );

        if (result.stdout.includes('SSH_KEY_INSTALLED')) {
          console.log('✓ SSH key installed on Velocity server');
          return { success: true, message: 'SSH key authentication configured' };
        } else {
          throw new Error('Key installation verification failed');
        }
      } catch (sshpassError) {
        // sshpass not available, try alternative method
        console.log('⚠️  sshpass not available, attempting alternative method...');
        
        // Install sshpass first
        try {
          await execAsync('apk add --no-cache sshpass');
          console.log('✓ Installed sshpass');
          
          // Retry with sshpass
          const result = await execAsync(
            `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -p ${this.port} ${this.username}@${this.host} "${copyKeyCmd}"`
          );

          if (result.stdout.includes('SSH_KEY_INSTALLED')) {
            console.log('✓ SSH key installed on Velocity server');
            return { success: true, message: 'SSH key authentication configured' };
          }
        } catch (installError) {
          throw new Error(`Could not install sshpass or copy SSH key: ${installError.message}`);
        }
      }
    } catch (error) {
      console.error('❌ SSH key setup failed:', error.message);
      throw error;
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
        `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -p ${this.port} ${this.username}@${this.host} "echo CONNECTION_OK"`
      );

      if (result.stdout.includes('CONNECTION_OK')) {
        return { success: true, message: 'Password authentication successful' };
      } else {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      throw new Error(`Password authentication failed: ${error.message}`);
    }
  }

  /**
   * Get SSH client for Velocity server
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
   * Add a server to the Velocity server list by editing velocity.toml
   */
  async addServer(minecraftServerName, minecraftServerIp, minecraftServerPort = 25565) {
    if (!this.isConfigured()) {
      console.warn('⚠️  Velocity server not configured. Skipping velocity setup.');
      return { success: false, message: 'Velocity not configured' };
    }

    try {
      console.log(`📋 Adding to Velocity: ${minecraftServerName} -> ${minecraftServerIp}:${minecraftServerPort}`);

      const ssh = this._getSSHClient();
      
      // Create backup of velocity.toml
      await ssh.executeCommand(`sudo cp ${this.velocityConfigPath} ${this.velocityConfigPath}.backup`);

      // Check if server already exists in config
      const checkResult = await ssh.executeCommand(`grep -q "^${minecraftServerName} =" ${this.velocityConfigPath} && echo "EXISTS" || echo "NOT_EXISTS"`);
      const exists = checkResult.stdout.trim() === 'EXISTS';

      if (exists) {
        // Update existing entry using sed
        const sedCmd = `sudo sed -i 's|^${minecraftServerName} =.*|${minecraftServerName} = "${minecraftServerIp}:${minecraftServerPort}"|' ${this.velocityConfigPath}`;
        await ssh.executeCommand(sedCmd);
        console.log(`✓ Updated existing Velocity entry: ${minecraftServerName}`);
      } else {
        // Add new entry in [servers] section - insert after the [servers] line
        const addCmd = `sudo sed -i '/^\\[servers\\]/a ${minecraftServerName} = "${minecraftServerIp}:${minecraftServerPort}"' ${this.velocityConfigPath}`;
        await ssh.executeCommand(addCmd);
        console.log(`✓ Added new Velocity entry: ${minecraftServerName}`);
      }

      // Reload Velocity proxy by restarting the service
      console.log('🔄 Reloading Velocity proxy...');
      const restartResult = await ssh.executeCommand(`sudo systemctl restart ${this.velocityServiceName}`);
      
      if (restartResult.code === 0) {
        console.log('✓ Velocity proxy reloaded successfully');
        return { success: true, message: 'Server added and Velocity reloaded' };
      } else {
        console.warn('⚠️  Velocity restart returned non-zero code, but server was added to config');
        return { success: true, message: 'Server added to config, restart may need verification' };
      }
    } catch (error) {
      console.error('⚠️  Velocity configuration error:', error.message);
      
      // Return partial success - the VM was cloned even if velocity wasn't updated
      return {
        success: false,
        message: `Could not update velocity: ${error.message}`,
        partialSuccess: true
      };
    }
  }

  /**
   * Remove a server from Velocity list
   */
  async removeServer(minecraftServerName) {
    if (!this.isConfigured()) {
      return { success: false, message: 'Velocity not configured' };
    }

    try {
      console.log(`🗑️  Removing from Velocity: ${minecraftServerName}`);

      const ssh = this._getSSHClient();

      // Create backup
      await ssh.executeCommand(`sudo cp ${this.velocityConfigPath} ${this.velocityConfigPath}.backup`);

      // Remove server entry using sed
      const removeCmd = `sudo sed -i '/^${minecraftServerName} =/d' ${this.velocityConfigPath}`;
      await ssh.executeCommand(removeCmd);

      // Reload Velocity
      console.log('🔄 Reloading Velocity proxy...');
      await ssh.executeCommand(`sudo systemctl restart ${this.velocityServiceName}`);

      console.log(`✓ Server removed from Velocity: ${minecraftServerName}`);
      return { success: true };
    } catch (error) {
      console.error('⚠️  Error removing from Velocity:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get list of servers from Velocity config
   */
  async listServers() {
    if (!this.isConfigured()) {
      return { servers: [] };
    }

    try {
      const ssh = this._getSSHClient();
      
      // Extract server entries from [servers] section
      const listCmd = `awk '/^\\[servers\\]/,/^\\[/ {if ($0 ~ /^[a-zA-Z0-9_-]+ =/) print}' ${this.velocityConfigPath}`;
      const result = await ssh.executeCommand(listCmd);

      const servers = [];
      const lines = result.stdout.trim().split('\n');
      
      for (const line of lines) {
        const match = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
        if (match) {
          servers.push({
            name: match[1],
            address: match[2]
          });
        }
      }

      return { servers };
    } catch (error) {
      console.error('⚠️  Error fetching Velocity servers:', error.message);
      return { servers: [] };
    }
  }
}

export default VelocityClient;