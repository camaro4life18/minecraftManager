import React, { useState, useEffect } from 'react';
import ServerList from './components/ServerList';
import AddServerModal from './components/AddServerModal';
import SSHConfigModal from './components/SSHConfigModal';
import ServerManagementModal from './components/ServerManagementModal';
import CloneForm from './components/CloneForm';
import LoginPage from './components/LoginPage';
import AdminSettings from './components/AdminSettings';
import ErrorLogs from './components/ErrorLogs';
import ApiMetrics from './components/ApiMetrics';
import SessionManagement from './components/SessionManagement';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AppContent() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showSSHConfigModal, setShowSSHConfigModal] = useState(false);
  const [showManagementModal, setShowManagementModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [currentPage, setCurrentPage] = useState('servers'); // 'servers' or 'admin' or 'logs' or 'metrics' or 'sessions'
  const { isAuthenticated, token, logout, isAdmin, user, loading: authLoading } = useAuth();

  // Pagination and filtering state
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('id');

  // Fetch servers
  const fetchServers = async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(searchTerm && { search: searchTerm }),
        sortBy,
        sortOrder: 'asc'
      });

      const response = await fetch(`${API_BASE}/api/servers?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let errorMessage = 'Failed to fetch servers';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorData.message || errorMessage;
        } catch (parseErr) {
          // Keep default message if response body is not JSON
        }

        if (response.status === 401 || response.status === 403) {
          await logout();
          throw new Error('Session expired. Please log in again.');
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Handle both old format (array) and new format (object with servers and pagination)
      if (Array.isArray(data)) {
        setServers(data);
        setPagination(null);
      } else {
        setServers(data.servers || []);
        setPagination(data.pagination || null);
      }
      
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchServers();
    }
  }, [isAuthenticated, token, authLoading, page, searchTerm, sortBy]);

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleCreateServerClick = () => {
    setShowCloneForm(true);
  };

  const handleCloneSuccess = () => {
    setShowCloneForm(false);
    setTimeout(fetchServers, 2000);
  };

  const handleStartServer = async (vmid) => {
    try {
      const response = await fetch(`${API_BASE}/api/servers/${vmid}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to start server');
      setTimeout(fetchServers, 1000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStopServer = async (vmid) => {
    try {
      const response = await fetch(`${API_BASE}/api/servers/${vmid}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to stop server');
      setTimeout(fetchServers, 1000);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteServer = async (vmid) => {
    if (!window.confirm('Are you sure you want to DELETE this server? This will destroy the VM, remove it from Velocity, and delete its DNS record. This action cannot be undone!')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/servers/${vmid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete server');
      }
      fetchServers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAddServerSuccess = () => {
    fetchServers();
  };

  const handleConfigureSSH = (server) => {
    setSelectedServer(server);
    setShowSSHConfigModal(true);
  };

  const handleSSHConfigSuccess = () => {
    setShowSSHConfigModal(false);
    setSelectedServer(null);
    alert('SSH configured successfully!');
  };

  const handleManageServer = (server) => {
    setSelectedServer(server);
    setShowManagementModal(true);
  };

  return (
    <div className="App">
      <header className="header">
        <div className="header-content">
          <div className="header-title">
            <h1>🎮 Minecraft Server Manager</h1>
            <p>Create and manage Minecraft servers on your Proxmox host</p>
          </div>
          <div className="header-nav">
            <nav className="nav-buttons">
              <button
                className={`nav-button ${currentPage === 'servers' ? 'active' : ''}`}
                onClick={() => setCurrentPage('servers')}
              >
                🖥️ Servers
              </button>
              {isAdmin && (
                <>
                  <button
                    className={`nav-button ${currentPage === 'admin' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('admin')}
                  >
                    ⚙️ Configuration
                  </button>
                  <button
                    className={`nav-button ${currentPage === 'logs' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('logs')}
                  >
                    📋 Error Logs
                  </button>
                  <button
                    className={`nav-button ${currentPage === 'metrics' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('metrics')}
                  >
                    📊 Metrics
                  </button>
                  <button
                    className={`nav-button ${currentPage === 'sessions' ? 'active' : ''}`}
                    onClick={() => setCurrentPage('sessions')}
                  >
                    🔐 Sessions
                  </button>
                </>
              )}
            </nav>
            <div className="header-user">
              <span className="user-info">
                👤 {user?.username}
                {isAdmin && <span className="badge-admin">ADMIN</span>}
              </span>
              <button className="btn-logout" onClick={logout}>Logout</button>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        {error && <div className="error-banner">{error}</div>}

        {currentPage === 'servers' && (
          <>
            {loading && <div className="loading">Loading servers...</div>}

            {!loading && (
              <>
                <ServerList
                  servers={servers}
                  onCreateServer={handleCreateServerClick}
                  onDelete={handleDeleteServer}
                  onAddServer={() => setShowAddServerModal(true)}
                  onConfigureSSH={handleConfigureSSH}
                  onManageServer={handleManageServer}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                  pagination={pagination}
                  onPageChange={setPage}
                  searchTerm={searchTerm}
                  onSearchChange={setSearchTerm}
                  sortBy={sortBy}
                  onSortByChange={setSortBy}
                />

                <AddServerModal
                  isOpen={showAddServerModal}
                  onClose={() => setShowAddServerModal(false)}
                  onAdd={handleAddServerSuccess}
                  apiBase={API_BASE}
                />

                {showCloneForm && (
                  <CloneForm
                    onClose={() => setShowCloneForm(false)}
                    onSuccess={handleCloneSuccess}
                    apiBase={API_BASE}
                    token={token}
                  />
                )}

                {showSSHConfigModal && selectedServer && (
                  <SSHConfigModal
                    server={selectedServer}
                    onClose={() => setShowSSHConfigModal(false)}
                    onSuccess={handleSSHConfigSuccess}
                  />
                )}

                {showManagementModal && selectedServer && (
                  <ServerManagementModal
                    server={selectedServer}
                    onClose={() => setShowManagementModal(false)}
                  />
                )}
              </>
            )}
          </>
        )}

        {currentPage === 'admin' && isAdmin && (
          <AdminSettings
            apiBase={API_BASE}
            token={token}
            isAdmin={isAdmin}
          />
        )}

        {currentPage === 'logs' && isAdmin && (
          <ErrorLogs />
        )}

        {currentPage === 'metrics' && isAdmin && (
          <ApiMetrics />
        )}

        {currentPage === 'sessions' && isAdmin && (
          <SessionManagement />
        )}
      </main>

      <footer className="footer">
        <p>Minecraft Server Manager - Managing servers made easy</p>
        <p className="api-docs-link">
          <a href={`${API_BASE}/api-docs`} target="_blank" rel="noopener noreferrer">
            📚 API Documentation
          </a>
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
