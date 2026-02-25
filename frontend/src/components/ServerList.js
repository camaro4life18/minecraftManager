import React from 'react';
import '../styles/ServerList.css';

function ServerList({ servers, onClone, onStart, onStop, onDelete, isAdmin, currentUserId }) {
  if (servers.length === 0) {
    return (
      <div className="no-servers">
        <p>No Minecraft servers found. Create your first one!</p>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    if (status === 'running') {
      return <span className="badge badge-running">Running</span>;
    } else if (status === 'stopped') {
      return <span className="badge badge-stopped">Stopped</span>;
    }
    return <span className="badge badge-unknown">Unknown</span>;
  };

  const canDeleteServer = (server) => {
    return isAdmin || server.is_owned_by_user;
  };

  const getDeleteButtonTitle = (server) => {
    if (isAdmin) return 'Delete this server';
    if (server.is_owned_by_user) return 'Delete your server';
    return 'You can only delete servers you created';
  };

  return (
    <div className="server-list">
      <h2>Minecraft Servers</h2>
      <div className="servers-grid">
        {servers.map(server => (
          <div key={server.vmid} className="server-card">
            <div className="server-header">
              <h3>{server.name}</h3>
              {getStatusBadge(server.status)}
            </div>

            <div className="server-info">
              <p><strong>VM ID:</strong> {server.vmid}</p>
              <p><strong>Node:</strong> {server.node}</p>
              <p><strong>Type:</strong> {server.type === 'qemu' ? 'Virtual Machine' : 'Container'}</p>
              <p><strong>CPU:</strong> {server.cpus || 'N/A'}</p>
              <p><strong>Memory:</strong> {server.maxmem ? Math.round(server.maxmem / (1024 * 1024 * 1024)) + ' GB' : 'N/A'}</p>
              {server.seed && (
                <p className="seed-info"><strong>Seed:</strong> <code>{server.seed}</code></p>
              )}
              {server.is_owned_by_user && (
                <p className="owned-badge">✓ You created this server</p>
              )}
            </div>

            <div className="server-actions">
              <button
                className="btn btn-primary"
                onClick={() => onClone(server)}
                title="Clone this server"
              >
                📋 Clone
              </button>
              {server.status === 'running' ? (
                <button
                  className="btn btn-danger"
                  onClick={() => onStop(server.vmid)}
                  title="Stop this server"
                >
                  ⏹️ Stop
                </button>
              ) : (
                <button
                  className="btn btn-success"
                  onClick={() => onStart(server.vmid)}
                  title="Start this server"
                >
                  ▶️ Start
                </button>
              )}
              {onDelete && canDeleteServer(server) && (
                <button
                  className="btn btn-delete"
                  onClick={() => onDelete(server.vmid)}
                  title={getDeleteButtonTitle(server)}
                >
                  🗑️ Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ServerList;
