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
  const [repositoryPlugins, setRepositoryPlugins] = useState([]);
  const [popularPlugins, setPopularPlugins] = useState([]);
  const [pluginSearchQuery, setPluginSearchQuery] = useState('');
  const [pluginSearchPage, setPluginSearchPage] = useState(1);
  const [pluginSearchTotalPages, setPluginSearchTotalPages] = useState(1);
  const [popularPluginsPage, setPopularPluginsPage] = useState(1);
  const [pluginSearchLoading, setPluginSearchLoading] = useState(false);
  const [pluginMetadata, setPluginMetadata] = useState({});

  // Version management state
  const [currentVersion, setCurrentVersion] = useState(null);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [updating, setUpdating] = useState(false);

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

            // Fetch metadata for installed plugins
            const metadata = {};
            for (const pluginName of data.plugins) {
              try {
                // Extract plugin name without version numbers and suffixes
                // Examples: 
                //   "EssentialsX-2.22.0.jar" -> "essentialsx"
                //   "Chunky-Bukkit-1.4.40.jar" -> "chunky"
                //   "bluemap-5.11-paper.jar" -> "bluemap"
                //   "CoreProtect-23.2.jar" -> "coreprotect"
                let slug = pluginName.replace(/\.jar$/i, ''); // Remove .jar
                
                // Remove common suffixes like -Bukkit, -Paper, -Spigot, etc.
                slug = slug.replace(/-?(Bukkit|Paper|Spigot|Sponge|Velocity|Waterfall)$/i, '');
                
                // Remove version patterns (numbers, dots, dashes at the end)
                // Match patterns like: -1.2.3, -v1.2.3, _1.2.3, 1.2.3, -dev+123, etc.
                slug = slug.replace(/[-_]?(v?\d+[\d\.\-+]+[\w\-+]*)$/i, '');
                
                // Convert to lowercase and replace spaces/underscores with dashes
                slug = slug.toLowerCase().replace(/[_\s]+/g, '-');
                
                console.log(`Looking up plugin: ${pluginName} -> slug: ${slug}`);
                
                const metaRes = await fetch(
                  `${process.env.REACT_APP_API_URL}/api/minecraft/plugins/${slug}`,
                  { headers: { 'Authorization': `Bearer ${token}` } }
                );
                if (metaRes.ok) {
                  const metaData = await metaRes.json();
                  if (metaData.found !== false) {
                    metadata[pluginName] = metaData;
                  }
                }
              } catch (err) {
                console.error(`Failed to fetch metadata for ${pluginName}:`, err);
              }
            }
            setPluginMetadata(metadata);
          }

          // Load popular plugins (paginated)
          try {
            const popularRes = await fetch(
              `${process.env.REACT_APP_API_URL}/api/minecraft/plugins/popular?page=${popularPluginsPage}`,
              { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (popularRes.ok) {
              const data = await popularRes.json();
              setPopularPlugins(data.plugins);
            }
          } catch (err) {
            console.error('Failed to load popular plugins:', err);
          }
          break;

        case 'version':
          const versionRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/version`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (versionRes.ok) {
            const data = await versionRes.json();
            setCurrentVersion(data.version);
          }

          const versionsRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/minecraft/versions`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (versionsRes.ok) {
            const data = await versionsRes.json();
            setAvailableVersions(data.versions.slice(0, 10));
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

  const handleUpgradePlugin = async (pluginName) => {
    if (!window.confirm(`Upgrade plugin ${pluginName} to the latest version? Server restart required to apply.`)) return;
    
    setLoading(true);
    setError('');
    setSuccess('');
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins/${pluginName}/upgrade`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to upgrade plugin');
      }

      const data = await response.json();
      setSuccess(data.message || 'Plugin upgraded successfully!');
      setTimeout(() => loadTabData('plugins'), 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const searchRepositoryPlugins = async (query, page = 1) => {
    setPluginSearchLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('authToken');
      const url = new URL(`${process.env.REACT_APP_API_URL}/api/minecraft/plugins/repository`);
      url.searchParams.set('search', query);
      url.searchParams.set('page', page);

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error('Failed to search plugins');
      }

      const data = await response.json();
      setRepositoryPlugins(data.plugins);
      setPluginSearchPage(page);
      setPluginSearchTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setPluginSearchLoading(false);
    }
  };

  const handlePopularPluginsPageChange = async (newPage) => {
    setPluginSearchLoading(true);
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/minecraft/plugins/popular?page=${newPage}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setPopularPlugins(data.plugins);
        setPopularPluginsPage(newPage);
      }
    } catch (err) {
      console.error('Failed to load popular plugins page:', err);
    } finally {
      setPluginSearchLoading(false);
    }
  };

  const installPluginFromRepository = async (pluginSlug) => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/plugins/install-from-repo`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ pluginName: pluginSlug })
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to install plugin');
      }

      setSuccess('Plugin installed! Restart server to load it.');
      setPluginSearchQuery('');
      setRepositoryPlugins([]);
      setTimeout(() => loadTabData('plugins'), 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePaperMC = async () => {
    if (!selectedVersion) {
      setError('Please select a version to update to');
      return;
    }

    if (!window.confirm(`Update PaperMC to version ${selectedVersion}? Server restart required.`)) {
      return;
    }

    setUpdating(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/minecraft/version`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ version: selectedVersion })
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update PaperMC');
      }

      const data = await response.json();
      setSuccess(data.message || 'PaperMC updated successfully! Restart the server to apply.');
      setSelectedVersion('');
      setTimeout(() => loadTabData('version'), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating(false);
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
            className={activeTab === 'version' ? 'active' : ''}
            onClick={() => setActiveTab('version')}
          >
            Version
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
              {/* Plugin Browser Section */}
              <div className="plugin-browser">
                <div className="plugin-browser-header">
                  <h3>Browse Plugins</h3>
                  <p className="plugin-browser-subtitle">Find and install plugins from PaperMC Hangar</p>
                </div>

                <div className="plugin-search-section">
                  <div className="repo-search">
                    <input
                      type="text"
                      placeholder="Search PaperMC plugins (e.g., EssentialsX, WorldEdit)..."
                      value={pluginSearchQuery}
                      onChange={(e) => setPluginSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && searchRepositoryPlugins(pluginSearchQuery)}
                    />
                    <button 
                      onClick={() => {
                        setPluginSearchPage(1);
                        searchRepositoryPlugins(pluginSearchQuery, 1);
                      }}
                      disabled={pluginSearchLoading || !pluginSearchQuery}
                    >
                      {pluginSearchLoading ? '🔍 Searching...' : '🔍 Search'}
                    </button>
                  </div>
                </div>

                {(repositoryPlugins.length > 0 || popularPlugins.length > 0 || !pluginSearchQuery) && (
                  <div className="plugin-results-container">
                    <div className="plugin-results-header">
                      <h4>
                        {repositoryPlugins.length > 0 
                          ? `Search Results (${repositoryPlugins.length})` 
                          : 'Popular Plugins'}
                      </h4>
                    </div>
                    
                    <div className="plugin-grid">
                      {(repositoryPlugins.length > 0 ? repositoryPlugins : popularPlugins).map((plugin) => (
                        <div key={plugin.slug} className="plugin-card">
                          <div className="plugin-card-header">
                            <div className="plugin-icon-container">
                              {plugin.icon && (
                                <img 
                                  src={plugin.icon} 
                                  alt={plugin.name} 
                                  className="plugin-card-icon" 
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const placeholder = e.target.nextElementSibling;
                                    if (placeholder) placeholder.style.display = 'flex';
                                  }}
                                />
                              )}
                              <div className="plugin-icon-placeholder">📦</div>
                            </div>
                            <div className="plugin-card-title-section">
                              <h5 className="plugin-card-title">{plugin.name}</h5>
                              <p className="plugin-card-author">by {plugin.author}</p>
                            </div>
                          </div>

                          <p className="plugin-card-description">{plugin.description}</p>

                          <div className="plugin-card-footer">
                            <div className="plugin-stats">
                              <span className="stat-item">
                                📥 {plugin.downloads?.toLocaleString() || 0}
                              </span>
                            </div>
                            <button 
                              onClick={() => installPluginFromRepository(plugin.slug)}
                              disabled={loading}
                              className="install-btn"
                            >
                              {loading ? 'Installing...' : 'Install'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination */}
                    {(repositoryPlugins.length > 0 || popularPlugins.length > 0) && (
                      <div className="pagination-container">
                        <button 
                          className="pagination-btn"
                          onClick={() => {
                            if (repositoryPlugins.length > 0) {
                              if (pluginSearchPage > 1) searchRepositoryPlugins(pluginSearchQuery, pluginSearchPage - 1);
                            } else {
                              if (popularPluginsPage > 1) handlePopularPluginsPageChange(popularPluginsPage - 1);
                            }
                          }}
                          disabled={pluginSearchLoading || (repositoryPlugins.length > 0 ? pluginSearchPage === 1 : popularPluginsPage === 1)}
                        >
                          ← Previous
                        </button>
                        
                        <span className="page-indicator">
                          Page {repositoryPlugins.length > 0 ? pluginSearchPage : popularPluginsPage}
                        </span>
                        
                        <button 
                          className="pagination-btn"
                          onClick={() => {
                            if (repositoryPlugins.length > 0) {
                              if (pluginSearchPage < pluginSearchTotalPages) searchRepositoryPlugins(pluginSearchQuery, pluginSearchPage + 1);
                            } else {
                              handlePopularPluginsPageChange(popularPluginsPage + 1);
                            }
                          }}
                          disabled={pluginSearchLoading || (repositoryPlugins.length > 0 && pluginSearchPage >= pluginSearchTotalPages)}
                        >
                          Next →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Installed Plugins Section */}
              <div className="installed-plugins-section">
                <h3>Installed Plugins ({plugins.length})</h3>
                {plugins.length === 0 ? (
                  <div className="no-plugins">
                    <p>No plugins installed yet</p>
                  </div>
                ) : (
                  <div className="installed-plugin-grid">
                    {plugins.map((plugin) => {
                      const metadata = pluginMetadata[plugin];
                      return (
                        <div key={plugin} className="installed-plugin-card">
                          <div className="installed-plugin-header">
                            <div className="plugin-icon-container-small">
                              {metadata?.icon && (
                                <img 
                                  src={metadata.icon} 
                                  alt={plugin} 
                                  className="installed-plugin-icon" 
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    const placeholder = e.target.nextElementSibling;
                                    if (placeholder) placeholder.style.display = 'flex';
                                  }}
                                />
                              )}
                              <div className="plugin-icon-placeholder-small">📦</div>
                            </div>
                            <div className="installed-plugin-title-section">
                              <h5 className="installed-plugin-name">{plugin}</h5>
                              {metadata?.author && (
                                <p className="installed-plugin-author">by {metadata.author}</p>
                              )}
                            </div>
                          </div>

                          {metadata?.description && (
                            <p className="installed-plugin-description">{metadata.description}</p>
                          )}

                          <div className="installed-plugin-actions">
                            <button 
                              onClick={() => handleUpgradePlugin(plugin)} 
                              disabled={loading}
                              className="upgrade-btn"
                            >
                              ⬆️ Upgrade
                            </button>
                            <button 
                              onClick={() => handleDeletePlugin(plugin)} 
                              disabled={loading}
                              className="delete-btn"
                            >
                              🗑 Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Alternative Installation Methods */}
              <div className="alternative-install">
                <h3>Alternative Installation Methods</h3>
                
                <div className="install-from-url">
                  <h4>Install from URL</h4>
                  <input
                    type="text"
                    placeholder="Plugin file name (e.g., CustomPlugin.jar)"
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
                  <h4>Upload Plugin File</h4>
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

          {activeTab === 'version' && (
            <div className="version-tab">
              <div className="version-info">
                <h3>PaperMC Version Management</h3>
                {currentVersion && (
                  <div className="current-version">
                    <p><strong>Current Version:</strong> {currentVersion || 'Not a PaperMC server'}</p>
                  </div>
                )}
              </div>

              <div className="version-update">
                <h4>Update to Latest Version</h4>
                <div className="version-selector">
                  <select 
                    value={selectedVersion} 
                    onChange={(e) => setSelectedVersion(e.target.value)}
                    disabled={updating}
                  >
                    <option value="">-- Select a version --</option>
                    {availableVersions.map((version) => (
                      <option key={version} value={version}>
                        {version}
                      </option>
                    ))}
                  </select>
                  <button 
                    onClick={handleUpdatePaperMC} 
                    disabled={updating || !selectedVersion}
                  >
                    {updating ? '⏳ Updating...' : '📥 Update PaperMC'}
                  </button>
                </div>
                <p className="version-note">⚠️ Server will need to restart for changes to take effect.</p>
              </div>
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
