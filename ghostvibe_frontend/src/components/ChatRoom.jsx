import { useState, useEffect, useRef } from 'react';
import { Send, Phone, ShieldCheck, Languages, Paperclip, MoreVertical, Trash2, CheckSquare, Square, Clock, ArrowLeft } from 'lucide-react';
import { encryptMessageLocal } from '../utils/signal_crypto';
import MediaViewer from './MediaViewer';
import ChatLockModal from './ChatLockModal';
import { hashPin } from '../utils/chat_lock';
import { validateChatMessage, validateFileUpload } from '../utils/validators';

// Vibe skin configurations
const vibeThemes = {
  chill: {
    name: 'Chill ☕',
    color: 'var(--accent-cyan)',
    bg: 'linear-gradient(180deg, rgba(0, 229, 255, 0.05) 0%, rgba(9, 11, 17, 0.95) 100%)',
    border: 'rgba(0, 229, 255, 0.15)',
    shadow: '0 0 25px rgba(0, 229, 255, 0.06)',
    bubbleBgMe: 'rgba(0, 229, 255, 0.12)',
    bubbleBorderMe: 'rgba(0, 229, 255, 0.25)'
  },
  electric: {
    name: 'Electric ⚡',
    color: 'var(--accent-green)',
    bg: 'linear-gradient(180deg, rgba(57, 255, 20, 0.05) 0%, rgba(9, 11, 17, 0.95) 100%)',
    border: 'rgba(57, 255, 20, 0.15)',
    shadow: '0 0 25px rgba(57, 255, 20, 0.06)',
    bubbleBgMe: 'rgba(57, 255, 20, 0.12)',
    bubbleBorderMe: 'rgba(57, 255, 20, 0.25)'
  },
  ghost: {
    name: 'Ghost 👻',
    color: 'var(--accent-pink)',
    bg: 'linear-gradient(180deg, rgba(213, 0, 249, 0.05) 0%, rgba(9, 11, 17, 0.95) 100%)',
    border: 'rgba(213, 0, 249, 0.15)',
    shadow: '0 0 25px rgba(213, 0, 249, 0.06)',
    bubbleBgMe: 'rgba(213, 0, 249, 0.12)',
    bubbleBorderMe: 'rgba(213, 0, 249, 0.25)'
  },
  party: {
    name: 'Party 🎉',
    color: '#ff9100',
    bg: 'linear-gradient(180deg, rgba(255, 145, 0, 0.05) 0%, rgba(9, 11, 17, 0.95) 100%)',
    border: 'rgba(255, 145, 0, 0.15)',
    shadow: '0 0 25px rgba(255, 145, 0, 0.06)',
    bubbleBgMe: 'rgba(255, 145, 0, 0.12)',
    bubbleBorderMe: 'rgba(255, 145, 0, 0.25)'
  }
};

export default function ChatRoom({ 
  chat, 
  onSendMessage, 
  onInitiateCall,
  onDeleteLocal,
  onDeleteEveryone,
  onClearChat,
  presenceStatus = { status: 'offline', last_active: null },
  vibe = 'chill',
  onUpdateVibe,
  vibeBurst = null,
  myPhone,
  lastSeenEnabled,
  onMediaOpened,
  unlockedChatIds = new Set(),
  onUnlockChat,
  onSetChatLockSettings,
  encryptContactNames,
  activeGroupCalls = {},
  onJoinGroupCall,
  onBack
}) {
  const [inputText, setInputText] = useState('');
  const [viewOnceEnabled, setViewOnceEnabled] = useState(false);
  const [activeViewerMedia, setActiveViewerMedia] = useState(null);
  const [showLockConfig, setShowLockConfig] = useState(false);
  const [lockMode, setLockMode] = useState('setup');
  const [pinInput, setPinInput] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [, setTimeTicker] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeTicker(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const [translateTarget, setTranslateTarget] = useState('none'); // 'none' | 'gu' | 'en' | 'hi'
  const [translatedMessages, setTranslatedMessages] = useState({}); // messageId -> translatedText
  const [translatingId, setTranslatingId] = useState(null);
  
  // Context menu message state
  const [activeMenuId, setActiveMenuId] = useState(null);

  // Multi-select message deletion states
  const [selectMode, setSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(new Set());

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleInlineUnlock = async (e) => {
    if (e) e.preventDefault();
    setUnlockError('');
    const hashed = await hashPin(pinInput);
    if (hashed === chat.pin_hash) {
      onUnlockChat(chat.user_id, chat.lock_timeout || 0);
      setPinInput('');
    } else {
      setUnlockError('Incorrect PIN.');
    }
  };

  const handleInlineBiometric = () => {
    alert("Simulating biometric scan (FaceID / TouchID placeholder)... Authentication successful!");
    onUnlockChat(chat.user_id, chat.lock_timeout || 0);
  };
  const backendUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080'; // IPv4 resolved endpoint

  // Fetch theme styling
  const activeTheme = vibeThemes[vibe] || vibeThemes.chill;

  // Self chat check
  const isSelfChat = chat.phone_number === myPhone;

  const messages = Array.isArray(chat?.messages) ? chat.messages : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages.length]);

  const handleSendText = (e) => {
    e.preventDefault();
    const msgErr = validateChatMessage(inputText);
    if (msgErr) {
      alert(msgErr);
      return;
    }

    // Encrypt locally
    const localEncrypted = encryptMessageLocal(inputText, chat.identity_key_public);
    onSendMessage(chat.user_id, inputText, localEncrypted.encryptedBody, 'text');
    setInputText('');
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileErr = validateFileUpload(file, 10 * 1024 * 1024);
    if (fileErr) {
      alert(fileErr);
      e.target.value = '';
      return;
    }

    const isVideoFile = file.type.startsWith('video/');
    const typeSelected = isVideoFile ? 'video' : 'image';

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result;
      const encryptedMedia = encryptMessageLocal(base64Data, chat.identity_key_public);
      onSendMessage(chat.user_id, "", encryptedMedia.encryptedBody, typeSelected, base64Data, viewOnceEnabled);
      setViewOnceEnabled(false); // Reset view once toggle
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleTranslateMessage = async (msgId, text, sourceLang = 'auto') => {
    if (translateTarget === 'none') return;
    
    setTranslatingId(msgId);
    try {
      const res = await fetch(`${backendUrl}/api/ai/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source_lang: sourceLang,
          target_lang: translateTarget
        })
      });
      if (res.ok) {
        const data = await res.json();
        setTranslatedMessages(prev => ({
          ...prev,
          [msgId]: data.translated_text
        }));
      }
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setTranslatingId(null);
    }
  };

  const formatPresence = () => {
    if (presenceStatus.status === 'online') {
      return lastSeenEnabled ? 'Online' : 'Online';
    }
    if (!presenceStatus.last_active || !lastSeenEnabled) return 'Offline';
    try {
      const date = new Date(presenceStatus.last_active);
      return `Last active ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } catch {
      return 'Offline';
    }
  };

  const renderStatusTicks = (status) => {
    switch (status) {
      case 'sent':
      case 'queued':
        return <span style={{ color: 'var(--text-muted)', marginLeft: '4px' }}>✓</span>;
      case 'delivered':
        return <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>✓✓</span>;
      case 'read':
        return <span style={{ color: 'var(--accent-cyan)', marginLeft: '4px', textShadow: '0 0 4px rgba(0, 229, 255, 0.4)' }}>✓✓</span>;
      default:
        return <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', marginLeft: '4px' }}>🕒</span>;
    }
  };

  // Toggle checkbox selection of a message
  const toggleSelectMessage = (messageId) => {
    setSelectedMessageIds(prev => {
      const updated = new Set(prev);
      if (updated.has(messageId)) {
        updated.delete(messageId);
      } else {
        updated.add(messageId);
      }
      return updated;
    });
  };

  // Perform bulk deletion of selected messages
  const handleDeleteSelected = () => {
    if (selectedMessageIds.size === 0) return;
    if (window.confirm(`Delete ${selectedMessageIds.size} selected messages?`)) {
      selectedMessageIds.forEach(id => {
        const msg = messages.find(m => m.id === id);
        if (msg) {
          if (msg.sender === 'me' && !msg.deletedEveryone) {
            onDeleteEveryone(chat.user_id, id);
          } else {
            onDeleteLocal(chat.user_id, id);
          }
        }
      });
      setSelectedMessageIds(new Set());
      setSelectMode(false);
    }
  };

  const handleClearHistory = () => {
    if (window.confirm("Are you sure you want to clear this chat history locally?")) {
      onClearChat(chat.user_id);
    }
  };

  // Renders the animation overlay when a Vibe Check is triggered
  const renderVibeBurstOverlay = () => {
    if (!vibeBurst) return null;
    
    // Render 15 floating particles
    const particles = Array.from({ length: 15 });

    return (
      <div className={`vibe-overlay-container`} style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 10
      }}>
        {particles.map((_, i) => {
          const leftVal = `${10 + Math.random() * 80}%`;
          const delayVal = `${Math.random() * 1.2}s`;
          const sizeVal = `${16 + Math.random() * 24}px`;
          const durationVal = `${2.2 + Math.random() * 1.8}s`;
          
          let content = '☕';
          if (vibeBurst === 'chill') content = '🫧';
          else if (vibeBurst === 'electric') content = '⚡';
          else if (vibeBurst === 'ghost') content = '👻';
          else if (vibeBurst === 'party') {
            const emojis = ['🎉', '✨', '🥳', '🎁', '✨', '🥂'];
            content = emojis[i % emojis.length];
          }

          return (
            <div 
              key={i} 
              className="vibe-particle" 
              style={{
                position: 'absolute',
                bottom: '-50px',
                left: leftVal,
                fontSize: sizeVal,
                animationDelay: delayVal,
                animationDuration: durationVal,
                opacity: 0,
                animationName: 'floatBubble',
                animationTimingFunction: 'ease-out',
                animationIterationCount: 1,
                animationFillMode: 'forwards'
              }}
            >
              {content}
            </div>
          );
        })}
      </div>
    );
  };

  const isLocked = chat.locked && !unlockedChatIds.has(chat.user_id);

  if (isLocked) {
    return (
      <div className="glass-panel" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '20px',
        background: 'rgba(10, 13, 23, 0.95)',
        color: '#fff',
        borderColor: activeTheme.border,
        boxShadow: activeTheme.shadow
      }}>
        <div className="glass-panel" style={{
          width: '100%',
          maxWidth: '360px',
          padding: '30px',
          border: '1px solid var(--accent-cyan)',
          boxShadow: 'var(--shadow-glow)',
          borderRadius: '16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
          textAlign: 'center',
          background: 'rgba(18, 22, 35, 0.95)'
        }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            background: 'rgba(0, 229, 255, 0.1)',
            border: '1px solid var(--accent-cyan)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--accent-cyan)',
            fontSize: '1.8rem'
          }}>
            🔒
          </div>
          <div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '1.2rem', fontWeight: 'bold' }}>Chat is Locked</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Enter your secure passcode to view conversation messages.
            </p>
          </div>

          <form onSubmit={handleInlineUnlock} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            {unlockError && (
              <div style={{
                color: '#ff1744',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                background: 'rgba(255, 23, 68, 0.08)',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 23, 68, 0.2)'
              }}>
                ⚠️ {unlockError}
              </div>
            )}
            <input
              type="password"
              className="input-field"
              placeholder="Enter PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              maxLength={8}
              style={{ textAlign: 'center', fontSize: '1.1rem', letterSpacing: '8px' }}
              required
              autoFocus
            />
            <button 
              type="submit" 
              className="btn-primary"
              style={{
                width: '100%',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, var(--accent-cyan), #00b0ff)'
              }}
            >
              Unlock
            </button>
          </form>

          {chat.biometric_enabled && (
            <button
              onClick={handleInlineBiometric}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                background: 'rgba(0, 229, 255, 0.1)',
                border: '1px solid var(--accent-cyan)',
                color: 'var(--accent-cyan)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginTop: '-5px'
              }}
            >
              Verify Biometrics (Placeholder)
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel" style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px',
      gap: '15px',
      position: 'relative',
      background: activeTheme.bg,
      borderColor: activeTheme.border,
      boxShadow: activeTheme.shadow,
      transition: 'all 0.5s ease'
    }}>
      {/* Vibe Burst particle container */}
      {renderVibeBurstOverlay()}

      {/* Top Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '15px',
        zIndex: 20
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Back button for mobile responsiveness */}
          <button 
            className="mobile-back-btn"
            onClick={onBack}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: '6px',
              display: 'none',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.05)',
              marginRight: '2px'
            }}
            title="Back to Chats"
          >
            <ArrowLeft size={18} />
          </button>
          
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#fff' }}>
              {encryptContactNames 
                ? (chat.isGroup ? `🔒 Group-[${chat.user_id.substring(0, 6)}]` : `🔒 Node-[${chat.user_id.substring(0, 6)}]`)
                : (chat.isGroup ? `👥 ${chat.name}` : (chat.name || chat.phone_number))}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                color: (!chat.isGroup && presenceStatus.status === 'online') ? 'var(--accent-green)' : 'var(--text-secondary)',
                fontWeight: (!chat.isGroup && presenceStatus.status === 'online') ? '500' : 'normal'
              }}>
                {chat.isGroup ? `${chat.members?.length || 0} participants` : formatPresence()}
              </span>
              <span style={{ color: 'var(--border-color)', fontSize: '0.8rem' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: activeTheme.color, display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: '500' }}>
                <ShieldCheck size={13} /> {activeTheme.name} Vibe
              </span>
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Vibe Selection Panel */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            background: 'rgba(0,0,0,0.3)', 
            padding: '3px', 
            borderRadius: '20px', 
            border: '1px solid var(--border-color)' 
          }}>
            {Object.keys(vibeThemes).map((key) => {
              const theme = vibeThemes[key];
              const isSelected = vibe === key;
              return (
                <button
                  key={key}
                  onClick={() => onUpdateVibe(key)}
                  style={{
                    background: isSelected ? theme.color : 'transparent',
                    color: isSelected ? '#000' : 'var(--text-secondary)',
                    border: 'none',
                    padding: '5px 12px',
                    borderRadius: '16px',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    boxShadow: isSelected ? `0 0 10px ${theme.color}` : 'none'
                  }}
                  title={`Set ${theme.name} Vibe`}
                >
                  {theme.name}
                </button>
              );
            })}
          </div>

          {/* Action buttons (Clear Chat & Selection Mode) */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {chat.locked ? (
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'disable') {
                    setLockMode('disable');
                    setShowLockConfig(true);
                  } else if (val === 'change_pin') {
                    setLockMode('change_pin');
                    setShowLockConfig(true);
                  } else if (val === 'timeout') {
                    setLockMode('timeout');
                    setShowLockConfig(true);
                  }
                  e.target.value = '';
                }}
                style={{
                  background: 'rgba(255,23,68,0.1)',
                  border: '1px solid rgba(255,23,68,0.3)',
                  color: '#ff1744',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="" style={{ background: '#121623', color: '#fff' }}>🔒 Locked</option>
                <option value="change_pin" style={{ background: '#121623', color: '#fff' }}>Change PIN</option>
                <option value="timeout" style={{ background: '#121623', color: '#fff' }}>Change Timeout</option>
                <option value="disable" style={{ background: '#121623', color: '#fff' }}>Disable Lock</option>
              </select>
            ) : (
              <button
                onClick={() => {
                  setLockMode('setup');
                  setShowLockConfig(true);
                }}
                className="btn-secondary"
                style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '10px' }}
                title="Lock Chat"
              >
                🔓 Lock Chat
              </button>
            )}

            <button
              onClick={handleClearHistory}
              className="btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '10px' }}
              title="Clear Chat History"
              disabled={selectMode}
            >
              Clear Chat
            </button>
            <button
              onClick={() => {
                setSelectMode(!selectMode);
                setSelectedMessageIds(new Set());
              }}
              className={selectMode ? 'btn-primary' : 'btn-secondary'}
              style={{ padding: '8px 12px', fontSize: '0.8rem', borderRadius: '10px' }}
              title="Select Messages"
            >
              {selectMode ? 'Cancel' : 'Select'}
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
            <Languages size={16} style={{ color: 'var(--accent-cyan)' }} />
            <select
              value={translateTarget}
              onChange={(e) => setTranslateTarget(e.target.value)}
              style={{
                background: '#121623',
                border: 'none',
                color: 'var(--text-primary)',
                outline: 'none',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <option value="none" style={{ background: '#121623', color: '#fff' }}>No Auto-Translate</option>
              <option value="gu" style={{ background: '#121623', color: '#fff' }}>Translate to Gujarati</option>
              <option value="en" style={{ background: '#121623', color: '#fff' }}>Translate to English</option>
              <option value="hi" style={{ background: '#121623', color: '#fff' }}>Translate to Hindi</option>
            </select>
          </div>

          <button 
            className="btn-primary" 
            style={{ 
              padding: '10px 16px', 
              fontSize: '0.85rem',
              background: 'linear-gradient(135deg, var(--accent-green), #00c853)',
              boxShadow: 'var(--shadow-glow-green)'
            }}
            onClick={() => onInitiateCall(chat.user_id)}
          >
            <Phone size={16} style={{ fill: 'currentColor' }} /> Start Call
          </button>
        </div>
      </div>

      {/* Loopback loop Warning Banner */}
      {isSelfChat && (
        <div style={{
          background: 'rgba(255, 23, 68, 0.08)',
          border: '1px solid rgba(255, 23, 68, 0.2)',
          padding: '10px 16px',
          borderRadius: '12px',
          color: '#ff5252',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          zIndex: 20
        }}>
          ⚠️ <strong>Self Vibe Mode:</strong> You are messaging your own device loopback terminal. Messages will loop back immediately.
        </div>
      )}

      {/* Active Group Call Joining Banner */}
      {chat.isGroup && activeGroupCalls[chat.user_id] && activeGroupCalls[chat.user_id].length > 0 && (
        <div style={{
          background: 'rgba(57, 255, 20, 0.08)',
          border: '1px solid rgba(57, 255, 20, 0.2)',
          padding: '12px 20px',
          borderRadius: '12px',
          color: 'var(--accent-green)',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          zIndex: 20,
          boxShadow: 'var(--shadow-glow-green)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '1.1rem' }}>📞</span>
            <span>
              <strong>Active Group Call:</strong> {activeGroupCalls[chat.user_id].length} participants are in this call.
            </span>
          </div>
          <button 
            className="btn-primary" 
            style={{ 
              padding: '6px 14px', 
              fontSize: '0.8rem', 
              background: 'linear-gradient(135deg, var(--accent-green), #00c853)',
              boxShadow: '0 0 10px rgba(57,255,20,0.3)',
              borderColor: 'rgba(57,255,20,0.5)'
            }}
            onClick={() => {
              if (onJoinGroupCall) onJoinGroupCall(chat.user_id);
            }}
          >
            Join Call
          </button>
        </div>
      )}

      {/* Messages Window */}
      <div 
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          paddingRight: '5px',
          zIndex: 15
        }}
        onClick={() => setActiveMenuId(null)}
      >
        {messages.length === 0 ? (
          <div style={{
            margin: 'auto',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.85rem',
            maxWidth: '300px',
            lineHeight: '1.6'
          }}>
            <ShieldCheck size={32} style={{ color: activeTheme.color, marginBottom: '10px' }} />
            Private session initialized. Messages and photos shared here are encrypted client-side and bypass server storage entirely.
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender === 'me';
            const msgTranslation = translatedMessages[msg.id];
            const isSelected = selectedMessageIds.has(msg.id);
            
            return (
              <div 
                key={msg.id}
                style={{
                  maxWidth: '70%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  alignSelf: isMe ? 'flex-end' : 'flex-start',
                  flexDirection: isMe ? 'row-reverse' : 'row',
                  animation: 'fadeInUp 0.3s ease-out'
                }}
              >
                {/* Checkbox for Select Mode */}
                {selectMode && (
                  <div 
                    onClick={() => toggleSelectMessage(msg.id)}
                    style={{
                      color: isSelected ? activeTheme.color : 'var(--text-muted)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'color 0.2s'
                    }}
                  >
                    {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                  </div>
                )}

                {/* Message Bubble Column */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: isMe ? 'flex-end' : 'flex-start'
                }}>
                  <div 
                    className="message-bubble-wrapper"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      flexDirection: isMe ? 'row' : 'row-reverse'
                    }}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === msg.id ? null : msg.id);
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        opacity: activeMenuId === msg.id ? 1 : 0,
                        transition: 'opacity 0.2s',
                        padding: '4px'
                      }}
                      className="msg-menu-btn"
                      disabled={selectMode} // Disable menus in select mode
                    >
                      <MoreVertical size={16} />
                    </button>

                    {activeMenuId === msg.id && (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: isMe ? '0' : 'auto',
                        left: isMe ? 'auto' : '0',
                        background: '#121623',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        boxShadow: '0 8px 16px rgba(0,0,0,0.5)',
                        padding: '4px',
                        zIndex: 30,
                        display: 'flex',
                        flexDirection: 'column',
                        width: '140px'
                      }}>
                        <button 
                          onClick={() => {
                            onDeleteLocal(chat.user_id, msg.id);
                            setActiveMenuId(null);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            padding: '8px 12px',
                            textAlign: 'left',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderRadius: '4px'
                          }}
                        >
                          <Trash2 size={12} /> Delete for Me
                        </button>
                        
                        {isMe && !msg.deletedEveryone && (
                          <button 
                            onClick={() => {
                              onDeleteEveryone(chat.user_id, msg.id);
                              setActiveMenuId(null);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#ff5252',
                              padding: '8px 12px',
                              textAlign: 'left',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              borderRadius: '4px'
                            }}
                          >
                            <Trash2 size={12} /> Delete for Everyone
                          </button>
                        )}
                      </div>
                    )}

                    <div style={{
                      background: isMe ? activeTheme.bubbleBgMe : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${isMe ? activeTheme.bubbleBorderMe : 'var(--border-color)'}`,
                      padding: msg.msgType === 'image' && !msg.deletedEveryone ? '6px' : '10px 14px',
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      color: msg.deletedEveryone ? 'var(--text-muted)' : '#fff',
                      fontSize: '0.95rem',
                      fontStyle: msg.deletedEveryone ? 'italic' : 'normal',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      transition: 'all 0.3s ease'
                    }}>
                      {chat.isGroup && !isMe && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: '700', 
                          color: 'var(--accent-cyan)', 
                          marginBottom: '4px',
                          display: 'block' 
                        }}>
                          {encryptContactNames 
                            ? `🔒 Node-[${msg.sender_id ? msg.sender_id.substring(0, 6) : 'unknown'}]` 
                            : (msg.sender_phone || 'Group Participant')}
                        </div>
                      )}

                      {msg.view_once && !msg.deletedEveryone ? (
                        msg.opened ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)' }}>
                            <Clock size={16} />
                            <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>Opened</span>
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              if (!isMe) {
                                setActiveViewerMedia({ src: msg.mediaData, type: msg.msgType, msgId: msg.id });
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              cursor: isMe ? 'default' : 'pointer',
                              padding: '6px 10px',
                              background: 'rgba(255,255,255,0.08)',
                              borderRadius: '10px',
                              border: '1px solid rgba(255,255,255,0.1)'
                            }}
                          >
                            <div style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              background: 'rgba(0, 229, 255, 0.15)',
                              border: '1px solid var(--accent-cyan)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.8rem',
                              color: 'var(--accent-cyan)',
                              fontWeight: 'bold'
                            }}>
                              1
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                              {msg.msgType === 'video' ? 'Video' : 'Photo'} {isMe ? '(Sent)' : '(Tap to View)'}
                            </div>
                          </div>
                        )
                      ) : msg.msgType === 'image' && msg.mediaData && !msg.deletedEveryone ? (
                        <div style={{ position: 'relative', width: '240px', height: '200px', overflow: 'hidden', borderRadius: '12px' }}>
                          <img 
                            src={msg.mediaData} 
                            alt="E2EE media" 
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }} 
                          />
                        </div>
                      ) : msg.msgType === 'video' && msg.mediaData && !msg.deletedEveryone ? (
                        <div style={{ position: 'relative', width: '240px', height: '200px', overflow: 'hidden', borderRadius: '12px' }}>
                          <video 
                            src={msg.mediaData} 
                            controls
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover'
                            }} 
                          />
                        </div>
                      ) : (
                        <div>{msg.text}</div>
                      )}
                      
                      {msgTranslation && !msg.deletedEveryone && (
                        <div style={{
                          fontSize: '0.85rem',
                          color: 'var(--accent-green)',
                          marginTop: '6px',
                          borderTop: '1px solid rgba(255,255,255,0.08)',
                          paddingTop: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <Languages size={12} />
                          <span>{msgTranslation}</span>
                        </div>
                      )}

                      {!isMe && translateTarget !== 'none' && !msgTranslation && msg.msgType === 'text' && !msg.deletedEveryone && (
                        <button
                          onClick={() => handleTranslateMessage(msg.id, msg.text)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: activeTheme.color,
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            padding: '4px 0 0 0',
                            textDecoration: 'underline',
                            display: 'block'
                          }}
                          disabled={translatingId === msg.id}
                        >
                          {translatingId === msg.id ? 'Translating...' : 'Translate'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    marginTop: '4px',
                    fontSize: '0.65rem',
                    color: 'var(--text-muted)'
                  }}>
                    <span>
                      {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                    {isMe && renderStatusTicks(msg.status)}

                    {msg.expires_at && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#ff1744', fontWeight: 'bold' }}>
                        <Clock size={10} />
                        <span>
                          {(() => {
                            const remaining = Math.max(0, Math.ceil((new Date(msg.expires_at).getTime() - Date.now()) / 1000));
                            if (remaining <= 60) return `${remaining}s`;
                            if (remaining <= 3600) return `${Math.ceil(remaining / 60)}m`;
                            if (remaining <= 86400) return `${Math.ceil(remaining / 3600)}h`;
                            return `${Math.ceil(remaining / 86400)}d`;
                          })()}
                        </span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 4. Multi-select Actions Floating Overlay bar */}
      {selectMode && selectedMessageIds.size > 0 && (
        <div style={{
          position: 'absolute',
          bottom: '80px',
          left: '20px',
          right: '20px',
          background: 'rgba(18, 22, 35, 0.95)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--accent-cyan)',
          boxShadow: 'var(--shadow-glow)',
          borderRadius: '16px',
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 40,
          animation: 'fadeIn 0.2s ease'
        }}>
          <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: '500' }}>
            {selectedMessageIds.size} messages selected
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              className="btn-danger" 
              onClick={handleDeleteSelected}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Delete Selected
            </button>
            <button 
              className="btn-secondary" 
              onClick={() => setSelectedMessageIds(new Set())}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <form onSubmit={handleSendText} style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'center',
        borderTop: '1px solid var(--border-color)',
        paddingTop: '15px',
        zIndex: 20
      }}>
        <button
          type="button"
          className="btn-secondary"
          style={{ padding: '12px', borderRadius: '12px' }}
          onClick={() => fileInputRef.current?.click()}
          title="Share Encrypted Photo/Video"
          disabled={selectMode}
        >
          <Paperclip size={18} />
        </button>

        <button
          type="button"
          onClick={() => setViewOnceEnabled(!viewOnceEnabled)}
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: viewOnceEnabled ? 'rgba(255, 23, 68, 0.15)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${viewOnceEnabled ? '#ff1744' : 'var(--border-color)'}`,
            color: viewOnceEnabled ? '#ff1744' : 'var(--text-secondary)',
            fontSize: '0.8rem',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
          title="Toggle View Once for the next media upload"
          disabled={selectMode}
        >
          👁️ {viewOnceEnabled ? 'View Once Active' : 'View Once'}
        </button>

        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept="image/*,video/*"
          onChange={handlePhotoSelect}
        />

        <input
          type="text"
          placeholder={selectMode ? "Exit Select Mode to type message..." : "Type E2EE private message..."}
          className="input-field"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={selectMode}
        />
        <button type="submit" className="btn-primary" style={{ padding: '12px', background: `linear-gradient(135deg, ${activeTheme.color}, #00b0ff)` }} disabled={selectMode}>
          <Send size={18} />
        </button>
      </form>

      {activeViewerMedia && (
        <MediaViewer
          src={activeViewerMedia.src}
          type={activeViewerMedia.type}
          onClose={() => {
            const msgId = activeViewerMedia.msgId;
            setActiveViewerMedia(null);
            if (onMediaOpened) {
              onMediaOpened(chat.user_id, msgId);
            }
          }}
        />
      )}

      {showLockConfig && (
        <ChatLockModal
          chat={chat}
          mode={lockMode}
          myPhone={myPhone}
          onClose={() => setShowLockConfig(false)}
          onSave={(settings) => {
            onSetChatLockSettings(chat.user_id, settings);
            setShowLockConfig(false);
          }}
        />
      )}
    </div>
  );
}
