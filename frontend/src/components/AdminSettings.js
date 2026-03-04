import React, { useState, useEffect } from 'react';
import '../styles/AdminSettings.css';

function AdminSettings({ apiBase, token, isAdmin }) {
  const [proxmox, setProxmox] = useState({
    host: '',
    username: '',
    password: '',
    realm: 'pam'
  });

  const [velocity, setVelocity] = useState({
    host: '',
    sshPort: 22,
    sshUser: 'user',
    password: '',
    sshKeyPath: '/root/.ssh/id_rsa_velocity',
    configPath: '/opt/velocity-proxy/velocity.toml',
    serviceName: 'velocity',
    backendNetwork: '192.168.1'
  });

  const [dns, setDns] = useState({
    host: '',
    sshPort: 22,
    sshUser: 'user',
    password: '',
    sshKeyPath: '/root/.ssh/id_rsa_dns',
    zone: 'zanarkand.site',
    zoneFile: '/var/lib/bind/zanarkand.site.hosts'
  });

  const [router, setRouter] = useState({
    host: '',
    username: '',
    password: '',
    useHttps: true
  });

  const [node, setNode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [testingProxmox, setTestingProxmox] = useState(false);
  const [testingVelocity, setTestingVelocity] = useState(false);
  const [settingUpVelocity, setSettingUpVelocity] = useState(false);
  const [velocitySSHStatus, setVelocitySSHStatus] = useState(null);
  const [testingRouter, setTestingRouter] = useState(false);
  const [testingDns, setTestingDns] = useState(false);
  const [settingUpDns, setSettingUpDns] = useState(false);
  const [dnsSSHStatus, setDnsSSHStatus] = useState(null);
  const [proxmoxNodes, setProxmoxNodes] = useState([]);
  const [storageOptions, setStorageOptions] = useState([]);
  const [selectedStorages, setSelectedStorages] = useState([]);
  const [hostOptions, setHostOptions] = useState([]);
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [baseServerOptions, setBaseServerOptions] = useState([]);
  const [selectedBaseServerVmid, setSelectedBaseServerVmid] = useState('');
  const [loadingStorages, setLoadingStorages] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    proxmoxPassword: false,
    velocityPassword: false,
    dnsPassword: false,
    routerPassword: false
  });
  const [activeTab, setActiveTab] = useState('proxmox');
  
  // User management state
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    email: '',
    password: '',
    role: 'user'
  });
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  useEffect(() => {
    loadConfiguration();
  }, []);

  useEffect(() => {
    if (activeTab === 'velocity') {
      loadVelocitySSHStatus();
    }
    if (activeTab === 'dns') {
      loadDnsSSHStatus();
    }
    if (activeTab === 'storage') {
      loadStorageConfiguration();
    }
    if (activeTab === 'users') {
      loadUsers();
    }
  }, [activeTab]);

  const loadVelocitySSHStatus = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/config/velocity-ssh-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const status = await response.json();
        setVelocitySSHStatus(status);
      }
    } catch (err) {
      console.error('Error loading Velocity SSH status:', err);
    }
  };

  const loadDnsSSHStatus = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/config/dns-ssh-status`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const status = await response.json();
        setDnsSSHStatus(status);
      }
    } catch (err) {
      console.error('Error loading DNS SSH status:', err);
    }
  };

  const loadConfiguration = async () => {
    try {
      const response = await fetch(`${apiBase}/api/admin/config`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load configuration');

      const config = await response.json();
      
      // Load Proxmox config
      if (config.proxmox_host) {
        setProxmox(prev => ({
          ...prev,
          host: config.proxmox_host?.value || '',
          username: config.proxmox_username?.value || '',
          password: '',
          realm: config.proxmox_realm?.value || 'pam'
        }));
      }

      if (config.proxmox_node) {
        setNode(config.proxmox_node?.value || '');
      }

      // Load Velocity config
      if (config.velocity_host) {
        setVelocity(prev => ({
          ...prev,
          host: config.velocity_host?.value || '',
          sshPort: parseInt(config.velocity_ssh_port?.value || 22),
          sshUser: config.velocity_ssh_user?.value || 'joseph',
          sshKeyPath: config.velocity_ssh_key?.value || '/root/.ssh/id_rsa_velocity',
          configPath: config.velocity_config_path?.value || '/opt/velocity-proxy/velocity.toml',
          serviceName: config.velocity_service_name?.value || 'velocity',
          backendNetwork: config.velocity_backend_network?.value || '192.168.1'
        }));
      }

      // Load DNS config
      if (config.dns_host) {
        setDns(prev => ({
          ...prev,
          host: config.dns_host?.value || '',
          sshPort: parseInt(config.dns_ssh_port?.value || 22),
          sshUser: config.dns_ssh_user?.value || 'joseph',
          sshKeyPath: config.dns_ssh_key?.value || '/root/.ssh/id_rsa_dns',
          zone: config.dns_zone?.value || 'zanarkand.site',
          zoneFile: config.dns_zone_file?.value || '/var/lib/bind/zanarkand.site.hosts'
        }));
      }

      // Load Router config
      if (config.router_host) {
        setRouter(prev => ({
          ...prev,
          host: config.router_host?.value || '',
          username: config.router_username?.value || '',
          password: '',
          useHttps: config.router_use_https?.value !== 'false'
        }));
      }
    } catch (err) {
      console.error('Error loading configuration:', err);
      setError('Failed to load configuration');
    }
  };

  const loadStorageConfiguration = async () => {
    try {
      setLoadingStorages(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/admin/config/storages`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load storage configuration');
      }

      const data = await response.json();
      const storages = Array.isArray(data.allStorages) ? data.allStorages : [];
      const configured = Array.isArray(data.configured) ? data.configured : [];
      const nodes = Array.isArray(data.allNodes) ? data.allNodes : [];
      const configuredNodes = Array.isArray(data.configuredNodes) ? data.configuredNodes : [];
      const baseServers = Array.isArray(data.baseServerOptions) ? data.baseServerOptions : [];

      setStorageOptions(storages);
      setSelectedStorages(configured);
      setHostOptions(nodes);
      setSelectedHosts(configuredNodes);
      setBaseServerOptions(baseServers);
      setSelectedBaseServerVmid(data.selectedBaseServerVmid ? String(data.selectedBaseServerVmid) : '');
    } catch (err) {
      console.error('Error loading storage configuration:', err);
      setError(err.message || 'Failed to load storage configuration');
    } finally {
      setLoadingStorages(false);
    }
  };

  const handleStorageToggle = (storageName) => {
    setSelectedStorages(prev => (
      prev.includes(storageName)
        ? prev.filter(name => name !== storageName)
        : [...prev, storageName]
    ));
  };

  const handleHostToggle = (hostName) => {
    setSelectedHosts(prev => (
      prev.includes(hostName)
        ? prev.filter(name => name !== hostName)
        : [...prev, hostName]
    ));
  };

  const saveStorageConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${apiBase}/api/admin/config/storages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          storages: selectedStorages,
          nodes: selectedHosts,
          baseServerVmid: selectedBaseServerVmid || null
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save storage configuration');
      }

      setSuccess('✓ Server configuration saved successfully');
      setTimeout(() => setSuccess(null), 5000);
      await loadStorageConfiguration();
    } catch (err) {
      setError(err.message || 'Failed to save storage configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleProxmoxChange = (e) => {
    const { name, value } = e.target;
    setProxmox(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleVelocityChange = (e) => {
    const { name, value } = e.target;
    setVelocity(prev => ({
      ...prev,
      [name]: name === 'port' ? parseInt(value) : value
    }));
  };

  const handleDnsChange = (e) => {
    const { name, value } = e.target;
    setDns(prev => ({
      ...prev,
      [name]: name === 'sshPort' ? parseInt(value) : value
    }));
  };

  const handleRouterChange = (e) => {
    const { name, value, type, checked } = e.target;
    setRouter(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const testProxmoxConnection = async () => {
    try {
      setTestingProxmox(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/admin/config/test-proxmox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: proxmox.host,
          username: proxmox.username,
          password: proxmox.password,
          realm: proxmox.realm
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ Proxmox connection successful');
        if (result.nodes) {
          setProxmoxNodes(result.nodes);
        }
      } else {
        setError(`✗ Connection failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingProxmox(false);
    }
  };

  const testVelocityConnection = async () => {
    try {
      setTestingVelocity(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/admin/config/test-velocity`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: velocity.host,
          sshPort: velocity.sshPort,
          sshUser: velocity.sshUser,
          sshKeyPath: velocity.sshKeyPath,
          configPath: velocity.configPath,
          serviceName: velocity.serviceName
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ Velocity connection successful');
      } else {
        setError(`✗ Connection failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingVelocity(false);
    }
  };

  const testVelocityPassword = async () => {
    try {
      setTestingVelocity(true);
      setError(null);

      if (!velocity.password) {
        setError('Password is required for testing');
        setTestingVelocity(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config/test-velocity-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: velocity.host,
          sshPort: velocity.sshPort,
          sshUser: velocity.sshUser,
          password: velocity.password
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ Password authentication successful! You can now setup SSH keys.');
      } else {
        setError(`✗ Authentication failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingVelocity(false);
    }
  };

  const setupVelocitySSH = async () => {
    try {
      setSettingUpVelocity(true);
      setError(null);
      setSuccess(null);

      if (!velocity.host || !velocity.password) {
        setError('Host and password are required');
        setSettingUpVelocity(false);
        return;
      }

      console.log('Setting up SSH authentication for Velocity...');

      const response = await fetch(`${apiBase}/api/admin/config/setup-velocity-ssh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: velocity.host,
          sshPort: velocity.sshPort,
          sshUser: velocity.sshUser,
          password: velocity.password,
          sshKeyPath: velocity.sshKeyPath,
          configPath: velocity.configPath,
          serviceName: velocity.serviceName
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`✓ ${result.message}`);
        // Clear password after successful setup
        setVelocity(prev => ({ ...prev, password: '' }));
        // Reload SSH status
        await loadVelocitySSHStatus();
        // Now save the configuration
        await saveVelocityConfig();
      } else {
        setError(`✗ Setup failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Setup error: ${err.message}`);
    } finally {
      setSettingUpVelocity(false);
    }
  };

  const testDnsPassword = async () => {
    try {
      setTestingDns(true);
      setError(null);

      if (!dns.password) {
        setError('Password is required for testing');
        setTestingDns(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config/test-dns-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: dns.host,
          sshPort: dns.sshPort,
          sshUser: dns.sshUser,
          password: dns.password
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ Password authentication successful! You can now setup SSH keys.');
      } else {
        setError(`✗ Authentication failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingDns(false);
    }
  };

  const setupDnsSSH = async () => {
    try {
      setSettingUpDns(true);
      setError(null);
      setSuccess(null);

      if (!dns.host || !dns.password) {
        setError('Host and password are required');
        setSettingUpDns(false);
        return;
      }

      console.log('Setting up SSH authentication for DNS...');

      const response = await fetch(`${apiBase}/api/admin/config/setup-dns-ssh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: dns.host,
          sshPort: dns.sshPort,
          sshUser: dns.sshUser,
          password: dns.password,
          sshKeyPath: dns.sshKeyPath,
          zone: dns.zone,
          zoneFile: dns.zoneFile
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(`✓ ${result.message}`);
        // Clear password after successful setup
        setDns(prev => ({ ...prev, password: '' }));
        // Reload SSH status
        await loadDnsSSHStatus();
        // Now save the configuration
        await saveDnsConfig();
      } else {
        setError(`✗ Setup failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Setup error: ${err.message}`);
    } finally {
      setSettingUpDns(false);
    }
  };

  const testDnsConnection = async () => {
    try {
      setTestingDns(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/admin/config/test-dns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: dns.host,
          sshPort: dns.sshPort,
          sshUser: dns.sshUser,
          sshKeyPath: dns.sshKeyPath,
          zone: dns.zone,
          zoneFile: dns.zoneFile
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ DNS connection successful');
      } else {
        setError(`✗ Connection failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingDns(false);
    }
  };

  const testRouterConnection = async () => {
    try {
      setTestingRouter(true);
      setError(null);

      const response = await fetch(`${apiBase}/api/admin/config/test-router`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          host: router.host,
          username: router.username,
          password: router.password,
          useHttps: router.useHttps
        })
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('✓ Router connection successful');
      } else {
        setError(`✗ Connection failed: ${result.error}`);
      }
    } catch (err) {
      setError(`Connection error: ${err.message}`);
    } finally {
      setTestingRouter(false);
    }
  };

  const saveProxmoxConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!proxmox.host || !proxmox.username || !proxmox.password) {
        setError('Proxmox host, username, and password are required');
        setLoading(false);
        return;
      }

      if (!node) {
        setError('Proxmox node name is required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          proxmox: {
            host: proxmox.host,
            username: proxmox.username,
            password: proxmox.password,
            realm: proxmox.realm
          },
          node: node
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save Proxmox configuration');
      }

      setSuccess('✓ Proxmox configuration saved successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveVelocityConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!velocity.host) {
        setError('Velocity host is required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          velocity: {
            host: velocity.host,
            sshPort: velocity.sshPort,
            sshUser: velocity.sshUser,
            sshKeyPath: velocity.sshKeyPath,
            configPath: velocity.configPath,
            serviceName: velocity.serviceName,
            backendNetwork: velocity.backendNetwork
          }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save Velocity configuration');
      }

      setSuccess('✓ Velocity configuration saved successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveDnsConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!dns.host) {
        setError('DNS host is required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          dns: {
            host: dns.host,
            sshPort: dns.sshPort,
            sshUser: dns.sshUser,
            sshKeyPath: dns.sshKeyPath,
            zone: dns.zone,
            zoneFile: dns.zoneFile
          }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save DNS configuration');
      }

      setSuccess('✓ DNS configuration saved successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveRouterConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!router.host || !router.username || !router.password) {
        setError('Router host, username, and password are required');
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          router: {
            host: router.host,
            username: router.username,
            password: router.password,
            useHttps: router.useHttps
          }
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save router configuration');
      }

      setSuccess('✓ Router configuration saved successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // User Management Functions
  const loadUsers = async () => {
    try {
      setLoadingUsers(true);
      setError(null);
      const response = await fetch(`${apiBase}/api/users`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        throw new Error('Failed to load users');
      }
    } catch (err) {
      console.error('Error loading users:', err);
      setError(err.message || 'Failed to load users');
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!newUser.username || !newUser.password) {
        setError('Username and password are required');
        return;
      }

      if (newUser.password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUser)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setSuccess('✓ User created successfully');
      setTimeout(() => setSuccess(null), 5000);
      setShowCreateUserForm(false);
      setNewUser({ username: '', email: '', password: '', role: 'user' });
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to create user');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUser = async (userId) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${apiBase}/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: editingUser.username,
          email: editingUser.email,
          role: editingUser.role
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      setSuccess('✓ User updated successfully');
      setTimeout(() => setSuccess(null), 5000);
      setEditingUser(null);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to update user');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (userId, newPassword) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      if (!newPassword || newPassword.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }

      const response = await fetch(`${apiBase}/api/admin/users/${userId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reset password');
      }

      setSuccess('✓ Password reset successfully');
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const response = await fetch(`${apiBase}/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setSuccess('✓ User deleted successfully');
      setTimeout(() => setSuccess(null), 5000);
      await loadUsers();
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="admin-settings">
        <div className="admin-alert">
          <p>Access denied. Only administrators can access this section.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-settings">
      <div className="settings-header">
        <h2>Server Configuration</h2>
        <p>Configure connections to Proxmox, Velocity, and other services</p>
      </div>

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'proxmox' ? 'active' : ''}`}
          onClick={() => setActiveTab('proxmox')}
        >
          Proxmox Configuration
        </button>
        <button
          className={`tab-button ${activeTab === 'velocity' ? 'active' : ''}`}
          onClick={() => setActiveTab('velocity')}
        >
          Velocity Configuration
        </button>
        <button
          className={`tab-button ${activeTab === 'dns' ? 'active' : ''}`}
          onClick={() => setActiveTab('dns')}
        >
          DNS Configuration
        </button>
        <button
          className={`tab-button ${activeTab === 'router' ? 'active' : ''}`}
          onClick={() => setActiveTab('router')}
        >
          Router Configuration
        </button>
        <button
          className={`tab-button ${activeTab === 'storage' ? 'active' : ''}`}
          onClick={() => setActiveTab('storage')}
        >
          Server Configuration
        </button>
        <button
          className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          User Management
        </button>
      </div>

      <div className="settings-content">
        {activeTab === 'proxmox' && (
          <div className="settings-section">
            <h3>Proxmox Server Configuration</h3>
            <p className="section-description">
              Configure your Proxmox server connection details for managing virtual machines.
            </p>

            <form className="settings-form">
              <div className="form-group">
                <label htmlFor="proxmox-host">Proxmox Host/IP:</label>
                <input
                  type="text"
                  id="proxmox-host"
                  name="host"
                  value={proxmox.host}
                  onChange={handleProxmoxChange}
                  placeholder="e.g., proxmox.example.com or 192.168.1.100"
                  disabled={loading}
                />
                <small>The hostname or IP address of your Proxmox server</small>
              </div>

              <div className="form-group">
                <label htmlFor="proxmox-username">Username:</label>
                <input
                  type="text"
                  id="proxmox-username"
                  name="username"
                  value={proxmox.username}
                  onChange={handleProxmoxChange}
                  placeholder="e.g., root or user@pam"
                  disabled={loading}
                />
                <small>Proxmox API user (typically root or a custom user with API permissions)</small>
              </div>

              <div className="form-group">
                <label htmlFor="proxmox-password">
                  Password/Token:
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowPasswords(prev => ({
                      ...prev,
                      proxmoxPassword: !prev.proxmoxPassword
                    }))}
                  >
                    {showPasswords.proxmoxPassword ? '🙈' : '👁️'}
                  </button>
                </label>
                <input
                  type={showPasswords.proxmoxPassword ? 'text' : 'password'}
                  id="proxmox-password"
                  name="password"
                  value={proxmox.password}
                  onChange={handleProxmoxChange}
                  placeholder="Password or API token"
                  disabled={loading}
                />
                <small>Your Proxmox password or API token</small>
              </div>

              <div className="form-group">
                <label htmlFor="proxmox-realm">Realm:</label>
                <input
                  type="text"
                  id="proxmox-realm"
                  name="realm"
                  value={proxmox.realm}
                  onChange={handleProxmoxChange}
                  placeholder="e.g., pam"
                  disabled={loading}
                />
                <small>Authentication realm (usually 'pam' for local or your LDAP/AD realm)</small>
              </div>

              <div className="form-group">
                <label htmlFor="proxmox-node">Default Node:</label>
                <div className="node-select-group">
                  {proxmoxNodes.length > 0 ? (
                    <select
                      id="proxmox-node"
                      value={node}
                      onChange={(e) => setNode(e.target.value)}
                      disabled={loading}
                    >
                      <option value="">Select a node...</option>
                      {proxmoxNodes.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      id="proxmox-node"
                      value={node}
                      onChange={(e) => setNode(e.target.value)}
                      placeholder="e.g., pve or pve-node-1"
                      disabled={loading}
                    />
                  )}
                  <small>The Proxmox node where VMs will be created (click 'Test Connection' to see available nodes)</small>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-test"
                  onClick={testProxmoxConnection}
                  disabled={loading || testingProxmox || !proxmox.host || !proxmox.username || !proxmox.password}
                >
                  {testingProxmox ? 'Testing...' : '🔗 Test Connection'}
                </button>
                <button
                  type="button"
                  className="btn-test"
                  onClick={saveProxmoxConfig}
                  disabled={loading || !proxmox.host || !proxmox.username || !proxmox.password || !node}
                >
                  {loading ? 'Saving...' : '💾 Save Proxmox Config'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'velocity' && (
          <div className="settings-section">
            <h3>Velocity Server Configuration (Optional)</h3>
            <p className="section-description">
              Configure Velocity for automatic server list management via SSH. The system will edit velocity.toml and reload the proxy when servers are cloned. Leave blank to skip this integration.
            </p>

            <form className="settings-form">
              <div className="form-group">
                <label htmlFor="velocity-host">Velocity Host/IP:</label>
                <input
                  type="text"
                  id="velocity-host"
                  name="host"
                  value={velocity.host}
                  onChange={handleVelocityChange}
                  placeholder="e.g., velocity.example.com or 192.168.1.50"
                  disabled={loading}
                />
                <small>The hostname or IP address of your Velocity server</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-ssh-port">SSH Port:</label>
                <input
                  type="number"
                  id="velocity-ssh-port"
                  name="sshPort"
                  value={velocity.sshPort}
                  onChange={handleVelocityChange}
                  placeholder="22"
                  disabled={loading}
                />
                <small>SSH port for connecting to Velocity server (default: 22)</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-ssh-user">SSH Username:</label>
                <input
                  type="text"
                  id="velocity-ssh-user"
                  name="sshUser"
                  value={velocity.sshUser}
                  onChange={handleVelocityChange}
                  placeholder="joseph"
                  disabled={loading}
                />
                <small>SSH username for connecting to Velocity server</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-password">
                  SSH Password:
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowPasswords(prev => ({
                      ...prev,
                      velocityPassword: !prev.velocityPassword
                    }))}
                  >
                    {showPasswords.velocityPassword ? '🙈' : '👁️'}
                  </button>
                </label>
                <input
                  type={showPasswords.velocityPassword ? 'text' : 'password'}
                  id="velocity-password"
                  name="password"
                  value={velocity.password}
                  onChange={handleVelocityChange}
                  placeholder="Password for initial SSH key setup"
                  disabled={loading}
                />
                <small>
                  {velocitySSHStatus?.hasSSHKey 
                    ? '✓ SSH key is configured. Password only needed if regenerating key.' 
                    : '⚠️ Password required for initial SSH key setup'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-ssh-key">SSH Private Key Path:</label>
                <input
                  type="text"
                  id="velocity-ssh-key"
                  name="sshKeyPath"
                  value={velocity.sshKeyPath}
                  onChange={handleVelocityChange}
                  placeholder="/root/.ssh/id_rsa_velocity"
                  disabled={loading}
                />
                <small>Path to SSH private key on the backend container (auto-generated)</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-config-path">Velocity Config Path:</label>
                <input
                  type="text"
                  id="velocity-config-path"
                  name="configPath"
                  value={velocity.configPath}
                  onChange={handleVelocityChange}
                  placeholder="/opt/velocity-proxy/velocity.toml"
                  disabled={loading}
                />
                <small>Path to velocity.toml on the Velocity server</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-service-name">Systemd Service Name:</label>
                <input
                  type="text"
                  id="velocity-service-name"
                  name="serviceName"
                  value={velocity.serviceName}
                  onChange={handleVelocityChange}
                  placeholder="velocity"
                  disabled={loading}
                />
                <small>Name of the systemd service to restart (e.g., velocity)</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-backend-network">Backend Network:</label>
                <input
                  type="text"
                  id="velocity-backend-network"
                  name="backendNetwork"
                  value={velocity.backendNetwork}
                  onChange={handleVelocityChange}
                  placeholder="e.g., 192.168.1"
                  disabled={loading}
                />
                <small>Network prefix for backend servers (e.g., 192.168.1 for VMs at 192.168.1.x)</small>
              </div>

              {velocitySSHStatus && (
                <div className="config-status">
                  <strong>SSH Status:</strong> {velocitySSHStatus.hasSSHKey ? '✓ Key configured' : '⚠️ Key not found'}
                </div>
              )}

              <div className="form-actions">
                {!velocitySSHStatus?.hasSSHKey && (
                  <>
                    <button
                      type="button"
                      className="btn-test"
                      onClick={testVelocityPassword}
                      disabled={loading || testingVelocity || !velocity.host || !velocity.password}
                    >
                      {testingVelocity ? 'Testing...' : '🔐 Test Password'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={setupVelocitySSH}
                      disabled={loading || settingUpVelocity || testingVelocity || !velocity.host || !velocity.password}
                    >
                      {settingUpVelocity ? 'Setting up...' : '🔑 Setup SSH Authentication'}
                    </button>
                  </>
                )}
                {velocitySSHStatus?.hasSSHKey && (
                  <>
                    <button
                      type="button"
                      className="btn-test"
                      onClick={testVelocityConnection}
                      disabled={loading || testingVelocity || !velocity.host}
                    >
                      {testingVelocity ? 'Testing...' : '🔗 Test SSH Connection'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={saveVelocityConfig}
                      disabled={loading || !velocity.host}
                    >
                      {loading ? 'Saving...' : '💾 Save Configuration'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'dns' && (
          <div className="settings-section">
            <h3>DNS Server Configuration (Optional)</h3>
            <p className="section-description">
              Configure BIND DNS server for automatic DNS record management. The system will update zone files when servers are cloned. Leave blank to skip this integration.
            </p>

            <form className="settings-form">
              <div className="form-group">
                <label htmlFor="dns-host">DNS Host/IP (comma-separated):</label>
                <input
                  type="text"
                  id="dns-host"
                  name="host"
                  value={dns.host}
                  onChange={handleDnsChange}
                  placeholder="e.g., 192.168.1.240,192.168.1.241"
                  disabled={loading}
                />
                <small>Hostname or IP address of your BIND DNS server(s). Use commas to configure multiple servers with the same credentials.</small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-ssh-port">SSH Port:</label>
                <input
                  type="number"
                  id="dns-ssh-port"
                  name="sshPort"
                  value={dns.sshPort}
                  onChange={handleDnsChange}
                  placeholder="22"
                  disabled={loading}
                />
                <small>SSH port for connecting to DNS server (default: 22)</small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-ssh-user">SSH Username:</label>
                <input
                  type="text"
                  id="dns-ssh-user"
                  name="sshUser"
                  value={dns.sshUser}
                  onChange={handleDnsChange}
                  placeholder="joseph"
                  disabled={loading}
                />
                <small>SSH username for connecting to DNS server</small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-password">
                  SSH Password:
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowPasswords(prev => ({
                      ...prev,
                      dnsPassword: !prev.dnsPassword
                    }))}
                  >
                    {showPasswords.dnsPassword ? '🙈' : '👁️'}
                  </button>
                </label>
                <input
                  type={showPasswords.dnsPassword ? 'text' : 'password'}
                  id="dns-password"
                  name="password"
                  value={dns.password}
                  onChange={handleDnsChange}
                  placeholder="Password for initial SSH key setup"
                  disabled={loading}
                />
                <small>
                  {dnsSSHStatus?.hasSSHKey 
                    ? '✓ SSH key is configured. Password only needed if regenerating key.' 
                    : '⚠️ Password required for initial SSH key setup'}
                </small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-ssh-key">SSH Private Key Path:</label>
                <input
                  type="text"
                  id="dns-ssh-key"
                  name="sshKeyPath"
                  value={dns.sshKeyPath}
                  onChange={handleDnsChange}
                  placeholder="/root/.ssh/id_rsa_dns"
                  disabled={loading}
                />
                <small>Path to SSH private key on the backend container (auto-generated)</small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-zone">DNS Zone:</label>
                <input
                  type="text"
                  id="dns-zone"
                  name="zone"
                  value={dns.zone}
                  onChange={handleDnsChange}
                  placeholder="zanarkand.site"
                  disabled={loading}
                />
                <small>Zone name managed on the DNS server (e.g., zanarkand.site)</small>
              </div>

              <div className="form-group">
                <label htmlFor="dns-zone-file">Zone File Path:</label>
                <input
                  type="text"
                  id="dns-zone-file"
                  name="zoneFile"
                  value={dns.zoneFile}
                  onChange={handleDnsChange}
                  placeholder="/var/lib/bind/zanarkand.site.hosts"
                  disabled={loading}
                />
                <small>Path to zone file on the DNS server</small>
              </div>

              {dnsSSHStatus && (
                <div className="config-status">
                  <strong>SSH Status:</strong> {dnsSSHStatus.hasSSHKey ? '✓ Key configured' : '⚠️ Key not found'}
                </div>
              )}

              <div className="form-actions">
                {!dnsSSHStatus?.hasSSHKey && (
                  <>
                    <button
                      type="button"
                      className="btn-test"
                      onClick={testDnsPassword}
                      disabled={loading || testingDns || !dns.host || !dns.password}
                    >
                      {testingDns ? 'Testing...' : '🔐 Test Password'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={setupDnsSSH}
                      disabled={loading || settingUpDns || testingDns || !dns.host || !dns.password}
                    >
                      {settingUpDns ? 'Setting up...' : '🔑 Setup SSH Authentication'}
                    </button>
                  </>
                )}
                {dnsSSHStatus?.hasSSHKey && (
                  <>
                    <button
                      type="button"
                      className="btn-test"
                      onClick={testDnsConnection}
                      disabled={loading || testingDns || !dns.host}
                    >
                      {testingDns ? 'Testing...' : '🔗 Test SSH Connection'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={saveDnsConfig}
                      disabled={loading || !dns.host}
                    >
                      {loading ? 'Saving...' : '💾 Save Configuration'}
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        )}

        {activeTab === 'router' && (
          <div className="settings-section">
            <h3>ASUS Router Configuration (Required for cloning)</h3>
            <p className="section-description">
              Configure ASUS router access for DHCP reservations. The clone process uses this to
              reserve an IP in the 192.168.1.225-230 range.
            </p>

            <form className="settings-form">
              <div className="form-group">
                <label htmlFor="router-host">Router Host/IP:</label>
                <input
                  type="text"
                  id="router-host"
                  name="host"
                  value={router.host}
                  onChange={handleRouterChange}
                  placeholder="e.g., 192.168.1.1"
                  disabled={loading}
                />
                <small>The hostname or IP address of your ASUS router</small>
              </div>

              <div className="form-group">
                <label htmlFor="router-username">Username:</label>
                <input
                  type="text"
                  id="router-username"
                  name="username"
                  value={router.username}
                  onChange={handleRouterChange}
                  placeholder="admin"
                  disabled={loading}
                />
                <small>Router admin username</small>
              </div>

              <div className="form-group">
                <label htmlFor="router-password">
                  Password:
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowPasswords(prev => ({
                      ...prev,
                      routerPassword: !prev.routerPassword
                    }))}
                  >
                    {showPasswords.routerPassword ? '🙈' : '👁️'}
                  </button>
                </label>
                <input
                  type={showPasswords.routerPassword ? 'text' : 'password'}
                  id="router-password"
                  name="password"
                  value={router.password}
                  onChange={handleRouterChange}
                  placeholder="Router password"
                  disabled={loading}
                />
                <small>Router admin password</small>
              </div>

              <div className="form-group">
                <label htmlFor="router-use-https">Use HTTPS:</label>
                <input
                  type="checkbox"
                  id="router-use-https"
                  name="useHttps"
                  checked={router.useHttps}
                  onChange={handleRouterChange}
                  disabled={loading}
                />
                <small>Most ASUS routers use HTTPS for the admin interface</small>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-test"
                  onClick={testRouterConnection}
                  disabled={loading || testingRouter || !router.host || !router.username || !router.password}
                >
                  {testingRouter ? 'Testing...' : '🔗 Test Connection'}
                </button>
                <button
                  type="button"
                  className="btn-test"
                  onClick={saveRouterConfig}
                  disabled={loading || !router.host || !router.username || !router.password}
                >
                  {loading ? 'Saving...' : '💾 Save Router Config'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="settings-section">
            <h3>Server Configuration</h3>
            <p className="section-description">
              Select which Proxmox hosts and storages users can choose from during cloning.
            </p>

            <form className="settings-form">
              <div className="form-group">
                <label htmlFor="base-server-select">Base Server Template:</label>
                <select
                  id="base-server-select"
                  value={selectedBaseServerVmid}
                  onChange={(e) => setSelectedBaseServerVmid(e.target.value)}
                  disabled={loading || loadingStorages}
                >
                  <option value="">Select a base managed server...</option>
                  {baseServerOptions.map((server) => (
                    <option key={server.vmid} value={server.vmid}>
                      {server.name} (VMID: {server.vmid})
                    </option>
                  ))}
                </select>
                <small>
                  New "Create Server" operations clone from this server template.
                </small>
              </div>

              <div className="form-group">
                <label>Available Proxmox Hosts:</label>
                {loadingStorages ? (
                  <div>Loading host list...</div>
                ) : hostOptions.length === 0 ? (
                  <div>No hosts found. Check Proxmox configuration and connection.</div>
                ) : (
                  <div className="storage-options-list">
                    {hostOptions.map((host) => {
                      const checked = selectedHosts.includes(host.name);
                      return (
                        <div key={host.name} className="storage-option-row">
                          <label className="storage-option-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleHostToggle(host.name)}
                              disabled={loading || loadingStorages}
                              className="storage-option-checkbox"
                            />
                            {host.name}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
                <small>Clone form will always show only checked hosts.</small>
              </div>

              <div className="form-group">
                <label>Available Storages:</label>
                {loadingStorages ? (
                  <div>Loading storage list...</div>
                ) : storageOptions.length === 0 ? (
                  <div>No storages found. Check Proxmox configuration and connection.</div>
                ) : (
                  <div className="storage-options-list">
                    {storageOptions.map((storage) => {
                      const checked = selectedStorages.includes(storage.name);
                      return (
                        <div key={storage.name} className="storage-option-row">
                          <label className="storage-option-label">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleStorageToggle(storage.name)}
                              disabled={loading || loadingStorages}
                              className="storage-option-checkbox"
                            />
                            {storage.name} ({storage.type}) - {storage.availableGB} GB available / {storage.sizeGB} GB total
                          </label>
                        </div>
                      );
                    })}
                  </div>
                )}
                <small>Clone form will always show only checked storages.</small>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-test"
                  onClick={loadStorageConfiguration}
                  disabled={loading || loadingStorages}
                >
                  {loadingStorages ? 'Refreshing...' : '🔄 Refresh Server List'}
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={saveStorageConfig}
                  disabled={loading || loadingStorages}
                >
                  {loading ? 'Saving...' : '💾 Save Server Config'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="settings-section">
            <h3>User Management</h3>
            <p className="section-description">
              Create and manage user accounts for the Minecraft Server Manager.
            </p>

            <div className="users-section">
              <div className="form-actions" style={{ marginBottom: '20px' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowCreateUserForm(!showCreateUserForm)}
                  disabled={loading}
                >
                  {showCreateUserForm ? '✕ Cancel' : '➕ Create New User'}
                </button>
              </div>

              {showCreateUserForm && (
                <form className="settings-form" onSubmit={handleCreateUser} style={{ marginBottom: '30px', border: '1px solid #ddd', padding: '20px', borderRadius: '8px' }}>
                  <h4>Create New User</h4>
                  <div className="form-group">
                    <label htmlFor="new-username">Username: *</label>
                    <input
                      type="text"
                      id="new-username"
                      value={newUser.username}
                      onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                      placeholder="Enter username"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-email">Email:</label>
                    <input
                      type="email"
                      id="new-email"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                      placeholder="user@example.com (optional)"
                      disabled={loading}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-password">
                      Password: *
                      <button
                        type="button"
                        className="show-password-btn"
                        onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                      >
                        {showNewUserPassword ? '🙈' : '👁️'}
                      </button>
                    </label>
                    <input
                      type={showNewUserPassword ? 'text' : 'password'}
                      id="new-password"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="Minimum 6 characters"
                      required
                      minLength={6}
                      disabled={loading}
                    />
                    <small>Password must be at least 6 characters long</small>
                  </div>

                  <div className="form-group">
                    <label htmlFor="new-role">Role:</label>
                    <select
                      id="new-role"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                      disabled={loading}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                    <small>Admins have full access to all settings and can manage users</small>
                  </div>

                  <div className="form-actions">
                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={loading || !newUser.username || !newUser.password}
                    >
                      {loading ? 'Creating...' : '✓ Create User'}
                    </button>
                  </div>
                </form>
              )}

              {loadingUsers ? (
                <div style={{ textAlign: 'center', padding: '20px' }}>Loading users...</div>
              ) : users.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                  No users found. Click "Create New User" to add one.
                </div>
              ) : (
                <div className="users-list">
                  <table className="users-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #ddd' }}>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Username</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Role</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Created</th>
                        <th style={{ padding: '12px', textAlign: 'left' }}>Last Login</th>
                        <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} style={{ borderBottom: '1px solid #eee' }}>
                          {editingUser?.id === user.id ? (
                            <>
                              <td style={{ padding: '12px' }}>
                                <input
                                  type="text"
                                  value={editingUser.username}
                                  onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                                  style={{ width: '100%', padding: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '12px' }}>
                                <input
                                  type="email"
                                  value={editingUser.email || ''}
                                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                                  style={{ width: '100%', padding: '4px' }}
                                />
                              </td>
                              <td style={{ padding: '12px' }}>
                                <select
                                  value={editingUser.role}
                                  onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                                  style={{ width: '100%', padding: '4px' }}
                                >
                                  <option value="user">User</option>
                                  <option value="admin">Admin</option>
                                </select>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {new Date(user.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button
                                  onClick={() => handleUpdateUser(user.id)}
                                  disabled={loading}
                                  style={{ marginRight: '8px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  ✓ Save
                                </button>
                                <button
                                  onClick={() => setEditingUser(null)}
                                  disabled={loading}
                                  style={{ padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  ✕ Cancel
                                </button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '12px' }}>{user.username}</td>
                              <td style={{ padding: '12px' }}>{user.email || '-'}</td>
                              <td style={{ padding: '12px' }}>
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  backgroundColor: user.role === 'admin' ? '#3b82f6' : '#6b7280',
                                  color: 'white',
                                  fontSize: '12px'
                                }}>
                                  {user.role}
                                </span>
                              </td>
                              <td style={{ padding: '12px' }}>
                                {new Date(user.created_at).toLocaleDateString()}
                              </td>
                              <td style={{ padding: '12px' }}>
                                {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <button
                                  onClick={() => setEditingUser({ ...user })}
                                  disabled={loading}
                                  title="Edit user"
                                  style={{ marginRight: '8px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  onClick={() => {
                                    const newPassword = prompt(`Enter new password for ${user.username} (min 6 characters):`);
                                    if (newPassword) {
                                      handleResetPassword(user.id, newPassword);
                                    }
                                  }}
                                  disabled={loading}
                                  title="Reset password"
                                  style={{ marginRight: '8px', padding: '4px 8px', cursor: 'pointer' }}
                                >
                                  🔑 Reset Password
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(user.id, user.username)}
                                  disabled={loading}
                                  title="Delete user"
                                  style={{ padding: '4px 8px', cursor: 'pointer', color: '#dc2626' }}
                                >
                                  🗑️ Delete
                                </button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="alert-close">✕</button>
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="alert-close">✕</button>
        </div>
      )}
    </div>
  );
}

export default AdminSettings;
