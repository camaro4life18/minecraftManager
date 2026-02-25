import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class VelocityClient {
  constructor(config = {}) {
    // Allow override of configuration
    this.host = config.host || process.env.VELOCITY_HOST;
    this.port = config.port || process.env.VELOCITY_PORT || 8233;
    this.apiKeyOrPassword = config.apiKey || process.env.VELOCITY_API_KEY || process.env.VELOCITY_PASSWORD;
    this.baseUrl = `http://${this.host}:${this.port}`;
  }

  isConfigured() {
    return !!(this.host && this.apiKeyOrPassword);
  }

  /**
   * Add a server to the Velocity server list
   * This typically requires SSH access to the velocity server to edit the config
   * Or using an admin API if available
   */
  async addServer(minecraftServerName, minecraftServerIp, minecraftServerPort = 25565) {
    if (!this.isConfigured()) {
      console.warn('⚠️  Velocity server not configured. Skipping velocity setup.');
      return { success: false, message: 'Velocity not configured' };
    }

    try {
      // This is a placeholder for velocity server API calls
      // In reality, you might need to:
      // 1. SSH into the velocity server
      // 2. Update the config file directly
      // 3. Use a custom webhook/API endpoint on velocity

      console.log(`📋 Adding to Velocity: ${minecraftServerName} -> ${minecraftServerIp}:${minecraftServerPort}`);

      // Example using HTTP API if velocity has one
      const response = await axios.post(
        `${this.baseUrl}/api/servers`,
        {
          name: minecraftServerName,
          address: `${minecraftServerIp}:${minecraftServerPort}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKeyOrPassword}`,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      console.log('✓ Server added to Velocity');
      return { success: true, data: response.data };
    } catch (error) {
      // Log the error but don't fail the whole clone operation
      console.error('⚠️  Velocity server error:', error.message);
      
      // Return partial success - the VM was cloned even if velocity wasn't updated
      return {
        success: false,
        message: `Could not update velocity: ${error.message}`,
        partialSuccess: true // Indicate that the VM clone succeeded
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
      const response = await axios.delete(
        `${this.baseUrl}/api/servers/${minecraftServerName}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKeyOrPassword}`
          },
          timeout: 5000
        }
      );

      console.log(`✓ Server removed from Velocity: ${minecraftServerName}`);
      return { success: true };
    } catch (error) {
      console.error('⚠️  Error removing from Velocity:', error.message);
      return { success: false, message: error.message };
    }
  }

  /**
   * Get list of servers from Velocity
   */
  async listServers() {
    if (!this.isConfigured()) {
      return { servers: [] };
    }

    try {
      const response = await axios.get(
        `${this.baseUrl}/api/servers`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKeyOrPassword}`
          },
          timeout: 5000
        }
      );

      return { servers: response.data };
    } catch (error) {
      console.error('⚠️  Error fetching Velocity servers:', error.message);
      return { servers: [] };
    }
  }
}

export default VelocityClient;