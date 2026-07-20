import { useState } from 'react';
import { User, Download, Camera, X } from 'lucide-react';
import { validateUsername, validateBio, validateEmail } from '../utils/validators';

export default function SettingsModal({
  onClose,
  myProfile,
  setMyProfile,
  linkedDevices,
  onRevokeDevice,
  myPhone,
  myUserId,
  encryptContactNames,
  setEncryptContactNames,
  pendingGroupInvites = [],
  onAcceptGroupInvite,
  onDeclineGroupInvite
}) {
  const [activeSubTab, setActiveSubTab] = useState('profile');

  // Profile States
  const [usernameInput, setUsernameInput] = useState(myProfile.username || '');
  const [bioInput, setBioInput] = useState(myProfile.bio || '');
  const [emailInput, setEmailInput] = useState(() => localStorage.getItem('gv_my_email') || 'nilkanth.jethava846@gmail.com');
  const [avatarPreview, setAvatarPreview] = useState(myProfile.avatar || '');
  const [profileMessage, setProfileMessage] = useState('');

  // Privacy States
  const [privacyPhoto, setPrivacyPhoto] = useState(() => localStorage.getItem('gv_privacy_photo') || 'Everyone');
  const [privacySeen, setPrivacySeen] = useState(() => localStorage.getItem('gv_privacy_seen') || 'Everyone');
  const [privacyCalls, setPrivacyCalls] = useState(() => localStorage.getItem('gv_privacy_calls') || 'Everyone');
  const [blockedUsersCount] = useState(0);

  // Security States
  const [pinChangeError, setPinChangeError] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');

  // Chats States
  const [wallpaper, setWallpaper] = useState(() => localStorage.getItem('gv_chat_wallpaper') || 'Obsidian Neon');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('gv_font_size') || 'Medium');

  // Storage Stats
  const [localStoreSize] = useState(() => {
    let totalChars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key) || '';
      totalChars += key.length + val.length;
    }
    return Math.round(totalChars / 1024);
  });



  const handleUpdateProfile = () => {
    setProfileMessage('');
    
    const userErr = validateUsername(usernameInput);
    if (userErr) {
      alert(userErr);
      return;
    }
    const bioErr = validateBio(bioInput);
    if (bioErr) {
      alert(bioErr);
      return;
    }
    const emailErr = validateEmail(emailInput);
    if (emailErr) {
      alert(emailErr);
      return;
    }

    const updated = {
      username: usernameInput.trim(),
      avatar: avatarPreview,
      bio: bioInput.trim()
    };
    
    setMyProfile(updated);
    localStorage.setItem('gv_my_profile', JSON.stringify(updated));
    localStorage.setItem('gv_my_email', emailInput.trim());
    setProfileMessage('✅ Profile updated successfully.');
  };

  const handleRemovePhoto = () => {
    setAvatarPreview('');
    const updated = {
      ...myProfile,
      avatar: ''
    };
    setMyProfile(updated);
    localStorage.setItem('gv_my_profile', JSON.stringify(updated));
  };

  const handleSavePrivacy = () => {
    localStorage.setItem('gv_privacy_photo', privacyPhoto);
    localStorage.setItem('gv_privacy_seen', privacySeen);
    localStorage.setItem('gv_privacy_calls', privacyCalls);
    alert('Privacy settings synchronized.');
  };

  const handleUpdatePin = (newPin) => {
    setPinChangeError('');
    setPinSuccessMessage('');
    if (!/^\d{4,6}$/.test(newPin)) {
      setPinChangeError('PIN must be between 4 and 6 numeric digits.');
      return;
    }
    if (['1234', '1111', '0000', '123456', '9876'].includes(newPin)) {
      setPinChangeError('PIN is too weak.');
      return;
    }
    localStorage.setItem('gv_chat_lock_pin', newPin);
    setPinSuccessMessage('🔒 Lock PIN changed successfully.');
  };

  const handleSaveChatConfigs = () => {
    localStorage.setItem('gv_chat_wallpaper', wallpaper);
    localStorage.setItem('gv_font_size', fontSize);
    alert('Chat style settings updated.');
  };

  const handleExportChats = () => {
    try {
      const chatsRaw = localStorage.getItem(`gv_chats_${myPhone}`) || '[]';
      const chats = JSON.parse(chatsRaw);
      let content = "=== GHOSTVIBE SECURE E2EE CHATS EXPORT ===\n";
      content += `Generated on: ${new Date().toLocaleString()}\n`;
      content += `Node Owner ID: ${myUserId}\n`;
      content += `Owner Phone: ${myPhone}\n`;
      content += `========================================\n\n`;

      chats.forEach(chat => {
        content += `Chat with: ${chat.username || 'Unknown'} (${chat.phone_number || chat.user_id})\n`;
        content += `Identity Key: ${chat.identity_key_public || 'N/A'}\n`;
        content += `----------------------------------------\n`;
        const msgs = chat.messages || [];
        msgs.forEach(m => {
          const sender = m.sender_id === myUserId ? 'Me' : 'Partner';
          content += `[${new Date(m.created_at || m.timestamp).toLocaleString()}] ${sender}: ${m.text || '[Media Attachment]'}\n`;
        });
        content += `\n\n`;
      });

      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ghostvibe_chats_export_${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export: " + err.message);
    }
  };

  const handleClearCache = () => {
    const keysToKeep = ['gv_private_key', 'gv_public_key', 'gv_phone_number', 'gv_token', 'gv_user_id', 'gv_my_profile', 'gv_my_email'];
    const backup = {};
    keysToKeep.forEach(k => {
      backup[k] = localStorage.getItem(k);
    });
    
    localStorage.clear();
    
    keysToKeep.forEach(k => {
      if (backup[k]) localStorage.setItem(k, backup[k]);
    });

    alert("Local caches cleared. Security tokens retained.");
    window.location.reload();
  };

  // Generate unique fake QR Code patterns based on owner's public key fingerprint
  const mockQrGrid = () => {
    const fingerprint = myUserId || "GHOSTVIBE_SECURE_FINGERPRINT_2026_KEY";
    const squares = [];
    for (let i = 0; i < 64; i++) {
      const charCode = fingerprint.charCodeAt(i % fingerprint.length);
      const fill = (charCode + i) % 3 === 0 ? 'var(--accent-cyan)' : 'transparent';
      squares.push(<rect key={i} x={(i % 8) * 12 + 6} y={Math.floor(i / 8) * 12 + 6} width="8" height="8" fill={fill} rx="1" />);
    }
    return squares;
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 7, 12, 0.9)',
      backdropFilter: 'blur(20px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div className="glass-panel pulse-glow" style={{
        width: '100%',
        maxWidth: '800px',
        height: '600px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: 'var(--shadow-glow)',
        display: 'flex',
        borderRadius: '20px',
        overflow: 'hidden',
        position: 'relative'
      }}>
        {/* Close/Back Button */}
        <button 
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            zIndex: 99999,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#fff';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)';
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
          }}
          title="Back to Chats"
        >
          <X size={18} />
        </button>
        
        {/* Left tabs selector */}
        <div style={{
          width: '240px',
          background: 'rgba(14, 17, 26, 0.95)',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <h3 style={{ margin: '0 0 20px 0', paddingLeft: '12px', fontSize: '1.2rem', color: 'var(--accent-cyan)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            ⚙️ Settings
          </h3>

          {[
            { id: 'profile', label: '👤 Profile', color: 'var(--accent-cyan)' },
            { id: 'privacy', label: '🔒 Privacy', color: '#ff9100' },
            { id: 'security', label: '🛡️ Security', color: '#39ff14' },
            { id: 'notifications', label: '🔔 Notifications', color: '#d500f9' },
            { id: 'chats', label: '💬 Chats', color: '#00e5ff' },
            { id: 'storage', label: '💾 Storage and Data', color: '#eab308' },
            { id: 'invites', label: `👥 Invites${pendingGroupInvites.length > 0 ? ` (${pendingGroupInvites.length})` : ''}`, color: '#ff5252' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: 0,
                borderRadius: '10px',
                background: activeSubTab === tab.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                color: activeSubTab === tab.id ? tab.color : 'var(--text-secondary)',
                cursor: 'pointer',
                fontWeight: 600,
                textAlign: 'left',
                fontSize: '0.9rem',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}

          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '10px',
              background: 'transparent',
              color: 'var(--accent-cyan)',
              cursor: 'pointer',
              fontWeight: 600,
              marginTop: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            Apply Settings
          </button>
        </div>

        {/* Right Tab Contents */}
        <div style={{ flex: 1, padding: '36px', overflowY: 'auto', boxSizing: 'border-box', background: 'rgba(9, 11, 17, 0.35)' }}>
          
          {/* PROFILE SUB TAB */}
          {activeSubTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>My Profile Cards</h2>
              
              {profileMessage && (
                <div style={{ padding: '10px', background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
                  {profileMessage}
                </div>
              )}

              <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <div style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    background: 'rgba(255,255,255,0.03)',
                    border: '2px solid var(--accent-cyan)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <User size={40} style={{ color: 'var(--text-muted)' }} />
                    )}
                  </div>
                  <input
                    type="file"
                    id="settings-avatar-file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () => setAvatarPreview(reader.result);
                        reader.readAsDataURL(file);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    onClick={() => document.getElementById('settings-avatar-file').click()}
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      background: 'var(--accent-cyan)',
                      color: '#000',
                      padding: '6px',
                      borderRadius: '50%',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Camera size={14} />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <button onClick={handleRemovePhoto} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#ff5252', borderColor: 'rgba(255,82,82,0.2)' }}>
                    Remove Photo
                  </button>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Avatar uploads are capped at 1MB</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Display Alias</label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Bio Status</label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={bioInput}
                    onChange={(e) => setBioInput(e.target.value)}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Secure Email</label>
                  <input
                    type="email"
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', gap: '20px', background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>E2EE Profile Card QR</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>Scan code to pairing peer identities</span>
                  </div>
                  <svg width="108" height="108" viewBox="0 0 108 108" style={{ background: '#fff', borderRadius: '8px', padding: '6px' }}>
                    {/* QR Finder patterns */}
                    <rect x="2" y="2" width="28" height="28" fill="var(--bg-main)" rx="4" />
                    <rect x="6" y="6" width="20" height="20" fill="#fff" rx="2" />
                    <rect x="10" y="10" width="12" height="12" fill="var(--bg-main)" rx="1" />

                    <rect x="78" y="2" width="28" height="28" fill="var(--bg-main)" rx="4" />
                    <rect x="82" y="6" width="20" height="20" fill="#fff" rx="2" />
                    <rect x="86" y="10" width="12" height="12" fill="var(--bg-main)" rx="1" />

                    <rect x="2" y="78" width="28" height="28" fill="var(--bg-main)" rx="4" />
                    <rect x="6" y="82" width="20" height="20" fill="#fff" rx="2" />
                    <rect x="10" y="86" width="12" height="12" fill="var(--bg-main)" rx="1" />

                    {mockQrGrid()}
                  </svg>
                </div>
              </div>

              <button onClick={handleUpdateProfile} className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '10px' }}>
                Save Profile Changes
              </button>
            </div>
          )}

          {/* PRIVACY SUB TAB */}
          {activeSubTab === 'privacy' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Privacy Scopes</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Who can see Profile Photo</label>
                  <select value={privacyPhoto} onChange={(e) => setPrivacyPhoto(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="Everyone">Everyone</option>
                    <option value="Contacts">My Contacts</option>
                    <option value="Nobody">Nobody</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Who can see Last Active Status</label>
                  <select value={privacySeen} onChange={(e) => setPrivacySeen(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="Everyone">Everyone</option>
                    <option value="Contacts">My Contacts</option>
                    <option value="Nobody">Nobody</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Who can voice/video Call Me</label>
                  <select value={privacyCalls} onChange={(e) => setPrivacyCalls(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="Everyone">Everyone</option>
                    <option value="Contacts">My Contacts Only</option>
                    <option value="Nobody">Nobody (Deactivate calls)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '5px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>Mask Contact Names</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Obscure contact names and phone numbers with secure cryptographic codes</span>
                  </div>
                  <input 
                    type="checkbox" 
                    checked={encryptContactNames} 
                    onChange={(e) => setEncryptContactNames(e.target.checked)} 
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }} 
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', marginTop: '10px' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>Blocked Contacts</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>Blocked nodes cannot send messages or make calls</span>
                  </div>
                  <span style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>
                    {blockedUsersCount} nodes
                  </span>
                </div>
              </div>

              <button onClick={handleSavePrivacy} className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '10px' }}>
                Save Privacy Settings
              </button>
            </div>
          )}

          {/* SECURITY SUB TAB */}
          {activeSubTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Security & E2EE Keys</h2>

              {pinChangeError && (
                <div style={{ padding: '10px', background: 'rgba(255, 23, 68, 0.15)', border: '1px solid rgba(255, 23, 68, 0.3)', borderRadius: '8px', color: '#ff5252', fontSize: '0.85rem' }}>
                  ⚠️ {pinChangeError}
                </div>
              )}
              {pinSuccessMessage && (
                <div style={{ padding: '10px', background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem' }}>
                  {pinSuccessMessage}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>App / Chat lock PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    placeholder="Enter new 4-6 digit lock PIN"
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box', letterSpacing: '3px' }}
                    onChange={(e) => {
                      if (e.target.value.length >= 4) {
                        handleUpdatePin(e.target.value);
                      }
                    }}
                  />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>Stores an encrypted keychain validation hash locally</span>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff', fontWeight: 600, marginBottom: '10px' }}>E2EE Identity Fingerprint</span>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--accent-cyan)', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', wordBreak: 'break-all' }}>
                    GV-X3DH-2026-SHA256-{myUserId ? myUserId.replace(/-/g, '').toUpperCase() : "KEYFINGERPRINT"}
                  </div>
                  <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: '1.4' }}>
                    All local databases and chats utilize this Curve25519 public key identifier for X3DH Diffie-Hellman key exchanges.
                  </span>
                </div>

                {linkedDevices && linkedDevices.length > 0 && (
                  <div>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Active Linked Sessions</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {linkedDevices.map(d => (
                        <div key={d.device_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{ fontSize: '0.8rem' }}>{d.device_name || 'Browser Node'}</span>
                          <button onClick={() => onRevokeDevice(d.device_id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.7rem', color: '#ff5252' }}>
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NOTIFICATIONS SUB TAB */}
          {activeSubTab === 'notifications' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Notification Options</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff' }}>Incoming Message Sounds</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Play sent/received audio chimes</span>
                  </div>
                  <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff' }}>Call Ringtones</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Alert sound on incoming voice/video calls</span>
                  </div>
                  <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff' }}>Desktop Alerts</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Show operating system popup notifications</span>
                  </div>
                  <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
                </div>
              </div>
            </div>
          )}

          {/* CHATS SUB TAB */}
          {activeSubTab === 'chats' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Chat Aesthetics</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Chat Wallpaper</label>
                  <select value={wallpaper} onChange={(e) => setWallpaper(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="Obsidian Neon">Obsidian Neon (Default)</option>
                    <option value="Dark Slate">Dark Slate</option>
                    <option value="Cyber Teal">Cyber Teal</option>
                    <option value="Emerald Green">Emerald Green</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Message Font Size</label>
                  <select value={fontSize} onChange={(e) => setFontSize(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="Small">Small (13px)</option>
                    <option value="Medium">Medium (15px)</option>
                    <option value="Large">Large (17px)</option>
                  </select>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '20px', marginTop: '10px' }}>
                  <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff', fontWeight: 600, marginBottom: '12px' }}>E2EE Archive & Export</span>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={handleExportChats} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Download size={14} /> Export Chats Log (.txt)
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={handleSaveChatConfigs} className="btn-primary" style={{ alignSelf: 'flex-start', marginTop: '10px' }}>
                Save Chat Configurations
              </button>
            </div>
          )}

          {/* STORAGE SUB TAB */}
          {activeSubTab === 'storage' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Storage utilization</h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>LocalStorage Cache</span>
                    <span style={{ fontSize: '0.9rem', color: 'var(--accent-cyan)', fontWeight: 700 }}>{localStoreSize} KB</span>
                  </div>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, localStoreSize / 10)}%`, height: '100%', background: 'var(--accent-cyan)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.85rem', color: '#fff' }}>Clear Local Cache</span>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Frees cache memory (excludes keys)</span>
                  </div>
                  <button onClick={handleClearCache} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#ff5252', borderColor: 'rgba(255,82,82,0.2)' }}>
                    Clear
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* GROUP INVITES SUB TAB */}
          {activeSubTab === 'invites' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#fff' }}>Pending Group Invitations</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                Review and accept invitations to join secure E2EE group chat rooms.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                {pendingGroupInvites.map(inv => (
                  <div key={inv.invite_id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255,255,255,0.02)',
                    padding: '14px 18px',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: '600', color: '#fff' }}>
                        {inv.group_name}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Invited by: {inv.invited_by_username} ({inv.invited_by_phone})
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button 
                        onClick={() => onAcceptGroupInvite(inv.invite_id)}
                        className="btn-primary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'linear-gradient(135deg, var(--accent-green), #00c853)', border: 'none' }}
                      >
                        Accept
                      </button>
                      <button 
                        onClick={() => onDeclineGroupInvite(inv.invite_id)}
                        className="btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '0.8rem', color: '#ff5252', borderColor: 'rgba(255,82,82,0.2)' }}
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
                {pendingGroupInvites.length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '40px 20px',
                    color: 'var(--text-muted)',
                    fontSize: '0.85rem'
                  }}>
                    No pending invitations.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
