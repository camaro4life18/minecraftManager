import React, { useState } from 'react';

function SSHConfigModal({ server, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    host: server.name || '',
    port: 22,
    username: 'root',
    privateKey: '',
    minecraftPath: '/opt/minecraft'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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

      onSuccess();
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

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>SSH Host:</label>
            <input
              type="text"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              placeholder="192.168.1.100"
              required
            />
            <small>IP address or hostname of the Ubuntu VM</small>
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
              rows="6"
              required
            />
            <small>Paste your SSH private key here (keep it secure!)</small>
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
            <small>Path where Minecraft server is installed</small>
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
      </div>
    </div>
  );
}

export default SSHConfigModal;
