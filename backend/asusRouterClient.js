import axios from 'axios';
import https from 'https';
import crypto from 'crypto';

/**
 * ASUS Router API Client
 * Supports ASUS AXE16000 and similar ASUS routers running AsusWRT firmware
 */
class AsusRouterClient {
  constructor(config = {}) {
    this.host = config.host || '192.168.1.1';
    this.username = config.username || 'admin';
    this.password = config.password;
    this.useHttps = config.useHttps !== false; // Default to HTTPS
    this.port = config.port || (this.useHttps ? 443 : 80);
    this.baseUrl = `${this.useHttps ? 'https' : 'http'}://${this.host}:${this.port}`;
    this.token = null;
    
    // Create axios instance that ignores self-signed certs
    this.client = axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      }),
      timeout: 10000
    });
  }

  /**
   * Check if router is configured
   */
  isConfigured() {
    return !!(this.host && this.username && this.password);
  }

  /**
   * Authenticate with ASUS router
   */
  async authenticate() {
    if (!this.isConfigured()) {
      throw new Error('ASUS router not configured');
    }

    try {
      console.log(`🔐 Authenticating with ASUS router at ${this.host}...`);

      // ASUS routers use token-based authentication
      const response = await this.client.post(
        `${this.baseUrl}/login.cgi`,
        new URLSearchParams({
          login_authorization: Buffer.from(`${this.username}:${this.password}`).toString('base64')
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'asusrouter-Minecraft-Manager/1.0'
          }
        }
      );

      // Extract token from response (usually in asus_token cookie or response body)
      const cookies = response.headers['set-cookie'];
      if (cookies) {
        const tokenCookie = cookies.find(c => c.includes('asus_token'));
        if (tokenCookie) {
          this.token = tokenCookie.split(';')[0].split('=')[1];
        }
      }

      // Some ASUS routers return token in response body
      if (!this.token && response.data && response.data.asus_token) {
        this.token = response.data.asus_token;
      }

      if (this.token) {
        console.log('✅ ASUS router authentication successful');
        return true;
      } else {
        throw new Error('Failed to obtain authentication token');
      }
    } catch (error) {
      console.error('❌ ASUS router authentication failed:', error.message);
      throw new Error(`Router authentication failed: ${error.message}`);
    }
  }

  /**
   * Get current DHCP reservations
   */
  async getDHCPReservations() {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.client.post(
        `${this.baseUrl}/appGet.cgi`,
        {
          hook: 'nvram_get(dhcp_staticlist)'
        },
        {
          headers: {
            'Cookie': `asus_token=${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Parse DHCP reservation list
      // Format is usually: <MAC>IP>Name<MAC>IP>Name...
      const reservations = [];
      const data = response.data.dhcp_staticlist || '';
      
      if (data) {
        const entries = data.split('<').filter(e => e);
        for (const entry of entries) {
          const parts = entry.split('>');
          if (parts.length >= 3) {
            reservations.push({
              mac: parts[0],
              ip: parts[1],
              name: parts[2]
            });
          }
        }
      }

      console.log(`📋 Found ${reservations.length} DHCP reservations`);
      return reservations;
    } catch (error) {
      console.error('❌ Failed to get DHCP reservations:', error.message);
      throw error;
    }
  }

  /**
   * Add or update DHCP reservation
   * @param {string} macAddress - MAC address (format: AA:BB:CC:DD:EE:FF)
   * @param {string} ipAddress - IP address to assign
   * @param {string} hostname - Hostname/description
   */
  async addDHCPReservation(macAddress, ipAddress, hostname = '') {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      console.log(`📌 Adding DHCP reservation: ${macAddress} → ${ipAddress} (${hostname})`);

      // Get existing reservations
      const existingReservations = await this.getDHCPReservations();
      
      // Check if this MAC already has a reservation
      const existingIndex = existingReservations.findIndex(r => 
        r.mac.toLowerCase() === macAddress.toLowerCase()
      );

      if (existingIndex >= 0) {
        console.log(`⚠️  MAC ${macAddress} already has reservation, updating...`);
        existingReservations[existingIndex] = {
          mac: macAddress,
          ip: ipAddress,
          name: hostname
        };
      } else {
        existingReservations.push({
          mac: macAddress,
          ip: ipAddress,
          name: hostname
        });
      }

      // Format reservation list for ASUS router
      // Format: <MAC>IP>Name<MAC>IP>Name...
      const dhcpStaticList = existingReservations
        .map(r => `<${r.mac}>${r.ip}>${r.name}`)
        .join('');

      // Apply the new DHCP reservation list
      const response = await this.client.post(
        `${this.baseUrl}/applyapp.cgi`,
        {
          action_mode: 'apply',
          rc_service: 'restart_dhcpd',
          dhcp_staticlist: dhcpStaticList
        },
        {
          headers: {
            'Cookie': `asus_token=${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ DHCP reservation added successfully');
      return {
        success: true,
        mac: macAddress,
        ip: ipAddress,
        hostname
      };
    } catch (error) {
      console.error('❌ Failed to add DHCP reservation:', error.message);
      throw new Error(`Failed to add DHCP reservation: ${error.message}`);
    }
  }

  /**
   * Remove DHCP reservation
   * @param {string} macAddress - MAC address to remove
   */
  async removeDHCPReservation(macAddress) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      console.log(`🗑️  Removing DHCP reservation for ${macAddress}`);

      // Get existing reservations
      const existingReservations = await this.getDHCPReservations();
      
      // Filter out the MAC address to remove
      const newReservations = existingReservations.filter(r => 
        r.mac.toLowerCase() !== macAddress.toLowerCase()
      );

      if (newReservations.length === existingReservations.length) {
        console.log(`⚠️  MAC ${macAddress} not found in reservations`);
        return { success: false, message: 'MAC address not found' };
      }

      // Format reservation list
      const dhcpStaticList = newReservations
        .map(r => `<${r.mac}>${r.ip}>${r.name}`)
        .join('');

      // Apply the new list
      await this.client.post(
        `${this.baseUrl}/applyapp.cgi`,
        {
          action_mode: 'apply',
          rc_service: 'restart_dhcpd',
          dhcp_staticlist: dhcpStaticList
        },
        {
          headers: {
            'Cookie': `asus_token=${this.token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('✅ DHCP reservation removed successfully');
      return { success: true, mac: macAddress };
    } catch (error) {
      console.error('❌ Failed to remove DHCP reservation:', error.message);
      throw error;
    }
  }

  /**
   * Test connection to router
   */
  async testConnection() {
    try {
      await this.authenticate();
      const reservations = await this.getDHCPReservations();
      return {
        success: true,
        message: `Connected successfully. Found ${reservations.length} DHCP reservations.`,
        reservations
      };
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }
}

export default AsusRouterClient;
