import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ErrorLogs.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ErrorLogs() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [filters, setFilters] = useState({
    errorType: '',
    startDate: '',
    endDate: ''
  });
  const { token } = useAuth();

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        ...filters
      });

      const response = await fetch(`${API_BASE}/api/admin/error-logs?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch error logs');
      const data = await response.json();
      setLogs(data.logs);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Error fetching logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/error-logs/stats?hours=24`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching stats:', err);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [page, filters]);

  const handleClearOld = async () => {
    if (!window.confirm('Delete error logs older than 30 days?')) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/error-logs/cleanup?days=30`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to clear logs');
      alert('Old logs cleared successfully');
      fetchLogs();
    } catch (err) {
      alert('Error clearing logs: ' + err.message);
    }
  };

  return (
    <div className="error-logs">
      <h2>Error Logs</h2>

      <div className="error-stats">
        <h3>Last 24 Hours</h3>
        <div className="stats-grid">
          {stats.map((stat, idx) => (
            <div key={idx} className="stat-card">
              <div className="stat-type">{stat.error_type}</div>
              <div className="stat-count">{stat.count}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="logs-controls">
        <div className="filters">
          <input
            type="text"
            placeholder="Filter by error type..."
            value={filters.errorType}
            onChange={(e) => setFilters({ ...filters, errorType: e.target.value })}
          />
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
          />
          <button onClick={() => setFilters({ errorType: '', startDate: '', endDate: '' })}>
            Clear Filters
          </button>
        </div>
        <button onClick={handleClearOld} className="danger-btn">
          Clear Old Logs (30+ days)
        </button>
      </div>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="logs-table">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Message</th>
                  <th>User</th>
                  <th>Endpoint</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.created_at).toLocaleString()}</td>
                    <td className={`error-type ${log.error_type}`}>{log.error_type}</td>
                    <td title={log.error_message}>{log.error_message.substring(0, 100)}</td>
                    <td>{log.username || 'N/A'}</td>
                    <td>{log.endpoint}</td>
                    <td>{log.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pagination">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pagination.totalPages}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default ErrorLogs;
