import React, { useState, useEffect } from 'react';

function AddServerModal({ isOpen, onClose, onAdd, apiBase }) {
  const [availableServers, setAvailableServers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedServer, setSelectedServer] = useState(null);
  const [serverName, setServerName] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchAvailableServers();
    }
  }, [isOpen]);

  const fetchAvailableServers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiBase}/api/proxmox/available-servers`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to fetch available servers');
      }

      const data = await response.json();
      setAvailableServers(data.servers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedServer || !serverName.trim()) {
      setError('Please select a server and enter a name');
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          vmid: selectedServer.vmid,
          serverName: serverName.trim()
        })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add server');
      }

      const data = await response.json();
      setSelectedServer(null);
      setServerName('');
      onAdd(data);
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add Server to Managed List</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          {loading ? (
            <div className="loading">Loading available servers...</div>
          ) : availableServers.length === 0 ? (
            <div className="info-message">
              No available servers. Either all servers are already managed, or Proxmox is not configured.
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Select Server:</label>
                <select
                  value={selectedServer ? selectedServer.vmid : ''}
                  onChange={(e) => {
                    const server = availableServers.find(s => s.vmid === parseInt(e.target.value));
                    setSelectedServer(server);
                    if (server) {
                      setServerName(server.name || '');
                    }
                  }}
                >
                  <option value="">-- Choose a server --</option>
                  {availableServers.map(server => (
                    <option key={server.vmid} value={server.vmid}>
                      {server.name} (VM ID: {server.vmid}) - {server.status}
                    </option>
                  ))}
                </select>
              </div>

              {selectedServer && (
                <div className="server-details">
                  <p><strong>Type:</strong> {selectedServer.type === 'qemu' ? 'Virtual Machine' : 'Container'}</p>
                  <p><strong>Node:</strong> {selectedServer.node}</p>
                  <p><strong>Status:</strong> {selectedServer.status}</p>
                </div>
              )}

              <div className="form-group">
                <label>Server Display Name:</label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  placeholder="Enter a name for this server in the manager"
                />
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleAdd}
            disabled={!selectedServer || !serverName.trim() || loading}
          >
            Add Server
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddServerModal;
