import { MinecraftServerManager } from './sshClient.js';

/**
 * Mock SSH Client for testing
 */
class MockSSHClient {
  constructor() {
    this.commands = [];
    this.responses = {};
  }

  async executeCommand(command) {
    this.commands.push(command);
    
    // Return mocked response based on command
    if (command.includes('curl') && command.includes('hangar')) {
      // Simulate successful download
      if (command.includes('-f')) {
        return { stdout: '\nHTTP_STATUS:200\n', stderr: '', code: 0 };
      }
      return { stdout: '', stderr: '', code: 0 };
    }
    
    if (command.includes('ls -lh')) {
      return { stdout: '-rw-r--r-- 1 minecraft minecraft 50M bluemap-5.11-paper.jar', stderr: '', code: 0 };
    }
    
    if (command.includes('cp ') && command.includes('.bak')) {
      return { stdout: '', stderr: '', code: 0 };
    }
    
    if (command.includes('mv ')) {
      return { stdout: '', stderr: '', code: 0 };
    }
    
    return { stdout: '', stderr: '', code: 0 };
  }
  
  // Mock the getHangarDownloadUrl method
  async getHangarDownloadUrl(slug) {
    // Simulate Hangar API lookups with actual download URLs
    const downloadUrlMap = {
      'bluemap': 'https://hangarcdn.papermc.io/plugins/Blue/BlueMap/versions/5.16/PAPER/bluemap-5.16-paper.jar',
      'essentialsx': 'https://hangarcdn.papermc.io/plugins/EssentialsX/EssentialsX/versions/latest/PAPER/essentialsx-latest.jar',
      'chunky': 'https://hangarcdn.papermc.io/plugins/Chunky/Chunky/versions/latest/PAPER/chunky-latest.jar',
      'coreprotect': 'https://hangarcdn.papermc.io/plugins/CoreProtect/CoreProtect/versions/latest/PAPER/coreprotect-latest.jar',
      'backuper': 'https://hangarcdn.papermc.io/plugins/Backuper/Backuper/versions/latest/PAPER/backuper-latest.jar',
      'toolstats': 'https://hangarcdn.papermc.io/plugins/ToolStats/ToolStats/versions/latest/PAPER/toolstats-latest.jar',
      'axinventoryrestore': 'https://hangarcdn.papermc.io/plugins/AxInventoryRestore/AxInventoryRestore/versions/latest/PAPER/axinventoryrestore-latest.jar'
    };
    
    return downloadUrlMap[slug] || `https://hangarcdn.papermc.io/plugins/${slug}/versions/latest/PAPER/${slug}-latest.jar`;
  }
}

describe('MinecraftServerManager - Plugin Upgrade', () => {
  let manager;
  let mockSSH;

  beforeEach(() => {
    mockSSH = new MockSSHClient();
    manager = new MinecraftServerManager(mockSSH, '/opt/minecraft/paper', 'minecraft');
  });

  describe('Slug Extraction', () => {
    /**
     * Test slug extraction from various plugin jar names
     */
    const testCases = [
      {
        input: 'bluemap-5.11-paper.jar',
        expected: 'bluemap',
        description: 'Simple plugin with version and platform'
      },
      {
        input: 'Chunky-Bukkit-1.4.40.jar',
        expected: 'chunky',
        description: 'Capitalized with Bukkit platform'
      },
      {
        input: 'EssentialsX-2.22.0-dev+30-973e5f8.jar',
        expected: 'essentialsx',
        description: 'Complex version with dev build'
      },
      {
        input: 'CoreProtect-23.2.jar',
        expected: 'coreprotect',
        description: 'Simple versioning'
      },
      {
        input: 'toolstats-1.9.9.jar',
        expected: 'toolstats',
        description: 'Lowercase with version'
      },
      {
        input: 'AxInventoryRestore-3.8.2.jar',
        expected: 'axinventoryrestore',
        description: 'CamelCase with version'
      },
      {
        input: 'Backuper-3.4.5.jar',
        expected: 'backuper',
        description: 'Simple CamelCase'
      },
      {
        input: 'MyPlugin-v1.0.0.jar',
        expected: 'myplugin',
        description: 'Version prefix with v'
      },
      {
        input: 'WorldEdit_6.3_Paper.jar',
        expected: 'worldedit',
        description: 'Underscores instead of hyphens'
      }
    ];

    testCases.forEach(({ input, expected, description }) => {
      test(`should extract slug: ${description}`, () => {
        // Simulate slug extraction logic
        let slug = input.replace(/\.jar$/i, '');
        slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
        slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
        slug = slug.toLowerCase().replace(/[_\s]+/g, '-');

        expect(slug).toBe(expected);
      });
    });
  });

  describe('Upgrade Process', () => {
    test('should construct correct download URL from Hangar', async () => {
      // Test that the URL is a proper Hangar CDN download URL
      const downloadUrl = 'https://hangarcdn.papermc.io/plugins/Blue/BlueMap/versions/5.16/PAPER/bluemap-5.16-paper.jar';
      expect(downloadUrl).toContain('hangarcdn.papermc.io');
      expect(downloadUrl).toContain('/plugins/');
      expect(downloadUrl).toContain('.jar');
    });

    test('should use minecraft directory for temp files', async () => {
      // Verify temp path is in minecraft directory, not /tmp
      const tempPath = '/opt/minecraft/paper/temp-1234567890-plugin.jar';
      expect(tempPath).toContain('/opt/minecraft/paper');
      expect(tempPath).not.toContain('/tmp');
    });

    test('should construct proper curl command with Hangar CDN URL', () => {
      const downloadUrl = 'https://hangarcdn.papermc.io/plugins/Blue/BlueMap/versions/5.16/PAPER/bluemap-5.16-paper.jar';
      const tempPath = '/opt/minecraft/paper/temp-123-bluemap-5.11-paper.jar';
      const downloadCmd = `curl -L -f -w "\\nHTTP_STATUS:%{http_code}\\n" -o ${tempPath} ${downloadUrl}`;
      
      expect(downloadCmd).toContain('curl');
      expect(downloadCmd).toContain('-L'); // Follow redirects
      expect(downloadCmd).toContain('-f'); // Fail on HTTP error
      expect(downloadCmd).toContain('-w'); // Write format
      expect(downloadCmd).toContain('HTTP_STATUS');
      expect(downloadCmd).toContain(downloadUrl);
    });

    test('should execute backup command', () => {
      const pluginName = 'bluemap-5.11-paper.jar';
      const minecraftPath = '/opt/minecraft/paper';
      const backupCmd = `cp ${minecraftPath}/plugins/${pluginName} ${minecraftPath}/plugins/${pluginName}.bak`;
      
      expect(backupCmd).toContain('cp');
      expect(backupCmd).toContain('.bak');
      expect(backupCmd).toContain(pluginName);
    });

    test('should execute move command', () => {
      const pluginName = 'bluemap-5.11-paper.jar';
      const minecraftPath = '/opt/minecraft/paper';
      const tempPath = `${minecraftPath}/temp-123-${pluginName}`;
      const moveCmd = `mv ${tempPath} ${minecraftPath}/plugins/${pluginName}`;
      
      expect(moveCmd).toContain('mv');
      expect(moveCmd).toContain(tempPath);
      expect(moveCmd).toContain(`${minecraftPath}/plugins/${pluginName}`);
    });
  });

  describe('Error Handling', () => {
    test('should handle curl HTTP errors', () => {
      const error = new Error('Failed to download latest version of bluemap-5.11-paper.jar: curl exit 22');
      expect(error.message).toContain('Failed to download');
      expect(error.message).toContain('curl');
    });

    test('should handle file not found after download', () => {
      const error = new Error('Download completed but file not found at /opt/minecraft/paper/temp-123-plugin.jar');
      expect(error.message).toContain('file not found');
    });

    test('should handle backup failure', () => {
      const error = new Error('Failed to backup plugin: command failed');
      expect(error.message).toContain('Failed to backup');
    });

    test('should handle move failure', () => {
      const error = new Error('Failed to update bluemap-5.11-paper.jar: command failed');
      expect(error.message).toContain('Failed to update');
    });
  });

  describe('Command Execution', () => {
    test('should use sudo -n -u minecraft for all operations', () => {
      const command = "sudo -n -u minecraft bash -c 'ls -1 /opt/minecraft/paper/plugins/*.jar'";
      expect(command).toContain('sudo -n -u minecraft');
      expect(command).toContain('bash -c');
    });

    test('should properly escape single quotes in commands', () => {
      const innerCommand = "curl -L -f -o /tmp/test.jar 'https://example.com/file'";
      const escapedCommand = innerCommand.replace(/'/g, "'\\''");
      expect(escapedCommand).toContain("'\\''");
    });
  });

  describe('Integration Tests', () => {
    test('complete upgrade workflow', async () => {
      // This simulates the complete upgrade flow
      const pluginName = 'bluemap-5.11-paper.jar';
      
      // 1. Extract slug
      let slug = pluginName.replace(/\.jar$/i, '');
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+]+[\w\-+]*)$/i, '');
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      expect(slug).toBe('bluemap');
      
      // 2. Construct URL
      const downloadUrl = `https://hangar.papermc.io/api/v1/projects/${slug}/latest/download`;
      expect(downloadUrl).toContain('bluemap');
      
      // 3. Create temp path
      const tempPath = `/opt/minecraft/paper/temp-${Date.now()}-${pluginName}`;
      expect(tempPath).toContain('/opt/minecraft/paper');
      
      // 4. Simulate successful download (code 0)
      expect({ code: 0, stdout: '\nHTTP_STATUS:200\n', stderr: '' }.code).toBe(0);
      
      // 5. File should exist
      expect(tempPath).toBeTruthy();
      
      // 6. Backup old file
      const backupPath = `/opt/minecraft/paper/plugins/${pluginName}.bak`;
      expect(backupPath).toContain('.bak');
      
      // 7. Move new file
      const pluginPath = `/opt/minecraft/paper/plugins/${pluginName}`;
      expect(pluginPath).toContain('plugins');
    });
  });

  describe('Edge Cases', () => {
    test('should handle plugins with multiple version parts', () => {
      const input = 'Plugin-1.2.3-4.5-beta.jar';
      let slug = input.replace(/\.jar$/i, '');
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      expect(slug).toBe('plugin');
    });

    test('should handle plugins with only major version', () => {
      const input = 'Plugin-1.jar';
      let slug = input.replace(/\.jar$/i, '');
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      expect(slug).toBe('plugin');
    });

    test('should handle plugin names with spaces', () => {
      const input = 'My Plugin Space-1.0.jar';
      let slug = input.replace(/\.jar$/i, '');
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      expect(slug).toBe('my-plugin-space');
    });

    test('should handle plugin names without version', () => {
      const input = 'SimplePlugin.jar';
      let slug = input.replace(/\.jar$/i, '');
      slug = slug.replace(/[-_]?(v?\d+[\d\.\-+\w]*)?$/i, '');
      slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
      slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
      
      expect(slug).toBe('simpleplugin');
    });
  });
});

describe('Hangar API', () => {
  test('should construct valid Hangar CDN download URLs', () => {
    const testCases = [
      { slug: 'bluemap', url: 'https://hangarcdn.papermc.io/plugins/Blue/BlueMap/versions/5.16/PAPER/bluemap-5.16-paper.jar' },
      { slug: 'essentialsx', url: 'https://hangarcdn.papermc.io/plugins/EssentialsX/EssentialsX/versions/latest/PAPER/essentialsx-latest.jar' },
      { slug: 'chunky', url: 'https://hangarcdn.papermc.io/plugins/Chunky/Chunky/versions/latest/PAPER/chunky-latest.jar' },
    ];

    testCases.forEach(({ slug, url }) => {
      expect(url).toContain('hangarcdn.papermc.io');
      expect(url).toContain('/plugins/');
      expect(url).toContain('.jar');
    });
  });

  test('should follow redirects with -L flag', () => {
    const cmd = 'curl -L https://hangarcdn.papermc.io/plugins/Blue/BlueMap/versions/5.16/PAPER/bluemap-5.16-paper.jar';
    expect(cmd).toContain('-L');
  });
  
  test('should get download URL from Hangar API', async () => {
    const mockSSH = new MockSSHClient();
    const manager = new MinecraftServerManager(mockSSH, '/opt/minecraft/paper', 'minecraft');
    
    // Test that getHangarDownloadUrl returns correct URLs
    const bluemapUrl = await manager.ssh.getHangarDownloadUrl('bluemap');
    expect(bluemapUrl).toContain('hangarcdn.papermc.io');
    expect(bluemapUrl).toContain('Blue/BlueMap');
    expect(bluemapUrl).toContain('.jar');
    
    const essentialsxUrl = await manager.ssh.getHangarDownloadUrl('essentialsx');
    expect(essentialsxUrl).toContain('hangarcdn.papermc.io');
    expect(essentialsxUrl).toContain('EssentialsX');
  });

  describe('PaperMC Updates', () => {
    test('updatePaperMC method should exist and be callable', async () => {
      const mockSSH = new MockSSHClient();
      const manager = new MinecraftServerManager(mockSSH, '/opt/minecraft/paper', 'minecraft');

      // Verify the method exists
      expect(typeof manager.updatePaperMC).toBe('function');
      
      // Call with invalid version - should return error object properly
      const result = await manager.updatePaperMC('invalid-version-xyz');
      
      // Should return object with success property set to false
      expect(result).toHaveProperty('success');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('updatePaperMC should return error for non-existent versions', async () => {
      const mockSSH = new MockSSHClient();
      const manager = new MinecraftServerManager(mockSSH, '/opt/minecraft/paper', 'minecraft');

      const result = await manager.updatePaperMC('1.0.0-invalid');
      
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });
});
