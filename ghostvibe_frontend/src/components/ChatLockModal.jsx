import React, { useState } from 'react';

// Simple Web Crypto SHA-256 helper
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Banking-level PIN strength validator
export function validatePinInput(pin, myPhone) {
  if (!/^\d{4,6}$/.test(pin)) {
    return 'PIN must be between 4 and 6 digits.';
  }
  
  const weakPins = new Set([
    '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
    '1234', '4321', '12345', '54321', '123456', '654321', '9876'
  ]);
  
  if (weakPins.has(pin)) {
    return 'PIN is too weak or sequential.';
  }
  
  // Repeated digits check (e.g. 1111)
  if (new Set(pin.split('')).size === 1) {
    return 'PIN cannot contain all identical digits.';
  }
  
  // Birth year check (1900-2100)
  if (pin.length === 4) {
    const year = parseInt(pin, 10);
    if (year >= 1900 && year <= 2100) {
      return 'PIN cannot be a birth year.';
    }
  }
  
  // Sequential digits check (e.g. 1234, 4321, 12345)
  let isSequentialUp = true;
  let isSequentialDown = true;
  for (let i = 1; i < pin.length; i++) {
    const diff = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (diff !== 1) isSequentialUp = false;
    if (diff !== -1) isSequentialDown = false;
  }
  if (isSequentialUp || isSequentialDown) {
    return 'PIN cannot contain sequential digits.';
  }
  
  // Phone number check
  if (myPhone) {
    const digitsOnly = myPhone.replace(/\D/g, '');
    if (digitsOnly.includes(pin)) {
      return 'PIN cannot contain parts of your phone number.';
    }
  }
  
  return null;
}

export default function ChatLockModal({ chat, mode = 'setup', onClose, onSave, myPhone }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [timeoutVal, setTimeoutVal] = useState(chat?.lock_timeout || 0);
  const [biometric, setBiometric] = useState(chat?.biometric_enabled || false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'setup') {
      const strengthErr = validatePinInput(pin, myPhone);
      if (strengthErr) {
        setError(strengthErr);
        return;
      }
      if (pin !== confirmPin) {
        setError('PIN confirmation does not match.');
        return;
      }
      const hashed = await hashPin(pin);
      onSave({
        locked: true,
        pin_hash: hashed,
        lock_timeout: parseInt(timeoutVal),
        biometric_enabled: biometric
      });
    }

    if (mode === 'disable') {
      const hashed = await hashPin(pin);
      if (hashed === chat.pin_hash) {
        onSave({
          locked: false,
          pin_hash: null,
          lock_timeout: null,
          biometric_enabled: false
        });
      } else {
        setError('Incorrect PIN.');
      }
    }

    if (mode === 'change_pin') {
      const hashedOld = await hashPin(oldPin);
      if (hashedOld !== chat.pin_hash) {
        setError('Current PIN is incorrect.');
        return;
      }
      const strengthErr = validatePinInput(pin, myPhone);
      if (strengthErr) {
        setError(strengthErr);
        return;
      }
      if (pin !== confirmPin) {
        setError('New PIN confirmation does not match.');
        return;
      }
      const hashedNew = await hashPin(pin);
      onSave({
        pin_hash: hashedNew
      });
    }

    if (mode === 'timeout') {
      const hashed = await hashPin(pin);
      if (hashed === chat.pin_hash) {
        onSave({
          lock_timeout: parseInt(timeoutVal)
        });
      } else {
        setError('Incorrect PIN.');
      }
    }
  };

  const handleBiometricClick = () => {
    alert("Simulating biometric scan (FaceID / TouchID placeholder)... Authentication successful!");
    onSave({
      locked: mode === 'setup',
      biometric_enabled: true
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 7, 12, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 11000
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '400px',
        padding: '30px',
        border: '1px solid var(--accent-cyan)',
        boxShadow: 'var(--shadow-glow)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(18, 22, 35, 0.95)',
        color: '#fff',
        gap: '20px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
            {mode === 'setup' && 'Secure Chat Lock'}
            {mode === 'disable' && 'Disable Chat Lock'}
            {mode === 'change_pin' && 'Change Lock PIN'}
            {mode === 'timeout' && 'Update Timeout'}
          </h3>
          <button 
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '1.2rem',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {error && (
            <div style={{
              color: '#ff1744',
              fontSize: '0.8rem',
              fontWeight: 'bold',
              background: 'rgba(255, 23, 68, 0.08)',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(255, 23, 68, 0.2)'
            }}>
              ⚠️ {error}
            </div>
          )}

          {mode === 'change_pin' && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Current PIN
              </label>
              <input
                type="password"
                className="input-field"
                value={oldPin}
                onChange={(e) => setOldPin(e.target.value)}
                maxLength={6}
                required
                autoFocus
              />
            </div>
          )}

          {(mode === 'setup' || mode === 'change_pin') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                {mode === 'change_pin' ? 'New PIN' : 'Choose PIN (4-6 digits)'}
              </label>
              <input
                type="password"
                className="input-field"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                placeholder="••••"
                required
                autoFocus={mode === 'setup'}
              />
            </div>
          )}

          {(mode === 'setup' || mode === 'change_pin') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Confirm PIN
              </label>
              <input
                type="password"
                className="input-field"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                placeholder="••••"
                required
              />
            </div>
          )}

          {(mode === 'disable' || mode === 'timeout') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Enter PIN to Verify
              </label>
              <input
                type="password"
                className="input-field"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                maxLength={6}
                placeholder="••••"
                required
                autoFocus
              />
            </div>
          )}

          {(mode === 'setup' || mode === 'timeout') && (
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Auto Lock Timeout
              </label>
              <select
                value={timeoutVal}
                onChange={(e) => setTimeoutVal(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  padding: '10px',
                  borderRadius: '8px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value={0} style={{ background: '#121623' }}>Immediately</option>
                <option value={30} style={{ background: '#121623' }}>30 Seconds</option>
                <option value={60} style={{ background: '#121623' }}>1 Minute</option>
                <option value={300} style={{ background: '#121623' }}>5 Minutes</option>
                <option value={900} style={{ background: '#121623' }}>15 Minutes</option>
                <option value={3600} style={{ background: '#121623' }}>1 Hour</option>
              </select>
            </div>
          )}

          {(mode === 'setup') && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '5px' }}>
              <input
                type="checkbox"
                id="biometric"
                checked={biometric}
                onChange={(e) => setBiometric(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="biometric" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Enable Biometric Unlock placeholder
              </label>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              type="button" 
              className="btn-secondary" 
              onClick={onClose} 
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn-primary" 
              style={{
                flex: 1,
                justifyContent: 'center',
                background: 'linear-gradient(135deg, var(--accent-cyan), #00b0ff)'
              }}
            >
              Confirm
            </button>
          </div>

          {chat && chat.biometric_enabled && (mode === 'disable' || mode === 'timeout') && (
            <button
              type="button"
              onClick={handleBiometricClick}
              style={{
                width: '100%',
                marginTop: '5px',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(0, 229, 255, 0.1)',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              Unlock with Biometrics (Placeholder)
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
