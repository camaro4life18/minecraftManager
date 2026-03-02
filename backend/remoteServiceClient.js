import SSHClient from './sshClient.js';
import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Base class for remote service clients that use SSH authentication
 * Handles common SSH key generation, setup, and connection logic
 */
class RemoteServiceClient {
  constructor(config = {}) {
    // SSH connection details (to be set by subclasses)
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username;
    this.password = config.password; // For initial setup only
    this.privateKeyPath = config.privateKeyPath;
    this.privateKey = config.privateKey; // Allow private key to be passed directly from database
    
    // Service identifier for logging and temp file generation
    this.serviceId = config.serviceId || 'service';
  }

  /**
   * Generate SSH key pair in temp storage
   */
  async generateSSHKey() {
    try {
      // Use temp file for key generation since container storage is not persistent
      const tempKeyPath = `/tmp/${this.serviceId}_ssh_key_${Date.now()}.key`;
      
      console.log(`🔑 Generating SSH key pair at ${tempKeyPath}...`);
      
      // Generate RSA key pair without passphrase
      await execAsync(
        `ssh-keygen -t rsa -b 4096 -f "${tempKeyPath}" -N "" -C "minecraft-manager-${this.serviceId}"`
      );

      console.log('✓ SSH key pair generated successfully');
      return tempKeyPath;
    } catch (error) {
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

    let tempKeyPath = null;
    let generatedPrivateKey = null;

    try {
      // Generate a temporary SSH key
      tempKeyPath = await this.generateSSHKey();

      // Read generated private key so caller can persist it in DB
      generatedPrivateKey = fs.readFileSync(tempKeyPath, 'utf8');

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

      // Use sshpass to copy public key to remote server
      const copyKeyCmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo SSH_KEY_INSTALLED`;
      
      const result = await execAsync(
        `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -p ${this.port} ${this.username}@${this.host} "${copyKeyCmd}"`
      );

      if (!result.stdout.includes('SSH_KEY_INSTALLED')) {
        throw new Error('Key installation verification failed');
      }

      console.log(`✓ SSH key installed on ${this.serviceId} server`);

      // Keep key in-memory for immediate operations in this request lifecycle
      this.privateKey = generatedPrivateKey;

      return {
        success: true,
        privateKey: generatedPrivateKey,
        message: 'SSH key authentication configured and private key generated.'
      };
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
        `sshpass -p '${this.password}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 -p ${this.port} ${this.username}@${this.host} "echo CONNECTION_OK"`
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
   * Get SSH client with private key (from database or file)
   */
  _getSSHClient() {
    let privateKey;
    
    // Try database-stored private key first
    if (this.privateKey) {
      console.log(`✓ Using ${this.serviceId} private key from database`);
      privateKey = this.privateKey;
    } else if (this.privateKeyPath) {
      console.log(`📖 Reading ${this.serviceId} private key from file: ${this.privateKeyPath}`);
      try {
        privateKey = fs.readFileSync(this.privateKeyPath, 'utf8');
      } catch (error) {
        throw new Error(`Failed to read private key from ${this.privateKeyPath}: ${error.message}`);
      }
    } else {
      throw new Error(`No SSH private key configured for ${this.serviceId}`);
    }

    return new SSHClient({
      host: this.host,
      port: this.port,
      username: this.username,
      privateKey: privateKey,
    });
  }
}

export default RemoteServiceClient;
