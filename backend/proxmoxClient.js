import axios from 'axios';

class ProxmoxClient {
  constructor(config) {
    this.host = config.host;
    this.username = config.username;
    this.password = config.password;
    this.realm = config.realm || 'pam';
    this.token = null;
    this.api = axios.create({
      baseURL: `https://${this.host}:8006/api2/json`,
      httpsAgent: {
        rejectUnauthorized: false // Note: In production, use proper SSL certificates
      }
    });
  }

  // Authenticate and get token
  async authenticate() {
    try {
      const response = await this.api.post('/access/ticket', {
        username: `${this.username}@${this.realm}`,
        password: this.password
      });
      this.token = response.data.data.ticket;
      this.userId = response.data.data.userid;
      this.api.defaults.headers.common['Cookie'] = `PVEAuthCookie=${this.token}`;
      return this.token;
    } catch (error) {
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

  // Clone a server
  async cloneServer(sourceVmId, newVmId, newVmName) {
    if (!this.token) {
      await this.authenticate();
    }

    try {
      const sourceDetails = await this.getServerDetails(sourceVmId);
      const node = sourceDetails.node;
      const type = sourceDetails.type;

      const cloneData = {
        vmid: newVmId,
        name: newVmName,
        full: 1 // Full clone (not linked clone)
      };

      const response = await this.api.post(
        `/nodes/${node}/${type}/${sourceVmId}/clone`,
        cloneData
      );

      return response.data.data;
    } catch (error) {
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
