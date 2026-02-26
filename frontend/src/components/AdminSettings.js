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
    port: 8233,
    apiKey: '',
    backendNetwork: '192.168.1'
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
  const [testingRouter, setTestingRouter] = useState(false);
  const [proxmoxNodes, setProxmoxNodes] = useState([]);
  const [showPasswords, setShowPasswords] = useState({
    proxmoxPassword: false,
    velocityApiKey: false,
    routerPassword: false
  });
  const [activeTab, setActiveTab] = useState('proxmox');

  useEffect(() => {
    loadConfiguration();
  }, []);

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
          port: parseInt(config.velocity_port?.value || 8233),
          apiKey: '',
          backendNetwork: config.velocity_backend_network?.value || '192.168.1'
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
          port: velocity.port,
          apiKey: velocity.apiKey
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

      if (!velocity.host || !velocity.port || !velocity.apiKey) {
        setError('Velocity host, port, and API key are required');
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
            port: velocity.port,
            apiKey: velocity.apiKey,
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
          className={`tab-button ${activeTab === 'router' ? 'active' : ''}`}
          onClick={() => setActiveTab('router')}
        >
          Router Configuration
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
              Configure Velocity for automatic server list management. Leave blank to skip this integration.
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
                <label htmlFor="velocity-port">Port:</label>
                <input
                  type="number"
                  id="velocity-port"
                  name="port"
                  value={velocity.port}
                  onChange={handleVelocityChange}
                  placeholder="8233"
                  disabled={loading}
                />
                <small>Velocity API server port (default: 8233)</small>
              </div>

              <div className="form-group">
                <label htmlFor="velocity-api-key">
                  API Key:
                  <button
                    type="button"
                    className="show-password-btn"
                    onClick={() => setShowPasswords(prev => ({
                      ...prev,
                      velocityApiKey: !prev.velocityApiKey
                    }))}
                  >
                    {showPasswords.velocityApiKey ? '🙈' : '👁️'}
                  </button>
                </label>
                <input
                  type={showPasswords.velocityApiKey ? 'text' : 'password'}
                  id="velocity-api-key"
                  name="apiKey"
                  value={velocity.apiKey}
                  onChange={handleVelocityChange}
                  placeholder="Your Velocity API key"
                  disabled={loading}
                />
                <small>API key for authenticating with the Velocity server</small>
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

              <div className="form-actions">
                <button
                  type="button"
                  className="btn-test"
                  onClick={testVelocityConnection}
                  disabled={loading || testingVelocity || !velocity.host || !velocity.apiKey}
                >
                  {testingVelocity ? 'Testing...' : '🔗 Test Connection'}
                </button>                <button
                  type="button"
                  className="btn-test"
                  onClick={saveVelocityConfig}
                  disabled={loading || !velocity.host || !velocity.port || !velocity.apiKey}
                >
                  {loading ? 'Saving...' : '💾 Save Velocity Config'}
                </button>              </div>
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
