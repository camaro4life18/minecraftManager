import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/SessionManagement.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function SessionManagement() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/admin/sessions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch sessions');
      const data = await response.json();
      setSessions(data);
    } catch (err) {
      console.error('Error fetching sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const handleRevokeSession = async (sessionId) => {
    if (!window.confirm('Revoke this session?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to revoke session');
      fetchSessions();
    } catch (err) {
      alert('Error revoking session: ' + err.message);
    }
  };

  const handleRevokeAllUserSessions = async (userId, username) => {
    if (!window.confirm(`Revoke all sessions for user ${username}?`)) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/users/${userId}/sessions`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to revoke sessions');
      fetchSessions();
    } catch (err) {
      alert('Error revoking sessions: ' + err.message);
    }
  };

  return (
    <div className="session-management">
      <h2>Active Sessions</h2>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Created</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.id}>
                <td>{session.username}</td>
                <td>{new Date(session.created_at).toLocaleString()}</td>
                <td>{new Date(session.expires_at).toLocaleString()}</td>
                <td>
                  <button onClick={() => handleRevokeSession(session.id)} className="danger-btn">
                    Revoke
                  </button>
                  <button 
                    onClick={() => handleRevokeAllUserSessions(session.user_id, session.username)}
                    className="warning-btn"
                  >
                    Revoke All
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default SessionManagement;
