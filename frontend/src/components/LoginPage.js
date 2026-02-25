import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import PasswordReset from './PasswordReset';
import '../styles/LoginPage.css';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPasswordReset, setShowPasswordReset] = useState(false);
  const { login, error, setError } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const success = await login(username, password);
      if (!success) {
        console.log('Login failed');
      }
    } catch (err) {
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (showPasswordReset) {
    return <PasswordReset onBack={() => setShowPasswordReset(false)} />;
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <h1>🎮 Minecraft Server Manager</h1>
        <p className="subtitle">Login to manage your servers</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              disabled={isLoading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            disabled={isLoading || !username || !password}
            className="btn-login"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>

          <div className="forgot-password">
            <a href="#" onClick={(e) => { e.preventDefault(); setShowPasswordReset(true); }}>
              Forgot password?
            </a>
          </div>
        </form>

        <div className="login-info">
          <p><strong>Demo Accounts:</strong></p>
          <p>👨 Admin: <code>admin</code> / <code>admin123</code></p>
          <p>👦 User: <code>user</code> / <code>user123</code></p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
