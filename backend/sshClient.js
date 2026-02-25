import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';

class SSHClient {
  constructor(config) {
    this.host = config.host;
    this.port = config.port || 22;
    this.username = config.username || 'root';
    this.privateKey = config.privateKey; // Can be key content or path to key file
    this.passphrase = config.passphrase || null;
  }

  /**
   * Execute a command on the remote server
   * @param {string} command - Command to execute
   * @returns {Promise<{stdout: string, stderr: string, code: number}>}
   */
  async executeCommand(command) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          let stdout = '';
          let stderr = '';

          stream.on('close', (code, signal) => {
            conn.end();
            resolve({ stdout, stderr, code });
          }).on('data', (data) => {
            stdout += data.toString();
          }).stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey: this._getPrivateKey(),
        passphrase: this.passphrase
      });
    });
  }

  /**
   * Upload a file to the remote server
   * @param {string} localPath - Local file path
   * @param {string} remotePath - Remote destination path
   */
  async uploadFile(localPath, remotePath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.fastPut(localPath, remotePath, (err) => {
            conn.end();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey: this._getPrivateKey(),
        passphrase: this.passphrase
      });
    });
  }

  /**
   * Download a file from the remote server
   * @param {string} remotePath - Remote file path
   * @param {string} localPath - Local destination path
   */
  async downloadFile(remotePath, localPath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.fastGet(remotePath, localPath, (err) => {
            conn.end();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey: this._getPrivateKey(),
        passphrase: this.passphrase
      });
    });
  }

  /**
   * Read a file from the remote server
   * @param {string} remotePath - Remote file path
   * @returns {Promise<string>} File contents
   */
  async readFile(remotePath) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.readFile(remotePath, 'utf8', (err, data) => {
            conn.end();
            if (err) {
              reject(err);
            } else {
              resolve(data);
            }
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey: this._getPrivateKey(),
        passphrase: this.passphrase
      });
    });
  }

  /**
   * Write content to a file on the remote server
   * @param {string} remotePath - Remote file path
   * @param {string} content - Content to write
   */
  async writeFile(remotePath, content) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          sftp.writeFile(remotePath, content, 'utf8', (err) => {
            conn.end();
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      }).on('error', (err) => {
        reject(err);
      }).connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey: this._getPrivateKey(),
        passphrase: this.passphrase
      });
    });
  }

  /**
   * Get private key for SSH connection
   * @private
   */
  _getPrivateKey() {
    // If privateKey looks like a file path, read it
    if (this.privateKey.includes('/') || this.privateKey.includes('\\')) {
      if (fs.existsSync(this.privateKey)) {
        return fs.readFileSync(this.privateKey);
      }
    }
    // Otherwise, assume it's the key content itself
    return this.privateKey;
  }

  /**
   * Static method to generate SSH keys on a remote server using password auth
   * @param {string} host - Server hostname/IP
   * @param {number} port - SSH port
   * @param {string} username - SSH username
   * @param {string} password - SSH password
   * @returns {Promise<{privateKey: string, publicKey: string}>}
   */
  static async generateSSHKeys(host, port, username, password) {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let isResolved = false;
      
      // Set timeout for the entire operation (30 seconds)
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          reject(new Error('SSH connection timeout. Please check the host, credentials, and network connectivity.'));
        }
      }, 30000);
      
      conn.on('ready', () => {
        // Generate SSH keys with PEM format
        const command = "ssh-keygen -t rsa -b 4096 -m pem -f ~/.ssh/id_rsa -N '' -C 'minecraft-manager' && echo '---PRIVATE_KEY---' && cat ~/.ssh/id_rsa && echo '---PUBLIC_KEY---' && cat ~/.ssh/id_rsa.pub";
        
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            if (!isResolved) {
              isResolved = true;
              return reject(err);
            }
            return;
          }

          let stdout = '';
          let stderr = '';

          stream.on('close', (code, signal) => {
            
            if (code !== 0) {
              clearTimeout(timeout);
              conn.end();
              if (!isResolved) {
                isResolved = true;
                reject(new Error(`Key generation failed: ${stderr}`));
              }
              return;
            }

            // Parse the output to extract keys
            const parts = stdout.split('---PRIVATE_KEY---');
            if (parts.length < 2) {
              clearTimeout(timeout);
              conn.end();
              if (!isResolved) {
                isResolved = true;
                reject(new Error('Failed to parse private key from server response'));
              }
              return;
            }

            const privateKeyPart = parts[1].split('---PUBLIC_KEY---');
            if (privateKeyPart.length < 2) {
              clearTimeout(timeout);
              conn.end();
              if (!isResolved) {
                isResolved = true;
                reject(new Error('Failed to parse public key from server response'));
              }
              return;
            }

            const privateKey = privateKeyPart[0].trim();
            const publicKey = privateKeyPart[1].trim();

            // Add public key to authorized_keys
            const addKeyCommand = `echo '${publicKey}' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
            
            conn.exec(addKeyCommand, (err, stream) => {
              if (err) {
                console.warn('Warning: Could not add key to authorized_keys:', err);
              }

              stream.on('close', (code, signal) => {
                clearTimeout(timeout);
                conn.end();
                if (!isResolved) {
                  isResolved = true;
                  resolve({ privateKey, publicKey });
                }
              });
            });
          }).on('data', (data) => {
            stdout += data.toString();
          }).stderr.on('data', (data) => {
            stderr += data.toString();
          });
        });
      }).on('error', (err) => {
        clearTimeout(timeout);
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      }).connect({
        host,
        port: port || 22,
        username,
        password,
        readyTimeout: 20000  // 20 second connection timeout
      });
    });
  }
}

/**
 * Minecraft-specific server management functions
 */
export class MinecraftServerManager {
  constructor(sshClient, minecraftPath = '/opt/minecraft') {
    this.ssh = sshClient;
    this.minecraftPath = minecraftPath;
  }

  /**
   * Get Minecraft server status
   */
  async getStatus() {
    try {
      const result = await this.ssh.executeCommand('systemctl status minecraft.service');
      const isRunning = result.stdout.includes('active (running)');
      const isEnabled = result.stdout.includes('enabled');
      
      return {
        running: isRunning,
        enabled: isEnabled,
        output: result.stdout
      };
    } catch (error) {
      // Try alternative check if systemd service doesn't exist
      try {
        const result = await this.ssh.executeCommand('pgrep -f "java.*minecraft"');
        return {
          running: result.code === 0,
          enabled: false,
          output: result.stdout
        };
      } catch (e) {
        return {
          running: false,
          enabled: false,
          error: error.message
        };
      }
    }
  }

  /**
   * Start Minecraft server
   */
  async start() {
    const result = await this.ssh.executeCommand('systemctl start minecraft.service');
    return result.code === 0;
  }

  /**
   * Stop Minecraft server
   */
  async stop() {
    const result = await this.ssh.executeCommand('systemctl stop minecraft.service');
    return result.code === 0;
  }

  /**
   * Restart Minecraft server
   */
  async restart() {
    const result = await this.ssh.executeCommand('systemctl restart minecraft.service');
    return result.code === 0;
  }

  /**
   * Read server.properties file
   */
  async getServerProperties() {
    const content = await this.ssh.readFile(`${this.minecraftPath}/server.properties`);
    const properties = {};
    
    content.split('\n').forEach(line => {
      line = line.trim();
      if (line && !line.startsWith('#')) {
        const [key, ...valueParts] = line.split('=');
        properties[key.trim()] = valueParts.join('=').trim();
      }
    });
    
    return properties;
  }

  /**
   * Update server.properties file
   */
  async updateServerProperties(updates) {
    const currentContent = await this.ssh.readFile(`${this.minecraftPath}/server.properties`);
    let newContent = currentContent;

    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(newContent)) {
        newContent = newContent.replace(regex, `${key}=${value}`);
      } else {
        newContent += `\n${key}=${value}`;
      }
    }

    await this.ssh.writeFile(`${this.minecraftPath}/server.properties`, newContent);
    return true;
  }

  /**
   * Get Minecraft server version
   */
  async getVersion() {
    try {
      // Try to read version from server jar
      const result = await this.ssh.executeCommand(
        `cd ${this.minecraftPath} && ls -1 minecraft_server*.jar || ls -1 server*.jar || ls -1 spigot*.jar || ls -1 paper*.jar`
      );
      return result.stdout.trim();
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Update Minecraft server version
   */
  async updateVersion(downloadUrl, jarName) {
    const commands = [
      `cd ${this.minecraftPath}`,
      'systemctl stop minecraft.service',
      `mv ${jarName} ${jarName}.backup.$(date +%Y%m%d_%H%M%S)`,
      `wget -O ${jarName} "${downloadUrl}"`,
      'systemctl start minecraft.service'
    ];

    const result = await this.ssh.executeCommand(commands.join(' && '));
    return {
      success: result.code === 0,
      output: result.stdout,
      error: result.stderr
    };
  }

  /**
   * Install/Update a plugin
   */
  async installPlugin(pluginName, downloadUrl) {
    const commands = [
      `cd ${this.minecraftPath}/plugins`,
      `wget -O ${pluginName} "${downloadUrl}"`,
      'chmod 644 ' + pluginName
    ];

    const result = await this.ssh.executeCommand(commands.join(' && '));
    return result.code === 0;
  }

  /**
   * Upload a plugin from local file
   */
  async uploadPlugin(localPath, pluginName) {
    await this.ssh.uploadFile(localPath, `${this.minecraftPath}/plugins/${pluginName}`);
    await this.ssh.executeCommand(`chmod 644 ${this.minecraftPath}/plugins/${pluginName}`);
    return true;
  }

  /**
   * List installed plugins
   */
  async listPlugins() {
    const result = await this.ssh.executeCommand(`ls -1 ${this.minecraftPath}/plugins/*.jar 2>/dev/null || echo ""`);
    if (!result.stdout.trim()) {
      return [];
    }
    return result.stdout.trim().split('\n').map(p => path.basename(p));
  }

  /**
   * Remove a plugin
   */
  async removePlugin(pluginName) {
    const result = await this.ssh.executeCommand(`rm -f ${this.minecraftPath}/plugins/${pluginName}`);
    return result.code === 0;
  }

  /**
   * Get server logs (last N lines)
   */
  async getLogs(lines = 100) {
    const result = await this.ssh.executeCommand(
      `tail -n ${lines} ${this.minecraftPath}/logs/latest.log`
    );
    return result.stdout;
  }

  /**
   * Run Ubuntu system updates
   */
  async runSystemUpdate() {
    const commands = [
      'apt-get update',
      'DEBIAN_FRONTEND=noninteractive apt-get upgrade -y'
    ];

    const result = await this.ssh.executeCommand(commands.join(' && '));
    return {
      success: result.code === 0,
      output: result.stdout,
      error: result.stderr
    };
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    const commands = [
      'echo "=== OS ===" && cat /etc/os-release | grep PRETTY_NAME',
      'echo "=== Memory ===" && free -h',
      'echo "=== Disk ===" && df -h /',
      'echo "=== Uptime ===" && uptime'
    ];

    const result = await this.ssh.executeCommand(commands.join(' && '));
    return result.stdout;
  }
}

export default SSHClient;
