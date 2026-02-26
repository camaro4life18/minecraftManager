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
        passphrase: this.passphrase,
        hostVerifier: () => true
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
        passphrase: this.passphrase,
        hostVerifier: () => true
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
        passphrase: this.passphrase,
        hostVerifier: () => true
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
        passphrase: this.passphrase,
        hostVerifier: () => true
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
        passphrase: this.passphrase,
        hostVerifier: () => true
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
      
      console.log(`[SSH] Attempting to connect to ${username}@${host}:${port || 22}`);
      
      // Set timeout for the entire operation (30 seconds)
      const timeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          conn.end();
          console.log(`[SSH] Connection timeout after 30 seconds`);
          reject(new Error('SSH connection timeout. Please check the host, credentials, and network connectivity.'));
        }
      }, 30000);
      
      conn.on('ready', () => {
        console.log(`[SSH] Connection established successfully`);
        // Generate SSH keys with PEM format - remove old keys first to avoid prompts
        const command = "rm -f ~/.ssh/id_rsa ~/.ssh/id_rsa.pub && ssh-keygen -t rsa -b 4096 -m pem -f ~/.ssh/id_rsa -N '' -C 'minecraft-manager' && echo '---PRIVATE_KEY---' && cat ~/.ssh/id_rsa && echo '---PUBLIC_KEY---' && cat ~/.ssh/id_rsa.pub";
        
        console.log(`[SSH] Executing key generation command`);
        conn.exec(command, (err, stream) => {
          if (err) {
            console.log(`[SSH] Exec error:`, err.message);
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
            console.log(`[SSH] Command completed with code: ${code}`);
            console.log(`[SSH] STDOUT length: ${stdout.length}, STDERR length: ${stderr.length}`);
            
            if (code !== 0) {
              console.log(`[SSH] Command failed. STDERR:`, stderr);
              clearTimeout(timeout);
              conn.end();
              if (!isResolved) {
                isResolved = true;
                reject(new Error(`Key generation failed: ${stderr}`));
              }
              return;
            }

            // Parse the output to extract keys
            console.log(`[SSH] Parsing keys from output`);
            const parts = stdout.split('---PRIVATE_KEY---');
            if (parts.length < 2) {
              console.log(`[SSH] Failed to find private key marker`);
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

            // Add public key to authorized_keys using cat (safe - no shell escaping issues)
            const addKeyCommand = `cat ~/.ssh/id_rsa.pub >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`;
            
            console.log(`[SSH] Adding key to authorized_keys`);
            conn.exec(addKeyCommand, (err, stream) => {
              if (err) {
                console.log(`[SSH] Warning: Could not execute authorized_keys command:`, err.message);
                // Still resolve even if authorized_keys fails - keys are generated
                clearTimeout(timeout);
                conn.end();
                if (!isResolved) {
                  isResolved = true;
                  resolve({ privateKey, publicKey });
                }
                return;
              }

              let addStdout = '';
              let addStderr = '';

              stream.on('close', (code, signal) => {
                console.log(`[SSH] authorized_keys command completed with code: ${code}`);
                clearTimeout(timeout);
                conn.end();
                if (!isResolved) {
                  isResolved = true;
                  if (code === 0) {
                    console.log(`[SSH] Successfully added key to authorized_keys`);
                  } else {
                    console.log(`[SSH] Warning: authorized_keys command failed:`, addStderr);
                  }
                  // Always resolve - keys are generated even if authorized_keys update fails
                  resolve({ privateKey, publicKey });
                }
              }).on('data', (data) => {
                addStdout += data.toString();
              }).stderr.on('data', (data) => {
                addStderr += data.toString();
              });
            });
          }).on('data', (data) => {
            stdout += data.toString();
            console.log(`[SSH] Received stdout data: ${data.toString().substring(0, 100)}...`);
          }).stderr.on('data', (data) => {
            stderr += data.toString();
            console.log(`[SSH] Received stderr data: ${data.toString()}`);
          });
        });
      }).on('error', (err) => {
        console.log(`[SSH] Connection error:`, err.message, err.level);
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
        readyTimeout: 20000,  // 20 second connection timeout
        // Accept all host keys (required for first-time connections)
        hostVerifier: () => true
      });
      console.log(`[SSH] Connection attempt initiated`);
    });
  }
}

/**
 * Minecraft-specific server management functions
 */
export class MinecraftServerManager {
  constructor(sshClient, minecraftPath = '/opt/minecraft', minecraftUser = 'minecraft') {
    this.ssh = sshClient;
    this.minecraftPath = minecraftPath;
    this.minecraftUser = minecraftUser;
  }

  /**
   * Execute a command as the minecraft user, preserving file ownership
   * @private
   */
  async runAsMinecraft(command) {
    const fullCommand = `sudo -n -u ${this.minecraftUser} bash -c '${command.replace(/'/g, "'\\''")}'`;
    console.log(`📋 Running as minecraft user: ${fullCommand.substring(0, 80)}...`);
    return this.ssh.executeCommand(fullCommand);
  }

  /**
   * Execute a systemctl command using sudo as the configured user
   * @private
   */
  async runSystemctl(action) {
    const command = `sudo -n -u ${this.minecraftUser} systemctl ${action} minecraft.service`;
    console.log(`📋 Running systemctl: ${command.substring(0, 80)}...`);
    return this.ssh.executeCommand(command);
  }

  /**
   * Get Minecraft server status
   */
  async getStatus() {
    try {
      const result = await this.runSystemctl('status');
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
    const result = await this.runSystemctl('start');
    return result.code === 0;
  }

  /**
   * Stop Minecraft server
   */
  async stop() {
    const result = await this.runSystemctl('stop');
    return result.code === 0;
  }

  /**
   * Restart Minecraft server
   */
  async restart() {
    const result = await this.runSystemctl('restart');
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

    // Write with proper ownership via minecraft user
    await this.runAsMinecraft(`cat > ${this.minecraftPath}/server.properties << 'EOF'\n${newContent}\nEOF`);
    return true;
  }

  /**
   * Get Minecraft server version
   */
  async getVersion() {
    try {
      // First check if server.jar exists and is a symlink
      const checkSymlink = `[ -L ${this.minecraftPath}/server.jar ] && readlink -f ${this.minecraftPath}/server.jar || echo ''`;
      const symlinkResult = await this.runAsMinecraft(checkSymlink);
      
      let jarPath = symlinkResult.stdout.trim();
      
      // If server.jar is a symlink, extract the filename from the target path
      if (jarPath) {
        return jarPath.split('/').pop();
      }
      
      // Otherwise, look for jar files directly
      const result = await this.runAsMinecraft(
        `cd ${this.minecraftPath} && (ls -1 minecraft_server*.jar 2>/dev/null || ls -1 server.jar 2>/dev/null || ls -1 spigot*.jar 2>/dev/null || ls -1 paper*.jar 2>/dev/null || echo 'unknown')`
      );
      return result.stdout.trim() || 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  /**
   * Update Minecraft server version
   */
  async updateVersion(downloadUrl, jarName) {
    const stopResult = await this.runSystemctl('stop');
    if (stopResult.code !== 0) {
      return { success: false, output: stopResult.stdout, error: stopResult.stderr };
    }

    const backupResult = await this.runAsMinecraft(
      `cd ${this.minecraftPath} && mv ${jarName} ${jarName}.backup.$(date +%Y%m%d_%H%M%S)`
    );
    if (backupResult.code !== 0) {
      return { success: false, output: backupResult.stdout, error: backupResult.stderr };
    }

    const downloadResult = await this.runAsMinecraft(
      `cd ${this.minecraftPath} && wget -O ${jarName} "${downloadUrl}" && chmod 755 ${jarName}`
    );
    if (downloadResult.code !== 0) {
      return { success: false, output: downloadResult.stdout, error: downloadResult.stderr };
    }

    const startResult = await this.runSystemctl('start');
    return {
      success: startResult.code === 0,
      output: startResult.stdout,
      error: startResult.stderr
    };
  }

  /**
   * Install/Update a plugin via download URL
   */
  async installPlugin(pluginName, downloadUrl) {
    const pluginPath = `${this.minecraftPath}/plugins/${pluginName}`;
    const result = await this.runAsMinecraft(
      `cd ${this.minecraftPath}/plugins && wget -O ${pluginName} "${downloadUrl}" && chmod 755 ${pluginName}`
    );
    return result.code === 0;
  }

  /**
   * Upload a plugin from local file
   */
  async uploadPlugin(localPath, pluginName) {
    const remotePath = `${this.minecraftPath}/plugins/${pluginName}`;
    // Upload to temp location first, then move with proper ownership
    await this.ssh.uploadFile(localPath, `/tmp/${pluginName}`);
    // Move to plugins directory as minecraft user
    await this.runAsMinecraft(`mv /tmp/${pluginName} ${remotePath} && chmod 755 ${remotePath}`);
    return true;
  }

  /**
   * List installed plugins (auto-discovers from plugins directory)
   */
  async listPlugins() {
    try {
      // Use simple ls approach to avoid shell escaping issues
      const command = `ls -1 ${this.minecraftPath}/plugins/*.jar 2>/dev/null | sed 's|.*/||' | sort`;
      console.log(`🔍 Listing plugins from: ${this.minecraftPath}/plugins`);
      console.log(`📋 Running command: ${command}`);
      
      const result = await this.runAsMinecraft(command);
      
      console.log(`📊 Command stdout: "${result.stdout}"`);
      console.log(`📊 Command stderr: "${result.stderr}"`);
      console.log(`📊 Command exit code: ${result.code}`);
      
      if (!result.stdout || !result.stdout.trim()) {
        console.log('⚠️  No plugins found (empty result)');
        return [];
      }
      
      const plugins = result.stdout.trim().split('\n').filter(p => p.trim());
      console.log(`✓ Found ${plugins.length} plugins: ${plugins.join(', ')}`);
      return plugins;
    } catch (error) {
      console.error('❌ Error listing plugins:', error);
      return [];
    }
  }

  /**
   * Remove a plugin
   */
  async removePlugin(pluginName) {
    // Remove plugin file - run as minecraft user to maintain ownership
    const result = await this.runAsMinecraft(`rm -f ${this.minecraftPath}/plugins/${pluginName}`);
    return result.code === 0;
  }

  /**
   * Upgrade an installed plugin to the latest version
   */
  async upgradePlugin(pluginName) {
    return this.ssh.upgradePlugin(pluginName);
  }

  /**
   * Get server logs (last N lines)
   */
  async getLogs(lines = 100) {
    // Read logs as minecraft user
    const result = await this.runAsMinecraft(
      `tail -n ${lines} ${this.minecraftPath}/logs/latest.log 2>/dev/null || echo "No logs found"`
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

  /**
   * Get PaperMC version
   */
  async getPaperMCVersion() {
    try {
      // First check if server.jar is a symlink and follow it
      const symlinkCmd = `[ -L ${this.minecraftPath}/server.jar ] && readlink ${this.minecraftPath}/server.jar || echo ''`;
      const symlinkResult = await this.runAsMinecraft(symlinkCmd);
      
      let jarFile = symlinkResult.stdout.trim();
      
      // If server.jar is a symlink, use the target; otherwise look for paper jars
      if (!jarFile) {
        const command = `ls -1 ${this.minecraftPath}/paper*.jar 2>/dev/null | head -1 | xargs -I {} basename {}`;
        const result = await this.runAsMinecraft(command);
        if (result.code === 0 && result.stdout.trim()) {
          jarFile = result.stdout.trim();
        }
      } else {
        // Extract just the filename if it's a full path
        jarFile = jarFile.split('/').pop();
      }
      
      // Extract version from jar name (paper-1.21.4-123.jar -> 1.21.4)
      if (jarFile) {
        const match = jarFile.match(/paper-(.*?)-(\\d+)\\.jar/);
        if (match) {
          return match[1]; // Return just the version number
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting PaperMC version:', error);
      return null;
    }
  }

  /**
   * Update PaperMC to a specific version
   * @param {string} version - Version to update to (e.g., "1.21.4")
   */
  async updatePaperMC(version) {
    try {
      console.log(`📥 Starting PaperMC update to version: ${version}`);

      // Known latest builds (bypass outdated API)
      const knownLatestBuilds = {
        '1.21.11': 117,
        '1.21.10': 129,
        '1.21.5': 114,
        '1.21.4': 232,
        '1.21.1': 133
      };

      let latestBuild = null;

      // Try website scraping first
      try {
        const websiteRes = await fetch('https://papermc.io/downloads/paper', { 
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await websiteRes.text();
        const buildRegex = new RegExp(`paper-${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.jar`, 'g');
        let match;
        let maxBuild = null;
        while ((match = buildRegex.exec(html)) !== null) {
          const build = parseInt(match[1]);
          if (!maxBuild || build > maxBuild) {
            maxBuild = build;
          }
        }
        if (maxBuild) {
          latestBuild = maxBuild;
          console.log(`✓ Found build ${latestBuild} for version ${version} from website`);
        }
      } catch (e) {
        console.warn(`⚠️  Website scraping failed: ${e.message}`);
      }

      // Try version group API if website didn't work
      if (!latestBuild) {
        try {
          const vgRes = await fetch(`https://api.papermc.io/v2/projects/paper/version_group/${version}`);
          if (vgRes.ok) {
            const vgData = await vgRes.json();
            if (vgData.versions && vgData.versions.length > 0) {
              const builds = vgData.versions.map(v => parseInt(v.split('-').pop()));
              latestBuild = Math.max(...builds);
              console.log(`✓ Found build ${latestBuild} for version ${version} from version_group`);
            }
          }
        } catch (e) {
          console.warn(`⚠️  Version group API failed: ${e.message}`);
        }
      }

      // Try regular API as third option
      if (!latestBuild) {
        try {
          const versionListRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
          if (versionListRes.ok) {
            const versionData = await versionListRes.json();
            if (versionData.builds && versionData.builds.length > 0) {
              latestBuild = versionData.builds[versionData.builds.length - 1];
              console.log(`✓ Found build ${latestBuild} for version ${version} from v2 API`);
            }
          }
        } catch (e) {
          console.warn(`⚠️  V2 API failed: ${e.message}`);
        }
      }

      // Use known latest as final fallback
      if (!latestBuild && knownLatestBuilds[version]) {
        latestBuild = knownLatestBuilds[version];
        console.log(`✓ Using known latest build ${latestBuild} for version ${version}`);
      }

      if (!latestBuild) {
        throw new Error(`Could not determine latest build for version ${version}`);
      }

      // Verify the build is actually available in the API
      // If not, fall back to the highest available build from the API
      console.log(`🔍 Verifying build ${latestBuild} is available in API...`);
      const buildCheckRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}`);
      
      if (!buildCheckRes.ok) {
        console.warn(`⚠️  Build ${latestBuild} not available in API yet, finding highest available...`);
        try {
          const versionListRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}`);
          if (versionListRes.ok) {
            const versionData = await versionListRes.json();
            if (versionData.builds && versionData.builds.length > 0) {
              latestBuild = versionData.builds[versionData.builds.length - 1];
              console.log(`✓ Falling back to available build ${latestBuild}`);
            }
          }
        } catch (e) {
          console.warn(`⚠️  Could not fetch available builds: ${e.message}`);
        }
      } else {
        console.log(`✓ Build ${latestBuild} verified in API`);
      }

      // Get the current jar info to see if we're using a symlink
      const symlinkCmd = `[ -L ${this.minecraftPath}/server.jar ] && readlink ${this.minecraftPath}/server.jar || echo ''`;
      const symlinkResult = await this.runAsMinecraft(symlinkCmd);
      const currentTarget = symlinkResult.stdout.trim();

      // Construct the jar name
      const jarName = `paper-${version}-${latestBuild}.jar`;
      const jarPath = `${this.minecraftPath}/${jarName}`;

      // Download the new version
      const downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${latestBuild}/downloads/${jarName}`;
      console.log(`📥 Downloading from: ${downloadUrl}`);
      const downloadCmd = `cd ${this.minecraftPath} && curl -L -o ${jarName} ${downloadUrl} 2>&1`;
      const downloadResult = await this.runAsMinecraft(downloadCmd);

      if (downloadResult.code !== 0) {
        console.error(`❌ Download failed: ${downloadResult.stderr || downloadResult.stdout}`);
        throw new Error(`Failed to download PaperMC version ${version} build ${latestBuild}`);
      }

      // Verify downloaded file size is reasonable (should be > 52MB)
      const sizeCmd = `ls -lh ${jarPath} | awk '{print $5}'`;
      const sizeResult = await this.runAsMinecraft(sizeCmd);
      const fileSize = sizeResult.stdout.trim();
      console.log(`✓ Downloaded file size: ${fileSize}`);

      if (fileSize && (fileSize.includes('K') || fileSize === '0')) {
        throw new Error(`Downloaded file is too small (${fileSize}), download may have failed`);
      }

      console.log(`✓ Downloaded PaperMC version ${version} build ${latestBuild}`);

      // If server.jar is a symlink, update it; otherwise create one
      if (currentTarget) {
        // Update the symlink to point to the new jar
        const updateSymlinkCmd = `rm ${this.minecraftPath}/server.jar && ln -s ${jarPath} ${this.minecraftPath}/server.jar`;
        await this.runAsMinecraft(updateSymlinkCmd);
        console.log(`✓ Updated symlink to point to ${jarName}`);
      } else {
        // Create a symlink
        const createSymlinkCmd = `ln -s ${jarPath} ${this.minecraftPath}/server.jar`;
        await this.runAsMinecraft(createSymlinkCmd);
        console.log(`✓ Created symlink to ${jarName}`);
      }

      return {
        success: true,
        version,
        build: latestBuild,
        jarName,
        message: `Successfully updated to PaperMC ${version} build ${latestBuild}. Restart server to apply changes.`
      };
    } catch (error) {
      console.error('❌ Error updating PaperMC:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

      if (downloadResult.code !== 0) {
        throw new Error(`Failed to download PaperMC version ${version} build ${latestBuild}`);
      }

      console.log(`✓ Downloaded PaperMC version ${version} build ${latestBuild}`);

      // If server.jar is a symlink, update it; otherwise create one
      if (currentTarget) {
        // Update the symlink to point to the new jar
        const updateSymlinkCmd = `rm ${this.minecraftPath}/server.jar && ln -s ${jarPath} ${this.minecraftPath}/server.jar`;
        await this.runAsMinecraft(updateSymlinkCmd);
        console.log(`✓ Updated symlink to point to ${jarName}`);
      } else {
        // Create a symlink
        const createSymlinkCmd = `ln -s ${jarPath} ${this.minecraftPath}/server.jar`;
        await this.runAsMinecraft(createSymlinkCmd);
        console.log(`✓ Created symlink to ${jarName}`);
      }

      return {
        success: true,
        version,
        build: latestBuild,
        jarName,
        message: `Successfully updated to PaperMC ${version} build ${latestBuild}. Restart server to apply changes.`
      };
    } catch (error) {
      console.error('❌ Error updating PaperMC:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find and get download URL for a Hangar plugin
   * @private
   */
  async getHangarDownloadUrl(slug) {
    try {
      // First try to find the project using simple slug
      console.log(`🔍 Checking Hangar for project slug: ${slug}`);
      const projectResponse = await fetch(`https://hangar.papermc.io/api/v1/projects/${slug}`);
      
      let projectNamespace = null;
      
      if (projectResponse.ok) {
        const data = await projectResponse.json();
        projectNamespace = data.namespace.owner + '/' + data.namespace.slug;
        console.log(`✓ Found project directly: ${projectNamespace}`);
      } else {
        // If not found, search for the project
        console.log(`⚠️  Direct lookup failed (${projectResponse.status}), searching Hangar...`);
        const searchResponse = await fetch(`https://hangar.papermc.io/api/v1/projects?q=${encodeURIComponent(slug)}&limit=10`);
        
        if (!searchResponse.ok) {
          throw new Error(`Search failed with status ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        const results = searchData.result || [];
        
        if (results.length === 0) {
          throw new Error(`No Hangar projects found matching "${slug}"`);
        }
        
        console.log(`✓ Found ${results.length} search results for "${slug}"`);
        
        // Try exact match first, then fuzzy match
        let project = results.find(p => p.namespace.slug.toLowerCase() === slug.toLowerCase());
        
        if (!project) {
          // Fuzzy match - prefer results that start with the slug
          project = results.find(p => p.namespace.slug.toLowerCase().startsWith(slug.toLowerCase()));
        }
        
        if (!project) {
          // Use the first result as fallback
          project = results[0];
          console.log(`⚠️  No exact match, using first result: ${project.name}`);
        }
        
        projectNamespace = project.namespace.owner + '/' + project.namespace.slug;
        console.log(`✓ Found Hangar project: ${projectNamespace} (name: ${project.name})`);
      }
      
      // Now fetch the latest version to get the download URL
      console.log(`📥 Fetching latest version for ${projectNamespace}...`);
      const versionsResponse = await fetch(`https://hangar.papermc.io/api/v1/projects/${projectNamespace}/versions?limit=1`);
      
      if (!versionsResponse.ok) {
        throw new Error(`Failed to fetch versions for ${projectNamespace} (${versionsResponse.status})`);
      }
      
      const versionsData = await versionsResponse.json();
      const versions = versionsData.result || [];
      
      if (versions.length === 0) {
        throw new Error(`No versions found for ${projectNamespace}`);
      }
      
      const latestVersion = versions[0];
      console.log(`✓ Latest version: ${latestVersion.name}`);
      
      const paperDownload = latestVersion.downloads.PAPER;
      
      if (!paperDownload) {
        throw new Error(`No Paper platform available for ${projectNamespace} v${latestVersion.name}`);
      }
      
      if (!paperDownload.downloadUrl) {
        throw new Error(`No download URL in Paper download info for ${projectNamespace} v${latestVersion.name}`);
      }
      
      console.log(`✓ Download URL: ${paperDownload.downloadUrl}`);
      return paperDownload.downloadUrl;
    } catch (error) {
      console.error(`❌ Error getting Hangar download URL for "${slug}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Upgrade an installed plugin to the latest version
   * @param {string} pluginName - Name of the plugin file (e.g., "EssentialsX.jar")
   */
  async upgradePlugin(pluginName) {
    try {
      console.log(`📦 Upgrading plugin: ${pluginName}`);

      // Extract plugin slug from jar name
      // Remove .jar extension
      let slug = pluginName.replace(/\.jar$/i, '');
      
      // Remove version patterns FIRST (e.g., -1, -1.2.3, -2.0.0-dev+30-abc123, _v1.0, etc.)
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
      
      // Then remove platform suffixes (Bukkit, Paper, Spigot, etc.) at the end
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      
      // Normalize to lowercase and replace spaces/underscores with hyphens
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      console.log(`🔍 Plugin slug extraction: ${pluginName} -> ${slug}`);
      
      // Get the downloadURL from Hangar API dynamically
      const downloadUrl = await this.getHangarDownloadUrl(slug);
      
      // Extract the actual filename from the download URL
      const newPluginFilename = downloadUrl.split('/').pop();
      console.log(`📥 New filename from URL: ${newPluginFilename}`);
      
      // Use minecraft directory for temp file since /tmp may not be writable
      const tempPath = `${this.minecraftPath}/temp-${Date.now()}-${newPluginFilename}`;
      // Use -w to capture HTTP status code, -v for verbose (redirected to stderr), -f to fail on HTTP error
      const downloadCmd = `curl -L -f -w "\\nHTTP_STATUS:%{http_code}\\n" -o ${tempPath} ${downloadUrl}`;
      
      console.log(`📥 Starting download from: ${downloadUrl}`);
      const downloadResult = await this.runAsMinecraft(downloadCmd);
      
      console.log(`📥 Full curl output - code: ${downloadResult.code}`);
      console.log(`📥 stdout: "${downloadResult.stdout}"`);
      console.log(`📥 stderr: "${downloadResult.stderr}"`);
      
      if (downloadResult.code !== 0) {
        throw new Error(`Failed to download latest version of ${pluginName}: curl exit ${downloadResult.code}. stderr: ${downloadResult.stderr}`);
      }
      
      // Check if file was created
      const statResult = await this.runAsMinecraft(`ls -lh ${tempPath}`);
      if (statResult.code !== 0) {
        throw new Error(`Download completed but file not found at ${tempPath}`);
      }
      console.log(`📥 Downloaded file: ${statResult.stdout.trim()}`);

      // Backup old plugin
      const backupCmd = `cp ${this.minecraftPath}/plugins/${pluginName} ${this.minecraftPath}/plugins/${pluginName}.bak`;
      await this.runAsMinecraft(backupCmd);

      // Move new plugin to plugins directory with the new filename
      const newPluginPath = `${this.minecraftPath}/plugins/${newPluginFilename}`;
      const moveCmd = `mv ${tempPath} ${newPluginPath}`;
      const moveResult = await this.runAsMinecraft(moveCmd);
      
      if (moveResult.code !== 0) {
        throw new Error(`Failed to update ${pluginName}`);
      }

      // If the new filename differs from the old one, remove the old file
      if (newPluginFilename !== pluginName) {
        console.log(`🔄 Replacing old filename: ${pluginName} → ${newPluginFilename}`);
        const removeCmd = `rm -f ${this.minecraftPath}/plugins/${pluginName}`;
        await this.runAsMinecraft(removeCmd);
      }

      console.log(`✓ Successfully upgraded to new version: ${newPluginFilename}`);
      return {
        success: true,
        oldPluginName: pluginName,
        newPluginName: newPluginFilename,
        message: `Successfully upgraded from ${pluginName} to ${newPluginFilename}. Restart server to load the new version.`
      };
    } catch (error) {
      console.error('❌ Error upgrading plugin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Install a plugin from repository by name
   * @param {string} pluginName - Name of the plugin
   * @param {string} version - Version to install (optional, defaults to latest)
   */
  async installPluginFromRepository(pluginName, version = 'latest') {
    try {
      console.log(`📥 Installing plugin from repository: ${pluginName}`);

      // Download from PaperMC API
      // Format: https://hangar.papermc.io/api/v1/projects/{project}/versions/{version}/downloads/{filename}
      // Or simpler: https://hangar.papermc.io/api/v1/projects/{project}/latest/download
      const downloadUrl = `https://hangar.papermc.io/api/v1/projects/${pluginName}/latest/download`;
      
      const tempPath = `/tmp/${pluginName}.jar`;
      const downloadCmd = `curl -L -o ${tempPath} ${downloadUrl}`;
      
      const downloadResult = await this.runAsMinecraft(downloadCmd);
      
      if (downloadResult.code !== 0) {
        throw new Error(`Failed to download plugin ${pluginName}`);
      }

      // Move to plugins directory
      const moveCmd = `mv ${tempPath} ${this.minecraftPath}/plugins/${pluginName}.jar && chmod 755 ${this.minecraftPath}/plugins/${pluginName}.jar`;
      const moveResult = await this.runAsMinecraft(moveCmd);

      if (moveResult.code !== 0) {
        throw new Error(`Failed to install plugin ${pluginName}`);
      }

      console.log(`✓ Successfully installed ${pluginName}`);
      return {
        success: true,
        pluginName,
        message: `Plugin ${pluginName} installed successfully. Server restart required.`
      };
    } catch (error) {
      console.error('❌ Error installing plugin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}


export default SSHClient;
