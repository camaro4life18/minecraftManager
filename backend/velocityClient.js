import RemoteServiceClient from './remoteServiceClient.js';
import dotenv from 'dotenv';

dotenv.config();

class VelocityClient extends RemoteServiceClient {
  constructor(config = {}) {
    // Initialize base class with SSH config
    super({
      host: config.host || process.env.VELOCITY_HOST,
      port: config.port || process.env.VELOCITY_SSH_PORT || 22,
      username: config.username || process.env.VELOCITY_SSH_USER,
      password: config.password,
      privateKeyPath: config.privateKeyPath || process.env.VELOCITY_SSH_KEY || '~/.ssh/id_rsa',
      privateKey: config.privateKey,
      serviceId: 'velocity'
    });

    // Velocity-specific configuration
    this.velocityConfigPath = config.configPath || process.env.VELOCITY_CONFIG_PATH || '/opt/velocity-proxy/velocity.toml';
    this.velocityServiceName = config.serviceName || process.env.VELOCITY_SERVICE_NAME || 'velocity';
  }

  isConfigured() {
    return !!(this.host);
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