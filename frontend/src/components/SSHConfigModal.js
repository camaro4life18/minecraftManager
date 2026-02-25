import React, { useState } from 'react';

function SSHConfigModal({ server, onClose, onSuccess }) {
  const [mode, setMode] = useState('generate'); // 'generate' or 'manual'
  const [generatingKeys, setGeneratingKeys] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Generate keys form
  const [generateForm, setGenerateForm] = useState({
    host: server.name || '',
    port: 22,
    username: 'root',
    password: ''
  });

  // Manual config form
  const [formData, setFormData] = useState({
    host: server.name || '',
    port: 22,
    username: 'root',
    privateKey: '',
    minecraftPath: '/opt/minecraft'
  });

  const handleGenerateKeys = async (e) => {
    e.preventDefault();
    setGeneratingKeys(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      
      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 35000); // 35 second timeout
      
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/ssh-generate-keys`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(generateForm),
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const data = await response.json();
        let errorMsg = data.error || 'Failed to generate SSH keys';
        // Add helpful hint for DNS errors
        if (errorMsg.includes('getaddrinfo') || errorMsg.includes('EAI_AGAIN')) {
          errorMsg += '. Try using an IP address instead of a hostname.';
        }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      setSuccess('SSH keys generated successfully!');
      
      // Auto-fill the manual form with the generated key
      setFormData({
        host: generateForm.host,
        port: generateForm.port,
        username: generateForm.username,
        privateKey: data.privateKey,
        minecraftPath: '/opt/minecraft'
      });

      // Switch to manual mode to show the key
      setTimeout(() => setMode('manual'), 2000);
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Request timeout. Please check the server host, credentials, and network connectivity.');
      } else {
        setError(err.message);
      }
    } finally {
      setGeneratingKeys(false);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(
        `${process.env.REACT_APP_API_URL}/api/servers/${server.vmid}/ssh-config`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formData)
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to configure SSH');
      }

      setSuccess('SSH configured successfully!');
      setTimeout(onSuccess, 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2>Configure SSH for {server.name}</h2>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {success && (
          <div className="success-message">
            {success}
          </div>
        )}

        <div className="tabs" style={{ marginBottom: '1.5rem' }}>
          <button 
            className={`tab-button ${mode === 'generate' ? 'active' : ''}`}
            onClick={() => setMode('generate')}
          >
            🔑 Auto-Generate Keys
          </button>
          <button 
            className={`tab-button ${mode === 'manual' ? 'active' : ''}`}
            onClick={() => setMode('manual')}
          >
            ✏️ Manual Entry
          </button>
        </div>

        {mode === 'generate' ? (
          <form onSubmit={handleGenerateKeys}>
            <p style={{ marginBottom: '1rem', color: '#999' }}>
              Generate SSH keys directly on your Minecraft server using temporary credentials.
            </p>
            <div style={{ 
              backgroundColor: '#2d2d30', 
              border: '1px solid #007acc', 
              borderRadius: '4px', 
              padding: '0.75rem', 
              marginBottom: '1rem',
              fontSize: '0.9rem'
            }}>
              <strong>💡 Tip:</strong> Use the IP address (e.g., 192.168.1.234) instead of hostname for the Server Host field.
            </div>

            <div className="form-group">
              <label>Server Host:</label>
              <input
                type="text"
                value={generateForm.host}
                onChange={(e) => setGenerateForm({ ...generateForm, host: e.target.value })}
                placeholder="192.168.1.234"
                required
              />
              <small>IP address or hostname of the Minecraft VM</small>
            </div>

            <div className="form-group">
              <label>SSH Port:</label>
              <input
                type="number"
                value={generateForm.port}
                onChange={(e) => setGenerateForm({ ...generateForm, port: parseInt(e.target.value) })}
                required
              />
            </div>

            <div className="form-group">
              <label>SSH Username:</label>
              <input
                type="text"
                value={generateForm.username}
                onChange={(e) => setGenerateForm({ ...generateForm, username: e.target.value })}
                placeholder="root"
                required
              />
            </div>

            <div className="form-group">
              <label>SSH Password (temporary):</label>
              <input
                type="password"
                value={generateForm.password}
                onChange={(e) => setGenerateForm({ ...generateForm, password: e.target.value })}
                placeholder="Enter password for SSH access"
                required
              />
              <small>Used only for key generation, not stored</small>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="submit-button" disabled={generatingKeys}>
                {generatingKeys ? 'Generating Keys...' : 'Generate & Configure'}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSaveConfig}>
            <p style={{ marginBottom: '1rem', color: '#999' }}>
              Or paste your existing SSH credentials manually.
            </p>

            <div className="form-group">
              <label>SSH Host:</label>
              <input
                type="text"
                value={formData.host}
                onChange={(e) => setFormData({ ...formData, host: e.target.value })}
                placeholder="192.168.1.234"
                required
              />
              <small>IP address or hostname of the Minecraft VM</small>
            </div>

            <div className="form-group">
              <label>SSH Port:</label>
              <input
                type="number"
                value={formData.port}
                onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) })}
                required
              />
            </div>

            <div className="form-group">
              <label>SSH Username:</label>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </div>

            <div className="form-group">
              <label>SSH Private Key:</label>
              <textarea
                value={formData.privateKey}
                onChange={(e) => setFormData({ ...formData, privateKey: e.target.value })}
                placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;...&#10;-----END RSA PRIVATE KEY-----"
                rows="8"
                required
              />
              <small>Paste your SSH private key here (PEM format, keep it secure!)</small>
            </div>

            <div className="form-group">
              <label>Minecraft Server Path:</label>
              <input
                type="text"
                value={formData.minecraftPath}
                onChange={(e) => setFormData({ ...formData, minecraftPath: e.target.value })}
                placeholder="/opt/minecraft"
                required
              />
              <small>Path where Minecraft server is installed on the VM</small>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={onClose} className="cancel-button">
                Cancel
              </button>
              <button type="submit" className="submit-button" disabled={loading}>
                {loading ? 'Testing Connection...' : 'Save Configuration'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default SSHConfigModal;
