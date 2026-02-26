import React, { useState } from 'react';
import '../styles/CloneForm.css';

function CloneForm({ sourceServer, onClose, onSuccess, apiBase, token }) {
  const [formData, setFormData] = useState({
    newVmId: '',
    domainName: '',
    seedOption: 'random',
    customSeed: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Auto-generate domain name based on VM ID or use a default pattern
  const handleVmIdChange = (e) => {
    const vmId = e.target.value;
    const numericPart = vmId.replace(/\D/g, ''); // Extract numbers
    
    setFormData(prev => ({
      ...prev,
      newVmId: vmId,
      domainName: numericPart ? `minecraft${numericPart.slice(-2).padStart(2, '0')}.zanarkand.site` : prev.domainName
    }));
  };

  const handleSeedOptionChange = (e) => {
    setFormData(prev => ({
      ...prev,
      seedOption: e.target.value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.domainName) {
      setError('Domain name is required');
      return;
    }

    // Validate custom seed if selected
    if (formData.seedOption === 'custom' && !formData.customSeed.trim()) {
      setError('Custom seed value is required when using custom seed option');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const seed = formData.seedOption === 'random' ? 'random' : formData.customSeed.trim();

      const payload = {
        sourceVmId: sourceServer.vmid,
        domainName: formData.domainName,
        seed: seed
      };

      // Only include newVmId if user specified one, otherwise Proxmox will auto-assign
      if (formData.newVmId) {
        payload.newVmId = parseInt(formData.newVmId);
      }

      const response = await fetch(`${apiBase}/api/servers/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Clone failed');
      }

      const result = await response.json();
      const seedDisplay = result.seed || seed;
      alert(`Server cloning started!\n\nDomain: ${result.domainName}\nSeed: ${seedDisplay}\n\nThis may take a few minutes. Once complete, it will be added to the velocity server list.`);
      onSuccess();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <h2>Clone Server</h2>
        <p>Source: <strong>{sourceServer.name}</strong> (ID: {sourceServer.vmid})</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="newVmId">New VM ID (optional):</label>
            <input
              type="number"
              id="newVmId"
              name="newVmId"
              value={formData.newVmId}
              onChange={handleVmIdChange}
              placeholder="Leave blank for auto-assignment"
              disabled={loading}
            />
            <small>Leave blank to let Proxmox assign the next available ID automatically</small>
          </div>

          <div className="form-group">
            <label htmlFor="domainName">Domain Name:</label>
            <input
              type="text"
              id="domainName"
              name="domainName"
              value={formData.domainName}
              onChange={handleInputChange}
              placeholder="e.g., minecraft02.zanarkand.site"
              disabled={loading}
              required
            />
            <small>Auto-generated from VM ID. Format: minecraft[##].zanarkand.site</small>
          </div>

          <div className="form-group">
            <label>World Seed:</label>
            <div className="seed-options">
              <div className="seed-option">
                <input
                  type="radio"
                  id="seedRandom"
                  name="seedOption"
                  value="random"
                  checked={formData.seedOption === 'random'}
                  onChange={handleSeedOptionChange}
                  disabled={loading}
                />
                <label htmlFor="seedRandom">Generate random seed</label>
              </div>
              <div className="seed-option">
                <input
                  type="radio"
                  id="seedCustom"
                  name="seedOption"
                  value="custom"
                  checked={formData.seedOption === 'custom'}
                  onChange={handleSeedOptionChange}
                  disabled={loading}
                />
                <label htmlFor="seedCustom">Use custom seed</label>
              </div>
            </div>

            {formData.seedOption === 'custom' && (
              <div className="custom-seed-input">
                <input
                  type="text"
                  name="customSeed"
                  value={formData.customSeed}
                  onChange={handleInputChange}
                  placeholder="Enter your seed value"
                  disabled={loading}
                />
                <small>You can use any seed value. Leave blank to auto-generate a random seed.</small>
              </div>
            )}
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="form-actions">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="btn-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-submit"
            >
              {loading ? 'Cloning...' : 'Clone Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CloneForm;
