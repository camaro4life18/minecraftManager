import React, { useState, useEffect } from 'react';
import ServerList from './components/ServerList';
import CloneForm from './components/CloneForm';
import LoginPage from './components/LoginPage';
import AdminSettings from './components/AdminSettings';
import { AuthProvider, useAuth } from './context/AuthContext';
import './App.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function AppContent() {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCloneForm, setShowCloneForm] = useState(false);
  const [selectedServer, setSelectedServer] = useState(null);
  const [currentPage, setCurrentPage] = useState('servers'); // 'servers' or 'admin'
  const { isAuthenticated, token, logout, isAdmin, user, loading: authLoading } = useAuth();

  // Fetch servers
  const fetchServers = async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/servers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch servers');
      const data = await response.json();
      setServers(data);
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
      // Refresh every 10 seconds
      const interval = setInterval(fetchServers, 10000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated, token, authLoading]);

  if (authLoading) {
    return <div className="loading">Loading...</div>;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const handleCloneClick = (server) => {
    setSelectedServer(server);
    setShowCloneForm(true);
  };

  const handleCloneSuccess = () => {
    setShowCloneForm(false);
    setSelectedServer(null);
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
    if (!window.confirm('Are you sure you want to delete this server? This cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/servers/${vmid}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) throw new Error('Failed to delete server');
      setTimeout(fetchServers, 1000);
    } catch (err) {
      setError(err.message);
    }
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
                <button
                  className={`nav-button ${currentPage === 'admin' ? 'active' : ''}`}
                  onClick={() => setCurrentPage('admin')}
                >
                  ⚙️ Configuration
                </button>
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
                  onClone={handleCloneClick}
                  onStart={handleStartServer}
                  onStop={handleStopServer}
                  onDelete={handleDeleteServer}
                  isAdmin={isAdmin}
                  currentUserId={user?.id}
                />

                {showCloneForm && selectedServer && (
                  <CloneForm
                    sourceServer={selectedServer}
                    onClose={() => setShowCloneForm(false)}
                    onSuccess={handleCloneSuccess}
                    apiBase={API_BASE}
                    token={token}
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
      </main>

      <footer className="footer">
        <p>Minecraft Server Manager - Managing servers made easy</p>
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
