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
      
      // Filter for storage that supports disk images  
      // Note: enabled field may be undefined, so we don't check it
      const filtered = storages.filter(s => 
        (s.content || '').includes('images')
      );
      
      console.log(`📦 All storage: ${storages.map(s => `${s.storage}(content:${s.content},enabled:${s.enabled})`).join(', ')}`);
      console.log(`📦 Filtered storage (images only): ${filtered.map(s => `${s.storage}(${s.avail || 0} bytes available)`).join(', ')}`);
      
      return filtered;
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

      const response = await this.api.delete(`/nodes/${node}/${type}/${vmid}`);
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to delete server: ${error.message}`);
    }
  }

  // Get task status
  async waitForTask(taskId, node, maxWaitSeconds = 60) {
    if (!this.token) {
      await this.authenticate();
    }

    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const status = await this.getTaskStatus(taskId);
        
        // Check if task is finished
        if (status.status === 'stopped') {
          if (status.exitstatus === 'OK') {
            console.log(`✅ Task ${taskId} completed successfully`);
            return status;
          } else {
            throw new Error(`Task failed with status: ${status.exitstatus}`);
          }
        }

        // Task still running, wait before polling again
        await new Promise(resolve => setTimeout(resolve, 2000)); // Poll every 2 seconds
      } catch (error) {
        console.error(`Error waiting for task: ${error.message}`);
        throw error;
      }
    }

    throw new Error(`Task ${taskId} did not complete within ${maxWaitSeconds} seconds`);
  }

  async getTaskStatus(taskId) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const response = await this.api.get(`/cluster/tasks/${taskId}`);
      return response.data.data;
    } catch (error) {
      throw new Error(`Failed to get task status: ${error.message}`);
    }
  }
}

export default ProxmoxClient;
