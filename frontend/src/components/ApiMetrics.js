import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import '../styles/ApiMetrics.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function ApiMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(24);
  const { token } = useAuth();

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/api/admin/metrics?hours=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to fetch metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (err) {
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [timeRange]);

  if (loading) return <div>Loading metrics...</div>;
  if (!metrics) return <div>No metrics available</div>;

  return (
    <div className="api-metrics">
      <h2>API Performance Metrics</h2>

      <div className="time-range-selector">
        <label>Time Range: </label>
        <select value={timeRange} onChange={(e) => setTimeRange(parseInt(e.target.value))}>
          <option value={1}>Last Hour</option>
          <option value={6}>Last 6 Hours</option>
          <option value={24}>Last 24 Hours</option>
          <option value={168}>Last Week</option>
        </select>
      </div>

      <div className="metrics-summary">
        <div className="metric-card">
          <h3>Total Requests</h3>
          <div className="metric-value">{metrics.overall.count}</div>
        </div>
        <div className="metric-card">
          <h3>Average Response Time</h3>
          <div className="metric-value">{Math.round(metrics.overall.avg_time)} ms</div>
        </div>
        <div className="metric-card">
          <h3>Min Response Time</h3>
          <div className="metric-value">{metrics.overall.min_time} ms</div>
        </div>
        <div className="metric-card">
          <h3>Max Response Time</h3>
          <div className="metric-value">{metrics.overall.max_time} ms</div>
        </div>
      </div>

      <div className="endpoint-metrics">
        <h3>Top Endpoints</h3>
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Requests</th>
              <th>Avg Response Time</th>
            </tr>
          </thead>
          <tbody>
            {metrics.byEndpoint.map((endpoint, idx) => (
              <tr key={idx}>
                <td>{endpoint.endpoint}</td>
                <td>{endpoint.count}</td>
                <td>{Math.round(endpoint.avg_time)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ApiMetrics;
