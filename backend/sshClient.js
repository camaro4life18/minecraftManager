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
   * Execute a systemctl command using sudo
   * Note: Requires passwordless sudo for systemctl commands
   * @private
   */
  async runSystemctl(action) {
    const command = `sudo -n systemctl ${action} minecraft.service`;
    console.log(`📋 Running systemctl: ${command}`);
    return this.ssh.executeCommand(command);
  }

  /**
   * Get Minecraft server status
   */
  async getStatus() {
    try {
      const result = await this.runSystemctl('status');
      
      // Check if sudo failed
      if (result.stderr && result.stderr.includes('password is required')) {
        console.warn('⚠️  Sudo requires password. Please configure passwordless sudo for systemctl.');
        return {
          running: false,
          enabled: false,
          error: 'Passwordless sudo not configured. Run: echo "$(whoami) ALL=(ALL) NOPASSWD: /bin/systemctl * minecraft.service" | sudo tee /etc/sudoers.d/minecraft-manager'
        };
      }
      
      const isRunning = result.stdout.includes('active (running)');
      const isEnabled = result.stdout.includes('enabled');
      
      return {
        running: isRunning,
        enabled: isEnabled,
        output: result.stdout
      };
    } catch (error) {
      console.error('❌ Error checking status:', error.message);
      return {
        running: false,
        enabled: false,
        error: error.message
      };
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
   * Configure a fresh Minecraft world with a new seed
   * This deletes existing world data and updates server.properties
   * Use this after cloning a server to ensure a new world is generated
   * 
   * @param {string} seed - The world seed to use
   * @param {string} levelName - The world name (default: 'world')
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async setupFreshWorld(seed, levelName = 'world') {
    try {
      console.log(`🌍 Setting up fresh world with seed: ${seed}`);
      
      // Step 1: Stop the server if running
      console.log('🛑 Stopping Minecraft server...');
      const stopResult = await this.runSystemctl('stop');
      if (stopResult.code !== 0 && !stopResult.stderr.includes('not loaded')) {
        console.warn('⚠️  Stop command returned non-zero:', stopResult.stderr);
        // Continue anyway - server might not be running
      }

      // Step 2: Delete world directories
      console.log('🗑️  Deleting old world data...');
      const worldDirs = [levelName, `${levelName}_nether`, `${levelName}_the_end`];
      
      for (const dir of worldDirs) {
        const deleteCmd = `cd ${this.minecraftPath} && [ -d "${dir}" ] && rm -rf "${dir}" || echo "Directory ${dir} does not exist"`;
        const result = await this.runAsMinecraft(deleteCmd);
        console.log(`   Deleted ${dir}: ${result.stdout.trim() || 'Done'}`);
      }

      // Step 3: Update server.properties with new seed
      console.log('📝 Updating server.properties with new seed...');
      await this.updateServerProperties({
        'level-seed': seed,
        'level-name': levelName
      });

      console.log('✅ Fresh world setup complete! New world will generate on next server start.');
      
      return {
        success: true,
        message: `World reset complete. New world with seed ${seed} will generate on server start.`
      };
    } catch (error) {
      console.error('❌ Failed to setup fresh world:', error);
      return {
        success: false,
        message: `Failed to setup fresh world: ${error.message}`
      };
    }
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
   * @param {string} version - Version to update to (e.g., "1.21.4" or "1.21.4:232" for specific build)
   */
  async updatePaperMC(version) {
    try {
      console.log(`📥 Starting PaperMC update to version: ${version}`);

      // Parse version and specific build if provided (format: "version:build")
      let actualVersion = version;
      let requestedBuild = null;
      if (version.includes(':')) {
        const parts = version.split(':');
        actualVersion = parts[0];
        requestedBuild = parseInt(parts[1]);
        console.log(`✓ User requested specific build: ${requestedBuild} for version ${actualVersion}`);
      }

      // Scrape the website to get the actual download URL
      let downloadUrl = null;
      let latestBuild = requestedBuild;
      
      try {
        const websiteRes = await fetch('https://papermc.io/downloads/paper', { 
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const html = await websiteRes.text();
        
        if (requestedBuild) {
          // Look for the specific version and build
          const specificRegex = new RegExp(`(https://fill-data\\.papermc\\.io/v1/objects/[a-f0-9]+/paper-${actualVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${requestedBuild}\\.jar)`, 'i');
          const match = html.match(specificRegex);
          if (match) {
            downloadUrl = match[1];
            console.log(`✓ Found download URL for build ${requestedBuild}: ${downloadUrl}`);
          } else {
            console.warn(`⚠️  Build ${requestedBuild} not found on download page`);
          }
        } else {
          // Find the highest build for this version
          const buildRegex = new RegExp(`https://fill-data\\.papermc\\.io/v1/objects/[a-f0-9]+/(paper-${actualVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.jar)`, 'gi');
          let match;
          let maxBuild = null;
          let maxUrl = null;
          
          while ((match = buildRegex.exec(html)) !== null) {
            const build = parseInt(match[2]);
            if (!maxBuild || build > maxBuild) {
              maxBuild = build;
              maxUrl = match[0];
            }
          }
          
          if (maxUrl) {
            downloadUrl = maxUrl;
            latestBuild = maxBuild;
            console.log(`✓ Found latest build ${latestBuild} with URL: ${downloadUrl}`);
          }
        }
      } catch (e) {
        console.warn(`⚠️  Website scraping failed: ${e.message}`);
      }

      // If we couldn't find the download URL, fall back to API construction
      if (!downloadUrl) {
        console.warn(`⚠️  Could not find download URL from website, trying API...`);
        
        if (!latestBuild) {
          // Try to get build from API
          try {
            const versionListRes = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${actualVersion}`);
            if (versionListRes.ok) {
              const versionData = await versionListRes.json();
              if (versionData.builds && versionData.builds.length > 0) {
                latestBuild = versionData.builds[versionData.builds.length - 1];
                console.log(`✓ Found build ${latestBuild} from API`);
              }
            }
          } catch (e) {
            console.warn(`⚠️  API lookup failed: ${e.message}`);
          }
        }
        
        if (!latestBuild) {
          throw new Error(`Could not determine build number for version ${actualVersion}`);
        }
        
        // Construct API URL as fallback
        downloadUrl = `https://api.papermc.io/v2/projects/paper/versions/${actualVersion}/builds/${latestBuild}/downloads/paper-${actualVersion}-${latestBuild}.jar`;
        console.log(`⚠️  Using constructed API URL: ${downloadUrl}`);
      }

      // Get the current jar info to see if we're using a symlink
      const symlinkCmd = `[ -L ${this.minecraftPath}/server.jar ] && readlink ${this.minecraftPath}/server.jar || echo ''`;
      const symlinkResult = await this.runAsMinecraft(symlinkCmd);
      const currentTarget = symlinkResult.stdout.trim();

      // Construct the jar name
      const jarName = `paper-${actualVersion}-${latestBuild}.jar`;
      const jarPath = `${this.minecraftPath}/${jarName}`;

      // Download the file
      console.log(`📥 Downloading from: ${downloadUrl}`);
      const downloadCmd = `cd ${this.minecraftPath} && curl -L -o ${jarName} "${downloadUrl}" 2>&1`;
      const downloadResult = await this.runAsMinecraft(downloadCmd);

      if (downloadResult.code !== 0) {
        throw new Error(`Download failed: ${downloadResult.stderr || downloadResult.stdout}`);
      }

      // Verify downloaded file size is reasonable (should be > 50MB)
      const sizeCmd = `stat -c%s ${jarPath} 2>/dev/null || stat -f%z ${jarPath} 2>/dev/null || ls -l ${jarPath} | awk '{print $5}'`;
      const sizeResult = await this.runAsMinecraft(sizeCmd);
      const fileSizeBytes = parseInt(sizeResult.stdout.trim());
      
      if (!fileSizeBytes || fileSizeBytes < 50000000) {
        await this.runAsMinecraft(`rm -f ${jarPath}`);
        throw new Error(`Downloaded file is too small (${fileSizeBytes} bytes), download failed`);
      }
      
      console.log(`✓ Downloaded file size: ${(fileSizeBytes / 1024 / 1024).toFixed(1)}M`);
      console.log(`✓ Downloaded PaperMC version ${actualVersion} build ${latestBuild}`);

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
        version: actualVersion,
        build: latestBuild,
        jarName,
        message: `Successfully updated to PaperMC ${actualVersion} build ${latestBuild}. Restart server to apply changes.`
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
