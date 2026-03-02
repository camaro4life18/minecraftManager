import axios from 'axios';
import https from 'https';

class ProxmoxClient {
  constructor(config) {
    this.host = config.host;
    this.username = config.username;
    this.password = config.password;
    this.realm = config.realm || 'pam';
    this.token = null;
    this.csrfToken = null;
    
    // Create custom HTTPS agent that ignores SSL certificate errors
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false // Note: In production, use proper SSL certificates
    });
    
    this.api = axios.create({
      baseURL: `https://${this.host}:8006/api2/json`,
      httpsAgent: httpsAgent
    });
  }

  // Authenticate and get token
  async authenticate() {
    try {
      console.log(`🔐 Authenticating to Proxmox: ${this.username}@${this.realm} at ${this.host}`);
      
      const response = await this.api.post('/access/ticket', {
        username: `${this.username}@${this.realm}`,
        password: this.password
      });
      
      console.log(`🔍 Proxmox auth response:`, JSON.stringify(response.data, null, 2));
      
      this.token = response.data.data.ticket;
      this.userId = response.data.data.username;
      this.csrfToken = response.data.data.CSRFPreventionToken;
      this.api.defaults.headers.common['Cookie'] = `PVEAuthCookie=${this.token}`;
      this.api.defaults.headers.common['CSRFPreventionToken'] = this.csrfToken;
      
      console.log(`✅ Proxmox authentication successful for ${this.userId}`);
      console.log(`🔑 Token set, Cookie header configured`);
      console.log(`🔐 CSRF token set for write operations`);
      return this.token;
    } catch (error) {
      console.error(`❌ Proxmox authentication failed:`, error.response?.data || error.message);
      throw new Error(`Proxmox authentication failed: ${error.message}`);
    }
  }

  // Get all nodes
  async getNodes() {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get('/nodes');
      return response.data.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch nodes: ${error.message}`);
    }
  }

  // Get all storage
  async getStorage() {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get('/storage');
      const storages = response.data.data || [];

      const filtered = storages.filter(s =>
        (s.content || '').includes('images')
      );

      console.log(`📦 All storage retrieved: ${storages.length} total`);
      let detailedStorage = filtered.map(s => {
        const used = parseInt(s.used || 0);
        const avail = parseInt(s.avail || 0);
        const total = parseInt(s.total || s.size || s.maxfiles || (used + avail) || 0);
        return {
          storage: s.storage,
          name: s.storage,
          used,
          avail,
          size: total,
          total,
          type: s.type,
          content: s.content,
          enabled: s.enabled,
          source: 'cluster'
        };
      });

      const hasNonZeroClusterStats = detailedStorage.some(s => (s.avail || 0) > 0 || (s.size || 0) > 0 || (s.used || 0) > 0);

      if (!hasNonZeroClusterStats && detailedStorage.length > 0) {
        console.warn('⚠️ Cluster /storage returned zero stats for all storages; attempting node-level storage fallback');

        const nodes = await this.getNodes();
        const mergedByStorage = new Map();

        for (const node of nodes) {
          try {
            const nodeStorage = await this.getNodeStorage(node.node);
            for (const s of nodeStorage) {
              const used = parseInt(s.used || 0);
              const avail = parseInt(s.avail || 0);
              const total = parseInt(s.total || s.size || s.maxfiles || (used + avail) || 0);
              const key = s.storage;
              const existing = mergedByStorage.get(key);

              const currentScore = (avail || 0) + (total || 0) + (used || 0);
              const existingScore = existing ? ((existing.avail || 0) + (existing.size || 0) + (existing.used || 0)) : -1;

              if (!existing || currentScore > existingScore) {
                mergedByStorage.set(key, {
                  storage: s.storage,
                  name: s.storage,
                  used,
                  avail,
                  size: total,
                  total,
                  type: s.type,
                  content: s.content,
                  enabled: s.enabled,
                  source: `node:${node.node}`
                });
              }
            }
          } catch (nodeError) {
            console.warn(`⚠️ Failed node storage lookup for ${node.node}: ${nodeError.message}`);
          }
        }

        if (mergedByStorage.size > 0) {
          detailedStorage = Array.from(mergedByStorage.values());
          console.log(`✅ Node-level storage fallback applied for ${detailedStorage.length} storages`);
        } else {
          console.warn('⚠️ Node-level storage fallback returned no storage data; keeping cluster values');
        }
      }

      console.log('📦 Filtered storage details:', JSON.stringify(detailedStorage, null, 2));

      return detailedStorage;
    } catch (error) {
      throw new Error(`Failed to fetch storage: ${error.message}`);
    }
  }

  // Get storage available on a specific node
  async getNodeStorage(nodeName) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get(`/nodes/${nodeName}/storage`);
      // Filter for storage that supports disk images
      // Note: enabled field may be undefined, so we don't check it
      const storages = response.data.data || [];
      const filtered = storages.filter(s => 
        (s.content || '').includes('images')
      );
      
      console.log(`📦 Node ${nodeName} storage (images only): ${filtered.map(s => `${s.storage}(${s.avail || 0} bytes available)`).join(', ')}`);
      return filtered;
    } catch (error) {
      throw new Error(`Failed to fetch storage for node ${nodeName}: ${error.message}`);
    }
  }
  // Get all servers (LXC and QEMU)
  async getServers() {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get('/nodes');
      const nodes = response.data.data;
      const servers = [];

      for (const node of nodes) {
        // Get QEMU VMs
        const vmsResponse = await this.api.get(`/nodes/${node.node}/qemu`);
        const vms = vmsResponse.data.data || [];
        servers.push(...vms.map(vm => ({
          ...vm,
          type: 'qemu',
          node: node.node
        })));

        // Get LXC containers
        const lxcResponse = await this.api.get(`/nodes/${node.node}/lxc`);
        const lxcs = lxcResponse.data.data || [];
        servers.push(...lxcs.map(lxc => ({
          ...lxc,
          type: 'lxc',
          node: node.node
        })));
      }

      return servers.filter(s => s.name && s.name.toLowerCase().includes('minecraft'));
    } catch (error) {
      throw new Error(`Failed to fetch servers: ${error.message}`);
    }
  }

  // Get server details
  async getServerDetails(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get(`/nodes`);
      const nodes = response.data.data;

      for (const node of nodes) {
        try {
          const vmResponse = await this.api.get(`/nodes/${node.node}/qemu/${vmid}/status/current`);
          return {
            vmid,
            node: node.node,
            type: 'qemu',
            status: vmResponse.data.data
          };
        } catch (e) {
          try {
            const lxcResponse = await this.api.get(`/nodes/${node.node}/lxc/${vmid}/status/current`);
            return {
              vmid,
              node: node.node,
              type: 'lxc',
              status: lxcResponse.data.data
            };
          } catch (e2) {
            // Continue to next node
          }
        }
      }
      throw new Error(`Server ${vmid} not found`);
    } catch (error) {
      throw new Error(`Failed to fetch server details: ${error.message}`);
    }
  }

  /**
   * Get VM network configuration including MAC address
   * This is needed for DHCP reservations
   */
  async getVMNetworkConfig(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const serverDetails = await this.getServerDetails(vmid);
      const { node, type } = serverDetails;

      // Get VM configuration
      const configResponse = await this.api.get(`/nodes/${node}/${type}/${vmid}/config`);
      const config = configResponse.data.data;

      // Extract network interfaces and MAC addresses
      const networkInterfaces = [];
      
      // Check for net0, net1, net2, etc.
      for (let i = 0; i < 10; i++) {
        const netKey = `net${i}`;
        if (config[netKey]) {
          const netConfig = config[netKey];
          // Format is usually like: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0"
          const macMatch = netConfig.match(/([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})/);
          if (macMatch) {
            networkInterfaces.push({
              interface: netKey,
              mac: macMatch[0].toUpperCase(),
              config: netConfig
            });
          }
        }
      }

      if (networkInterfaces.length === 0) {
        console.warn(`⚠️  No network interfaces found for VM ${vmid}`);
      }

      return {
        vmid,
        node,
        type,
        networkInterfaces,
        primaryMac: networkInterfaces[0]?.mac || null
      };
    } catch (error) {
      console.error(`❌ Failed to get network config for VM ${vmid}:`, error.message);
      throw new Error(`Failed to get network config: ${error.message}`);
    }
  }

  /**
   * Get VM IP address from QEMU guest agent
   * Returns the first non-loopback IPv4 address found
   */
  async getGuestAgentIP(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const serverDetails = await this.getServerDetails(vmid);
      const { node, type } = serverDetails;

      if (type !== 'qemu') {
        throw new Error('Guest agent is only available for QEMU VMs');
      }

      console.log(`🔍 Querying guest agent for VM ${vmid} network interfaces...`);
      const response = await this.api.get(`/nodes/${node}/qemu/${vmid}/agent/network-get-interfaces`);
      const interfaces = response.data.data.result;

      // Find the first non-loopback IPv4 address
      for (const iface of interfaces) {
        if (iface.name === 'lo') continue; // Skip loopback
        
        if (iface['ip-addresses']) {
          for (const ip of iface['ip-addresses']) {
            if (ip['ip-address-type'] === 'ipv4' && !ip['ip-address'].startsWith('127.')) {
              console.log(`✅ Found guest IP: ${ip['ip-address']} on interface ${iface.name}`);
              return {
                ip: ip['ip-address'],
                interface: iface.name,
                mac: iface['hardware-address']
              };
            }
          }
        }
      }

      console.warn(`⚠️  No non-loopback IPv4 address found in guest agent data`);
      return null;
    } catch (error) {
      // Check if error is because guest agent is not running
      if (error.response?.status === 500 && error.response?.data?.errors) {
        const errorMsg = JSON.stringify(error.response.data.errors);
        if (errorMsg.includes('not running') || errorMsg.includes('QEMU guest agent')) {
          console.warn(`⚠️  QEMU guest agent not running on VM ${vmid}`);
          return null;
        }
      }
      
      console.error(`❌ Failed to get guest agent IP for VM ${vmid}:`, error.message);
      return null; // Don't throw, just return null if agent is not available
    }
  }

  // Get the next available VM ID
  async getNextAvailableVmId() {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get('/nodes');
      const nodes = response.data.data;
      let maxVmId = 100; // Start from 100 as minimum

      for (const node of nodes) {
        // Get all QEMU VMs
        try {
          const vmsResponse = await this.api.get(`/nodes/${node.node}/qemu`);
          const vms = vmsResponse.data.data || [];
          vms.forEach(vm => {
            if (vm.vmid > maxVmId) {
              maxVmId = vm.vmid;
            }
          });
        } catch (err) {
          console.warn(`⚠️  Could not fetch QEMU VMs from ${node.node}`);
        }

        // Get all LXC containers
        try {
          const lxcResponse = await this.api.get(`/nodes/${node.node}/lxc`);
          const lxcs = lxcResponse.data.data || [];
          lxcs.forEach(lxc => {
            if (lxc.vmid > maxVmId) {
              maxVmId = lxc.vmid;
            }
          });
        } catch (err) {
          console.warn(`⚠️  Could not fetch LXC containers from ${node.node}`);
        }
      }

      const nextVmId = maxVmId + 1;
      console.log(`🔢 Next available VM ID: ${nextVmId} (current max: ${maxVmId})`);
      return nextVmId;
    } catch (error) {
      throw new Error(`Failed to get next available VM ID: ${error.message}`);
    }
  }
  // Clone a server
  // If newVmId is not provided, Proxmox will auto-assign the next available VM ID
  // targetNode and targetStorage can override the default source node/storage
  async cloneServer(sourceVmId, newVmId, newVmName, targetNode = null, targetStorage = null) {
    console.log(`🔄 cloneServer called: sourceVmId=${sourceVmId}, newVmId=${newVmId}, newVmName=${newVmName}, targetNode=${targetNode}, targetStorage=${targetStorage}`);
    console.log(`🔑 Current token state: ${this.token ? 'TOKEN EXISTS' : 'NO TOKEN'}`);
    
    if (!this.token) {
      console.log(`🔐 No token found, authenticating...`);
      await this.authenticate();
    } else {
      console.log(`✓ Token already exists, skipping auth`);
    }

    try {
      console.log(`📋 Getting source VM details for ${sourceVmId}...`);
      const sourceDetails = await this.getServerDetails(sourceVmId);
      const node = sourceDetails.node;
      const type = sourceDetails.type;
      
      console.log(`✓ Source VM is ${type} on node ${node}`);

      const cloneData = {
        name: newVmName,
        full: 1 // Full clone (not linked clone)
      };

      // Get next available VM ID if not provided
      let finalVmId = newVmId;
      if (!finalVmId) {
        console.log(`⚙️  No VM ID provided, getting next available...`);
        finalVmId = await this.getNextAvailableVmId();
      }
      cloneData.newid = finalVmId;

      // Use target storage if specified, otherwise Proxmox will use the same storage as the source
      if (targetStorage) {
        cloneData.storage = targetStorage;
        console.log(`💾 Target storage: ${targetStorage}`);
      }

      // NOTE: Proxmox clone requires the source VM to be available on the target node.
      // When cloning, we must clone on the SOURCE NODE first, regardless of targetNode.
      // The VM can be migrated to a different node after cloning if needed.
      // So we always use the source node for the clone operation.
      const cloneNode = node;
      if (targetNode && targetNode !== node) {
        console.log(`⚠️  Note: Cloning on source node (${node}). To move to ${targetNode}, use migration after clone completes.`);
      }

      console.log(`🔄 Cloning ${sourceVmId} with data:`, cloneData);
      console.log(`🌐 POST to: /nodes/${cloneNode}/${type}/${sourceVmId}/clone`);
      console.log(`🔐 Using CSRF token: ${this.csrfToken ? 'SET' : 'MISSING'}`);
      console.log(`📤 Cookie header:`, this.api.defaults.headers.common['Cookie']);

      const response = await this.api.post(
        `/nodes/${cloneNode}/${type}/${sourceVmId}/clone`,
        cloneData,
        {
          headers: {
            'CSRFPreventionToken': this.csrfToken
          }
        }
      );

      // Proxmox clone returns a UPID (Unique Process ID) as a string
      const upid = response.data.data;
      console.log(`✓ Clone task initiated with UPID: ${upid}`);

      // Create result object with both UPID and the new VM ID we calculated
      const result = {
        upid,
        newid: finalVmId
      };
      console.log(`✓ VM cloned successfully with ID: ${result.newid}`);

      return result;
    } catch (error) {
      const errorDetails = error.response?.data?.errors || error.response?.data || error.message;
      console.error(`❌ Clone request failed:`, JSON.stringify(errorDetails, null, 2));
      throw new Error(`Failed to clone server: ${error.message}`);
    }
  }

  // Migrate a VM to a different node
  async migrateServer(vmid, targetNode) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      // Get VM details to know its type and current node
      const details = await this.getServerDetails(vmid);
      const currentNode = details.node;
      const type = details.type;

      console.log(`🚀 Migrating VM ${vmid} from ${currentNode} to ${targetNode}...`);

      const migrateData = {
        target: targetNode,
        online: 1 // Live migration - VM stays running
      };

      const response = await this.api.post(
        `/nodes/${currentNode}/${type}/${vmid}/migrate`,
        migrateData,
        {
          headers: {
            'CSRFPreventionToken': this.csrfToken
          }
        }
      );

      // Proxmox returns a UPID for the migration task
      const upid = response.data.data;
      console.log(`✓ Migration task initiated with UPID: ${upid}`);

      return {
        upid,
        vmid,
        targetNode
      };
    } catch (error) {
      const errorDetails = error.response?.data?.errors || error.response?.data || error.message;
      console.error(`❌ Migration request failed:`, JSON.stringify(errorDetails, null, 2));
      throw new Error(`Failed to migrate server: ${error.message}`);
    }
  }

  // Wait for a Proxmox task (UPID) to complete
  async waitForTask(upid, maxWaitSeconds = 300) {
    if (!this.token) {
      await this.authenticate();
    }

    if (!upid || typeof upid !== 'string') {
      throw new Error('waitForTask requires a valid UPID string');
    }

    const parts = upid.split(':');
    const node = parts[1];
    if (!node) {
      throw new Error(`Could not parse node from UPID: ${upid}`);
    }

    const encodedUpid = encodeURIComponent(upid);
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await this.api.get(`/nodes/${node}/tasks/${encodedUpid}/status`);
        const task = response.data.data;

        if (task.status === 'stopped') {
          if (task.exitstatus === 'OK') {
            console.log(`✓ Task ${upid} completed successfully`);
            return true;
          }

          console.error(`❌ Task ${upid} failed: ${task.exitstatus || 'unknown'}`);
          return false;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error waiting for task: ${error.message}`);
        throw new Error(`Failed to get task status: ${error.message}`);
      }
    }

    console.warn(`⚠️  Task ${upid} did not complete within ${maxWaitSeconds} seconds`);
    return false;
  }

  // Start a server
  async startServer(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const details = await this.getServerDetails(vmid);
      const node = details.node;
      const type = details.type;

      const response = await this.api.post(`/nodes/${node}/${type}/${vmid}/status/start`);
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to start server: ${error.message}`);
    }
  }

  // Stop a server
  async stopServer(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const details = await this.getServerDetails(vmid);
      const node = details.node;
      const type = details.type;

      const response = await this.api.post(`/nodes/${node}/${type}/${vmid}/status/stop`);
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to stop server: ${error.message}`);
    }
  }

  // Delete a server
  async deleteServer(vmid) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const details = await this.getServerDetails(vmid);
      const node = details.node;
      const type = details.type;

      const deletePath = `/nodes/${node}/${type}/${vmid}`;
      const deleteParams = type === 'qemu'
        ? { purge: 1, 'destroy-unreferenced-disks': 1, skiplock: 1 }
        : { purge: 1, skiplock: 1 };

      console.log(`🗑️  Sending force DELETE request to ${deletePath} with params:`, deleteParams);
      let response;
      try {
        response = await this.api.delete(deletePath, { params: deleteParams });
      } catch (deleteError) {
        const proxmoxMessage = deleteError.response?.data?.message || '';
        const isRunningError = proxmoxMessage.includes('is running - destroy failed');

        if (!isRunningError) {
          throw deleteError;
        }

        console.log(`⚡ ${type.toUpperCase()} ${vmid} is running; issuing hard stop then retrying delete...`);
        await this.api.post(`/nodes/${node}/${type}/${vmid}/status/stop`, null, {
          params: { skiplock: 1 }
        });

        const maxRetries = 15;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            response = await this.api.delete(deletePath, { params: deleteParams });
            console.log(`✓ Delete succeeded after hard stop (attempt ${attempt})`);
            break;
          } catch (retryError) {
            const retryMsg = retryError.response?.data?.message || '';
            if (attempt === maxRetries || !retryMsg.includes('is running - destroy failed')) {
              throw retryError;
            }
          }
        }
      }
      console.log(`✓ Delete response:`, JSON.stringify(response.data, null, 2));
      return response.data.data;
    } catch (error) {
      console.error(`❌ Delete failed:`, error.response?.data || error.message);
      const errorMsg = error.response?.data?.message || error.response?.data?.errors || error.message;
      throw new Error(`Failed to delete server: ${errorMsg}`);
    }
  }

}

export default ProxmoxClient;
