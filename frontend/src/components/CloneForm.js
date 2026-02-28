import React, { useState, useEffect } from 'react';
import '../styles/CloneForm.css';

function CloneForm({ sourceServer, onClose, onSuccess, apiBase, token }) {
  const [formData, setFormData] = useState({
    newVmId: '',
    domainName: '',
    seedOption: 'random',
    customSeed: '',
    targetNode: '',
    targetStorage: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [storage, setStorage] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [consoleLogs, setConsoleLogs] = useState([]);
  const [showConsole, setShowConsole] = useState(false);
  const [clonedVmId, setClonedVmId] = useState(null);
  const [cloneProgress, setCloneProgress] = useState(0);
  const [cloneStep, setCloneStep] = useState('');

  // Prevent closing modal by clicking overlay when loading
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  // Fetch available nodes and storage when component mounts
  useEffect(() => {
    const fetchCloneOptions = async () => {
      try {
        setOptionsLoading(true);
        const response = await fetch(`${apiBase}/api/clone-options`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch clone options');
        }

        const data = await response.json();
        console.log('📋 Clone options response:', data);
        setNodes(data.nodes || []);
        setStorage(data.storage || []);
        
        if (!data.storage || data.storage.length === 0) {
          console.warn('⚠️ No storage options returned from API');
        }
      } catch (err) {
        console.error('❌ Failed to fetch clone options:', err);
        // Don't show error, just proceed without options
      } finally {
        setOptionsLoading(false);
      }
    };

    fetchCloneOptions();
  }, [apiBase, token]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Auto-generate domain name based on VM ID or use a default pattern
  const handleVmIdChange = (e) => {
    const vmId = e.target.value;
    const numericPart = vmId.replace(/\D/g, ''); // Extract numbers
    
    setFormData(prev => ({
      ...prev,
      newVmId: vmId,
      domainName: numericPart ? `minecraft${numericPart.slice(-2).padStart(2, '0')}.zanarkand.site` : prev.domainName
    }));
  };

  const handleSeedOptionChange = (e) => {
    setFormData(prev => ({
      ...prev,
      seedOption: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.domainName) {
      setError('Domain name is required');
      return;
    }

    // Validate custom seed if selected
    if (formData.seedOption === 'custom' && !formData.customSeed.trim()) {
      setError('Custom seed value is required when using custom seed option');
      return;
    }

    let requestProgressInterval = null;

    try {
      setLoading(true);
      setError(null);
      setConsoleLogs(['🚀 Starting clone operation...']);
      setShowConsole(true);
      setCloneProgress(1);
      setCloneStep('starting_clone');

      const seed = formData.seedOption === 'random' ? 'random' : formData.customSeed.trim();

      const payload = {
        sourceVmId: sourceServer.vmid,
        domainName: formData.domainName,
        seed: seed
      };

      // Only include newVmId if user specified one, otherwise Proxmox will auto-assign
      if (formData.newVmId) {
        payload.newVmId = parseInt(formData.newVmId);
      }

      // Include target node and storage if selected
      if (formData.targetNode) {
        payload.targetNode = formData.targetNode;
      }
      if (formData.targetStorage) {
        payload.targetStorage = formData.targetStorage;
      }

      // Add log entry
      const addLog = (msg) => {
        setConsoleLogs(prev => [...prev, msg]);
      };

      addLog(`📋 Source VM: ${sourceServer.vmid}`);
      addLog(`📝 Domain: ${formData.domainName}`);
      if (formData.targetNode) addLog(`🖥️ Target Node: ${formData.targetNode}`);
      if (formData.targetStorage) addLog(`💾 Target Storage: ${formData.targetStorage}`);
      addLog('⏳ Sending clone request...');

      requestProgressInterval = setInterval(() => {
        setCloneProgress(prev => (prev < 90 ? prev + 1 : prev));
      }, 1500);

      const response = await fetch(`${apiBase}/api/servers/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json();
        addLog(`❌ Error: ${data.error || 'Clone failed'}`);
        throw new Error(data.error || 'Clone failed');
      }

      const result = await response.json();
      const seedDisplay = result.seed || seed;
      const newVmId = result.vmid || result.newVmId;

      if (requestProgressInterval) {
        clearInterval(requestProgressInterval);
      }
      
      setClonedVmId(newVmId);
      addLog(`✅ Clone initiated!`);
      addLog(`🆔 VM ID: ${newVmId}`);
      addLog(`🌱 Seed: ${seedDisplay}`);
      addLog(`📍 Monitoring clone progress...`);
      
      // Start polling for clone progress
      pollCloneProgress(newVmId, addLog);
    } catch (err) {
      if (requestProgressInterval) {
        clearInterval(requestProgressInterval);
      }
      setError(err.message);
      setConsoleLogs(prev => [...prev, `❌ Error: ${err.message}`]);
      setLoading(false);
    }
  };

  // Poll for clone progress
  const pollCloneProgress = async (vmid, addLog) => {
    let pollStopped = false;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${apiBase}/api/servers/${vmid}/clone-status`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (response.ok) {
          const status = await response.json();
          
          // Update progress
          if (status.progress_percent !== null && status.progress_percent !== undefined) {
            setCloneProgress(status.progress_percent);
          }
          
          // Update step
          if (status.current_step) {
            setCloneStep(status.current_step);
          }
          
          // Check if complete or failed
          if (status.status === 'completed') {
            clearInterval(pollInterval);
            pollStopped = true;
            addLog('✨ Clone completed successfully!');
            setCloneProgress(100);
            setLoading(false);
            setTimeout(() => {
              alert(`Server cloning completed!\n\nDomain: ${status.domain_name}\n\nThe server is ready and will appear in the list shortly.`);
              onSuccess();
            }, 1500);
          } else if (status.status === 'failed') {
            clearInterval(pollInterval);
            pollStopped = true;
            addLog(`❌ Clone failed: ${status.error_message || 'Unknown error'}`);
            setError(status.error_message || 'Clone failed');
            setLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to poll clone status:', err);
      }
    }, 2000); // Poll every 2 seconds
    
    // Clear interval after 10 minutes max
    setTimeout(() => {
      clearInterval(pollInterval);
      if (!pollStopped) {
        addLog('⚠️ Clone monitoring timed out. Check status manually.');
        setLoading(false);
      }
    }, 600000);
  };

  return (
    <div 
      className={`modal-overlay ${loading ? 'loading' : ''}`} 
      onClick={loading ? undefined : handleOverlayClick}
    >
      <div className={`modal-content ${loading ? 'loading' : ''}`} onClick={e => e.stopPropagation()}>
        <h2>Clone Server</h2>
        <p>Source: <strong>{sourceServer.name}</strong> (ID: {sourceServer.vmid})</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newVmId">New VM ID (optional):</label>
            <input
              type="number"
              id="newVmId"
              name="newVmId"
              value={formData.newVmId}
              onChange={handleVmIdChange}
              placeholder="Leave blank for auto-assignment"
              disabled={loading}
            />
            <small>Leave blank to let Proxmox assign the next available ID automatically</small>
          </div>

          <div className="form-group">
            <label htmlFor="domainName">Domain Name:</label>
            <input
              type="text"
              id="domainName"
              name="domainName"
              value={formData.domainName}
              onChange={handleInputChange}
              placeholder="e.g., minecraft02.zanarkand.site"
              disabled={loading}
              required
            />
            <small>Auto-generated from VM ID. Format: minecraft[##].zanarkand.site</small>
          </div>

          <div className="form-group">
            <label>World Seed:</label>
            <div className="seed-options">
              <div className="seed-option">
                <input
                  type="radio"
                  id="seedRandom"
                  name="seedOption"
                  value="random"
                  checked={formData.seedOption === 'random'}
                  onChange={handleSeedOptionChange}
                  disabled={loading}
                />
                <label htmlFor="seedRandom">Generate random seed</label>
              </div>
              <div className="seed-option">
                <input
                  type="radio"
                  id="seedCustom"
                  name="seedOption"
                  value="custom"
                  checked={formData.seedOption === 'custom'}
                  onChange={handleSeedOptionChange}
                  disabled={loading}
                />
                <label htmlFor="seedCustom">Use custom seed</label>
              </div>
            </div>

            {formData.seedOption === 'custom' && (
              <div className="custom-seed-input">
                <input
                  type="text"
                  name="customSeed"
                  value={formData.customSeed}
                  onChange={handleInputChange}
                  placeholder="Enter your seed value"
                  disabled={loading}
                />
                <small>You can use any seed value. Leave blank to auto-generate a random seed.</small>
              </div>
            )}
          </div>

          {/* Target Node and Storage Selection */}
          <div className="form-group">
            <label htmlFor="targetNode">Target Node (optional):</label>
            <select
              id="targetNode"
              name="targetNode"
              value={formData.targetNode}
              onChange={handleInputChange}
              disabled={loading || optionsLoading}
            >
              <option value="">Auto-select (use source node)</option>
              {nodes.map(node => (
                <option key={node.id} value={node.id}>{node.name}</option>
              ))}
            </select>
            <small>After cloning, the new VM will be migrated to this node. Leave blank to keep on source node.</small>
          </div>

          <div className="form-group">
            <label htmlFor="targetStorage">Target Storage (optional):</label>
            <select
              id="targetStorage"
              name="targetStorage"
              value={formData.targetStorage}
              onChange={handleInputChange}
              disabled={loading || optionsLoading}
            >
              <option value="">Auto-select (use source storage)</option>
              {storage.map(stor => {
                const availableGB = stor.available ? Math.round(stor.available / (1024 * 1024 * 1024)) : 0;
                return (
                  <option key={stor.id} value={stor.id}>
                    {stor.name} ({stor.type}) - {availableGB} GB available
                  </option>
                );
              })}
            </select>
            <small>Select which storage to clone to. Useful if source storage is full. Leave blank to use the same storage as source.</small>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-submit"
            >
              {loading && <span className="spinner"></span>}
              {loading ? 'Cloning Server...' : 'Clone Server'}
            </button>
          </div>

          {loading && (
            <div className="clone-progress">
              <p>⏳ <strong>Clone in progress... {cloneProgress}%</strong></p>
              
              {/* Progress Bar */}
              <div className="progress-bar-container">
                <div 
                  className="progress-bar-fill" 
                  style={{width: `${cloneProgress}%`}}
                >
                  {cloneProgress > 5 && <span className="progress-text">{cloneProgress}%</span>}
                </div>
              </div>
              
              {cloneStep && (
                <p style={{fontSize: '0.85em', color: '#34a8e0', marginTop: '0.5rem'}}>
                  Step: {cloneStep}
                </p>
              )}
              
              <p style={{fontSize: '0.85em', color: '#666', marginTop: '0.5rem'}}>
                This may take several minutes while the VM is created and configured.<br/>
                Please do not close this window or refresh the page.
              </p>
              
              <div style={{marginTop: '1rem'}}>
                <button 
                  type="button"
                  onClick={() => setShowConsole(!showConsole)}
                  style={{
                    background: 'rgba(52, 168, 224, 0.2)',
                    border: '1px solid rgba(52, 168, 224, 0.3)',
                    color: '#34a8e0',
                    padding: '0.5rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.85em',
                    marginBottom: showConsole ? '0.5rem' : 0
                  }}
                >
                  {showConsole ? '▼ Hide' : '▶ Show'} Clone Details
                </button>
                
                {showConsole && (
                  <div className="clone-console">
                    {consoleLogs.map((log, idx) => (
                      <div key={idx} className="console-line">
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default CloneForm;
