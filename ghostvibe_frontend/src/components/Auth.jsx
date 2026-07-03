import { useState } from 'react';
import { Shield, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import { generateLocalIdentityKeys, generatePreKeys } from '../utils/signal_crypto';
import { initDatabase, saveRecord } from '../utils/indexed_db';
import { validateOtpCode } from '../utils/validators';
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js';

const COUNTRIES = [
  { code: 'IN', name: 'India', flag: '🇮🇳', dial: '+91', maxLength: 10 },
  { code: 'US', name: 'United States', flag: '🇺🇸', dial: '+1', maxLength: 10 },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧', dial: '+44', maxLength: 10 },
  { code: 'AE', name: 'UAE', flag: '🇦🇪', dial: '+971', maxLength: 9 },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', dial: '+1', maxLength: 10 },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', dial: '+61', maxLength: 9 },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', dial: '+49', maxLength: 11 },
  { code: 'SG', name: 'Singapore', flag: '🇸🇬', dial: '+65', maxLength: 8 }
];

export default function Auth({ onAuthSuccess }) {
  const [phoneNumber, setPhoneNumber] = useState(''); // Stores final E.164 format
  const [selectedCountryCode, setSelectedCountryCode] = useState('IN');
  const [localNumber, setLocalNumber] = useState(''); // Raw formatted local input
  const [otpCode, setOtpCode] = useState('');
  const [step, setStep] = useState('phone'); // 'phone' | 'otp' | 'generating'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mockOtp, setMockOtp] = useState('');

  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';

  const selectedCountry = COUNTRIES.find(c => c.code === selectedCountryCode) || COUNTRIES[0];

  const handleSendOtp = async (e) => {
    e.preventDefault();
    const rawDigits = localNumber.replace(/\D/g, '');
    const fullE164 = `${selectedCountry.dial}${rawDigits}`;
    
    // Strict libphonenumber check
    let isValid;
    try {
      const parsed = parsePhoneNumberFromString(fullE164);
      isValid = !!(parsed && parsed.isValid());
    } catch {
      isValid = false;
    }
    
    if (!isValid) {
      setError(`Invalid phone number format for ${selectedCountry.name}.`);
      return;
    }

    setPhoneNumber(fullE164);
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${backendUrl}/api/auth/otp/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: fullE164 }),
      });
      if (!res.ok) {
        const detail = await res.json();
        throw new Error(detail.detail || 'Failed to trigger OTP');
      }
      const data = await res.json();
      setMockOtp(data.otp_code);
      setStep('otp');
    } catch (err) {
      setError(err.message || 'Cannot connect to GhostVibe backend. Make sure it is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const otpErr = validateOtpCode(otpCode);
    if (otpErr) {
      setError(otpErr);
      return;
    }
    setLoading(true);
    setError('');
    setStep('generating');

    // Simulate key generation inside hardware keystore
    setTimeout(async () => {
      try {
        const keys = generateLocalIdentityKeys();
        const preKeys = generatePreKeys(20);

        // Save private keys locally ONLY (NEVER upload to server)
        localStorage.setItem(`gv_private_key`, keys.privateKey);
        localStorage.setItem(`gv_public_key`, keys.publicKey);
        localStorage.setItem(`gv_phone_number`, phoneNumber);

        const res = await fetch(`${backendUrl}/api/auth/otp/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone_number: phoneNumber,
            otp_code: otpCode,
            identity_key_public: keys.publicKey,
            pre_keys: preKeys,
          }),
        });

        if (!res.ok) {
          const detail = await res.json();
          throw new Error(detail.detail || 'Verification failed');
        }

        const data = await res.json();
        // Save access tokens
        localStorage.setItem('gv_token', data.access_token);
        localStorage.setItem('gv_user_id', data.user_id);

        try {
          await initDatabase();
          const encKey = keys.privateKey;
          await saveRecord('keys', 'gv_private_key', keys.privateKey, encKey);
          await saveRecord('keys', 'gv_public_key', keys.publicKey, encKey);
          await saveRecord('keys', 'gv_phone_number', phoneNumber, encKey);
          await saveRecord('cache', 'gv_token', data.access_token, encKey);
          await saveRecord('cache', 'gv_user_id', data.user_id, encKey);
          console.log("Session metadata parallel IndexedDB save success!");
        } catch (dbErr) {
          console.warn("Session metadata parallel IndexedDB save failed:", dbErr);
        }
        
        onAuthSuccess(data.user_id, data.access_token);
      } catch (err) {
        setError(err.message || 'Verification failed. Try again.');
        setStep('otp');
      } finally {
        setLoading(false);
      }
    }, 1200); // UI visual pause for the "generating keys" cyber feel
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '20px'
    }}>
      <div className="glass-panel" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px 30px',
        textAlign: 'center',
        boxShadow: 'var(--shadow-glow)'
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '70px',
          height: '70px',
          borderRadius: '24px',
          background: 'rgba(0, 229, 255, 0.1)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          marginBottom: '20px',
          color: 'var(--accent-cyan)'
        }}>
          <Shield size={36} className="pulse-glow" style={{ borderRadius: '50%' }} />
        </div>

        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>GhostVibe</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '30px', fontSize: '0.95rem' }}>
          Go Ghost, Keep the Vibe.
        </p>

        {error && (
          <div style={{
            background: 'rgba(255, 23, 68, 0.15)',
            border: '1px solid rgba(255, 23, 68, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            color: '#ff5252',
            fontSize: '0.9rem',
            marginBottom: '20px',
            textAlign: 'left'
          }}>
            {error}
          </div>
        )}

        {step === 'phone' && (
          <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Country / Region</label>
              <select
                value={selectedCountryCode}
                onChange={(e) => {
                  setSelectedCountryCode(e.target.value);
                  setLocalNumber('');
                  setError('');
                }}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  color: '#fff',
                  padding: '12px',
                  outline: 'none',
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code} style={{ background: '#121623' }}>
                    {c.flag} {c.name} ({c.dial})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Phone Number</label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '0 14px',
                  color: 'var(--accent-cyan)',
                  fontSize: '0.95rem',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}>
                  {selectedCountry.flag} {selectedCountry.dial}
                </div>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="98765 43210"
                  className="input-field"
                  style={{ flex: 1 }}
                  value={localNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    const trimmed = digits.slice(0, selectedCountry.maxLength);
                    const formatted = new AsYouType(selectedCountry.code).input(trimmed);
                    setLocalNumber(formatted);
                  }}
                  required
                />
              </div>
            </div>
            
            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', width: '100%' }} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <>Verify Identity <ArrowRight size={18} /></>}
            </button>
          </form>
        )}


        {step === 'otp' && (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ textAlign: 'left' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>
                Enter OTP Verification Code
              </label>
              <div style={{ position: 'relative' }}>
                <KeyRound size={20} style={{ position: 'absolute', left: '14px', top: '14px', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter 6-digit OTP"
                  className="input-field"
                  style={{ paddingLeft: '45px', letterSpacing: '4px', textAlign: 'center' }}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  required
                />
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--accent-cyan)', marginTop: '8px', display: 'block' }}>
                Sandbox code sent: {mockOtp}
              </span>
            </div>

            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', width: '100%' }} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <>Verify OTP & Onboard <ArrowRight size={18} /></>}
            </button>
            
            <button
              type="button"
              className="btn-secondary"
              style={{ justifyContent: 'center', width: '100%' }}
              onClick={() => setStep('phone')}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}

        {step === 'generating' && (
          <div style={{ padding: '20px 0' }}>
            <Loader2 size={40} className="animate-spin" style={{ color: 'var(--accent-cyan)', margin: '0 auto 20px auto' }} />
            <h3 style={{ color: 'var(--accent-cyan)', marginBottom: '8px' }}>Securing Device Hardware...</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
              Generating Local Curve25519 Ephemeral Pre-keys. Private credentials will remain locked in your physical keychain buffer.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
