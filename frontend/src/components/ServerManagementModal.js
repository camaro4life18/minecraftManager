import React, { useState, useEffect } from 'react';

function ServerManagementModal({ server, onClose }) {
  const [activeTab, setActiveTab] = useState('status');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // State for different tabs
  const [status, setStatus] = useState(null);
  const [properties, setProperties] = useState({});
  const [plugins, setPlugins] = useState([]);
  const [logs, setLogs] = useState('');
  const [systemInfo, setSystemInfo] = useState('');
  const [sshConfigured, setSshConfigured] = useState(false);

  // Plugin installation state
  const [pluginName, setPluginName] = useState('');
  const [pluginUrl, setPluginUrl] = useState('');
  const [uploadFile, setUploadFile] = useState(null);

  // Property edit state
  const [editingProperties, setEditingProperties] = useState(false);
  const [propertyEdits, setPropertyEdits] = useState({});

  useEffect(() => {
    checkSSHConfig();
  }, []);

  useEffect(() => {
    if (sshConfigured && activeTab) {
      loadTabData(activeTab);
    }
  }, [activeTab, sshConfigured]);

  const checkSSHConfig = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/ssh-config`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setSshConfigured(data.configured);
      }
    } catch (err) {
      console.error('Failed to check SSH config:', err);
    }
  };

  const loadTabData = async (tab) => {
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('authToken');
      
      switch(tab) {
        case 'status':
          const statusRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/status`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (statusRes.ok) {
            setStatus(await statusRes.json());
          }
          break;
          
        case 'properties':
          const propsRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/properties`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (propsRes.ok) {
            const props = await propsRes.json();
            setProperties(props);
            setPropertyEdits(props);
          }
          break;
          
        case 'plugins':
          const pluginsRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (pluginsRes.ok) {
            const data = await pluginsRes.json();
            setPlugins(data.plugins);
          }
          break;
          
        case 'logs':
          const logsRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/logs?lines=200`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (logsRes.ok) {
            const data = await logsRes.json();
            setLogs(data.logs);
          }
          break;
          
        case 'system':
          const infoRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/system/info`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (infoRes.ok) {
            const data = await infoRes.json();
            setSystemInfo(data.info);
          }
          break;
      }
    } catch (err) {
      setError(`Failed to load ${tab} data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleServerAction = async (action) => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/${action}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) {
        throw new Error(`Failed to ${action} server`);
      }
      
      setSuccess(`Server ${action} successful!`);
      setTimeout(() => loadTabData('status'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProperties = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/properties`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(propertyEdits)
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to update properties');
      }
      
      setSuccess('Properties updated! Restart server to apply changes.');
      setEditingProperties(false);
      setProperties(propertyEdits);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleInstallPlugin = async () => {
    if (!pluginName || !pluginUrl) {
      setError('Please provide plugin name and download URL');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginName, downloadUrl: pluginUrl })
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to install plugin');
      }
      
      setSuccess('Plugin installed! Restart server to load it.');
      setPluginName('');
      setPluginUrl('');
      setTimeout(() => loadTabData('plugins'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPlugin = async () => {
    if (!uploadFile) {
      setError('Please select a file to upload');
      return;
    }
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const formData = new FormData();
      formData.append('plugin', uploadFile);
      
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to upload plugin');
      }
      
      setSuccess('Plugin uploaded! Restart server to load it.');
      setUploadFile(null);
      setTimeout(() => loadTabData('plugins'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePlugin = async (pluginName) => {
    if (!window.confirm(`Delete plugin ${pluginName}?`)) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins/${pluginName}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) {
        throw new Error('Failed to delete plugin');
      }
      
      setSuccess('Plugin deleted!');
      setTimeout(() => loadTabData('plugins'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!sshConfigured) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h2>SSH Not Configured</h2>
          <p>SSH must be configured before you can manage this server.</p>
          <p>Click the "Configure SSH" button for this server first.</p>
          <div className="modal-actions">
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <h2>Manage {server.name}</h2>
        
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
        
        <div className="tabs">
          <button 
            className={activeTab === 'status' ? 'active' : ''}
            onClick={() => setActiveTab('status')}
          >
            Status
          </button>
          <button 
            className={activeTab === 'properties' ? 'active' : ''}
            onClick={() => setActiveTab('properties')}
          >
            Properties
          </button>
          <button 
            className={activeTab === 'plugins' ? 'active' : ''}
            onClick={() => setActiveTab('plugins')}
          >
            Plugins
          </button>
          <button 
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            Logs
          </button>
          <button 
            className={activeTab === 'system' ? 'active' : ''}
            onClick={() => setActiveTab('system')}
          >
            System
          </button>
        </div>

        <div className="tab-content">
          {loading && <div className="loading">Loading...</div>}
          
          {activeTab === 'status' && status && (
            <div className="status-tab">
              <div className="status-info">
                <p><strong>Status:</strong> {status.running ? '🟢 Running' : '🔴 Stopped'}</p>
                <p><strong>Auto-start:</strong> {status.enabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              
              <div className="server-actions">
                <button onClick={() => handleServerAction('start')} disabled={loading || status.running}>
                  Start Server
                </button>
                <button onClick={() => handleServerAction('stop')} disabled={loading || !status.running}>
                  Stop Server
                </button>
                <button onClick={() => handleServerAction('restart')} disabled={loading}>
                  Restart Server
                </button>
              </div>
            </div>
          )}
          
          {activeTab === 'properties' && (
            <div className="properties-tab">
              <div className="properties-header">
                <h3>Server Properties</h3>
                {!editingProperties && (
                  <button onClick={() => setEditingProperties(true)}>Edit</button>
                )}
                {editingProperties && (
                  <>
                    <button onClick={handleSaveProperties}>Save</button>
                    <button onClick={() => {
                      setEditingProperties(false);
                      setPropertyEdits(properties);
                    }}>Cancel</button>
                  </>
                )}
              </div>
              
              <div className="properties-list">
                {Object.entries(editingProperties ? propertyEdits : properties).map(([key, value]) => (
                  <div key={key} className="property-item">
                    <label>{key}:</label>
                    {editingProperties ? (
                      <input
                        type="text"
                        value={propertyEdits[key]}
                        onChange={(e) => setPropertyEdits({
                          ...propertyEdits,
                          [key]: e.target.value
                        })}
                      />
                    ) : (
                      <span>{value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {activeTab === 'plugins' && (
            <div className="plugins-tab">
              <div className="plugin-install">
                <h3>Install Plugin</h3>
                
                <div className="install-from-url">
                  <h4>From URL</h4>
                  <input
                    type="text"
                    placeholder="Plugin file name (e.g., EssentialsX.jar)"
                    value={pluginName}
                    onChange={(e) => setPluginName(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Download URL"
                    value={pluginUrl}
                    onChange={(e) => setPluginUrl(e.target.value)}
                  />
                  <button onClick={handleInstallPlugin} disabled={loading}>
                    Install from URL
                  </button>
                </div>
                
                <div className="install-from-file">
                  <h4>Upload File</h4>
                  <input
                    type="file"
                    accept=".jar"
                    onChange={(e) => setUploadFile(e.target.files[0])}
                  />
                  <button onClick={handleUploadPlugin} disabled={loading || !uploadFile}>
                    Upload Plugin
                  </button>
                </div>
              </div>
              
              <div className="installed-plugins">
                <h3>Installed Plugins ({plugins.length})</h3>
                <ul>
                  {plugins.map((plugin) => (
                    <li key={plugin}>
                      <span>{plugin}</span>
                      <button onClick={() => handleDeletePlugin(plugin)}>Delete</button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          {activeTab === 'logs' && (
            <div className="logs-tab">
              <div className="logs-header">
                <h3>Server Logs (Last 200 lines)</h3>
                <button onClick={() => loadTabData('logs')}>Refresh</button>
              </div>
              <pre className="logs-content">{logs}</pre>
            </div>
          )}
          
          {activeTab === 'system' && (
            <div className="system-tab">
              <div className="system-header">
                <h3>System Information</h3>
                <button onClick={() => loadTabData('system')}>Refresh</button>
              </div>
              <pre className="system-info">{systemInfo}</pre>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default ServerManagementModal;
