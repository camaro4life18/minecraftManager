import React, { useState } from 'react';
import '../styles/PasswordReset.css';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

function PasswordReset({ onBack }) {
  const [step, setStep] = useState('request'); // 'request' or 'reset'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/request-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setMessage(data.message);
      // In development, show the token
      if (data.resetToken) {
        setToken(data.resetToken);
        setStep('reset');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      setMessage('Password reset successful! You can now login with your new password.');
      setTimeout(() => onBack && onBack(), 2000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="password-reset">
      {step === 'request' ? (
        <div className="reset-form">
          <h2>Reset Password</h2>
          <form onSubmit={handleRequestReset}>
            <div className="form-group">
              <label>Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
              />
            </div>
            {error && <div className="error">{error}</div>}
            {message && <div className="success">{message}</div>}
            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={onBack}>
                Back to Login
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="reset-form">
          <h2>Set New Password</h2>
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label>Reset Token</label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter reset token"
                required
              />
            </div>
            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </div>
            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>
            {error && <div className="error">{error}</div>}
            {message && <div className="success">{message}</div>}
            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" onClick={onBack}>
                Back to Login
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export default PasswordReset;
