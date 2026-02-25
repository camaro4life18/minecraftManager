import React from 'react';
import '../styles/ServerList.css';

function ServerList({ 
  servers, 
  onClone, 
  onDelete, 
  onAddServer,
  isAdmin, 
  currentUserId,
  pagination,
  onPageChange,
  searchTerm,
  onSearchChange,
  sortBy,
  onSortByChange
}) {
  return (
    <div className="server-list">
      <div className="server-list-header">
        <h2>Minecraft Servers</h2>
        
        <div className="server-controls">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="sort-box">
            <select value={sortBy} onChange={(e) => onSortByChange(e.target.value)}>
              <option value="id">Sort by Creation</option>
              <option value="name">Sort by Name</option>
              <option value="vmid">Sort by VM ID</option>
            </select>
          </div>

          {isAdmin && (
            <button className="btn btn-success" onClick={onAddServer}>
              ➕ Add Server
            </button>
          )}
        </div>
      </div>

      {pagination && (
        <div className="results-info">
          Showing {servers.length} of {pagination.total} servers
        </div>
      )}

      {servers.length === 0 ? (
        <div className="no-servers">
          <p>No servers in managed list{searchTerm ? ' matching your search' : ''}.</p>
          {isAdmin && <p>Click "Add Server" to add servers from Proxmox.</p>}
        </div>
      ) : (
        <>
          <div className="servers-grid">
            {servers.map(server => (
              <div key={server.vmid} className="server-card">
                <div className="server-header">
                  <h3>{server.name}</h3>
                </div>

                <div className="server-info">
                  <p><strong>VM ID:</strong> {server.vmid}</p>
                  {server.seed && (
                    <p className="seed-info"><strong>Seed:</strong> <code>{server.seed}</code></p>
                  )}
                  {server.is_owned_by_user && (
                    <p className="owned-badge">✓ Added by you</p>
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
                  {isAdmin && (
                    <button
                      className="btn btn-delete"
                      onClick={() => onDelete(server.id)}
                      title="Remove from managed list"
                    >
                      🗑️ Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pagination && pagination.totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </button>
              <span className="page-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ServerList;

