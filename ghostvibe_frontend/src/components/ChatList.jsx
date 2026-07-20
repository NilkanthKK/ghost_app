import { useState, useEffect, useRef } from 'react';
import { MessageSquarePlus, Trash2, LogOut, Search, Plus, X, User, Users, Volume2, VolumeX, Settings } from 'lucide-react';
import { getSoundEnabled, setSoundEnabled, playSentChime } from '../utils/audio';
import { getRecord } from '../utils/indexed_db';
import { hashPin } from '../utils/chat_lock';
import { validateFileUpload } from '../utils/validators';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';

export default function ChatList({ 
  chats, 
  activeChatId, 
  onSelectChat, 
  onAddChat, 
  onDeleteContact,
  onLogout,
  presence = {},
  statuses = {},
  onPostStatus,
  myUserId,
  connectionState,
  myPhone,
  onOpenSettings,
  lastSeenEnabled,
  unlockedChatIds = new Set(),
  onStatusViewed,
  onUnlockAllChats,
  encryptContactNames,
  onCreateGroup
}) {
  const [newPhone, setNewPhone] = useState('');
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);



  const [showLockedFolderUnlockModal, setShowLockedFolderUnlockModal] = useState(false);
  const [lockedFolderPin, setLockedFolderPin] = useState('');
  const [lockedFolderError, setLockedFolderError] = useState('');

  const handleLockedFolderUnlockSubmit = async (e) => {
    if (e) e.preventDefault();
    setLockedFolderError('');
    const hashed = await hashPin(lockedFolderPin);
    
    // Check if the pin matches any locked chats
    const lockedChats = localChats.filter(c => c.locked);
    if (lockedChats.length === 0) {
      setShowLockedFolderUnlockModal(false);
      setLockedFolderPin('');
      setSearchQuery('');
      return;
    }

    const matches = lockedChats.some(c => c.pin_hash === hashed);
    if (matches) {
      const lockedIds = lockedChats.map(c => c.user_id);
      if (onUnlockAllChats) {
        onUnlockAllChats(lockedIds);
      }
      setShowLockedFolderUnlockModal(false);
      setLockedFolderPin('');
      setSearchQuery('');
    } else {
      setLockedFolderError('Incorrect PIN.');
    }
  };
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [soundOn, setSoundOn] = useState(() => getSoundEnabled());
  const [localChats, setLocalChats] = useState(chats || []);
  const [prevChats, setPrevChats] = useState(chats);

  if (chats !== prevChats) {
    setPrevChats(chats);
    setLocalChats(chats || []);
  }

  useEffect(() => {
    if (localChats && localChats.length > 0) {
      return;
    }

    async function loadData() {
      try {
        const key = localStorage.getItem('gv_private_key') || localStorage.getItem('gv_phone_number') || 'ghostvibe_local_secure_fallback_key';
        const storeName = 'messages';
        const recordId = `gv_chats_${myUserId}`;
        
        const dbChats = await getRecord(storeName, recordId, key);
        if (dbChats && dbChats.length > 0) {
          setLocalChats(dbChats);
          return;
        }
      } catch (err) {
        console.warn("ChatList parallel DB load failed:", err);
      }

      try {
        const localVal = localStorage.getItem(`gv_chats_${myUserId}`);
        if (localVal) {
          setLocalChats(JSON.parse(localVal));
        }
      } catch (err) {
        console.warn("gv_chats load error:", err);
      }
    }
    
    if (myUserId) {
      loadData();
    }
  }, [myUserId, localChats]);

  // Status view modal states
  const [viewingStatusUser, setViewingStatusUser] = useState(null); // userId | null
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const [storyProgress, setStoryProgress] = useState(0);

  const fileInputRef = useRef(null);
  const progressIntervalRef = useRef(null);

  // Track status viewed updates
  useEffect(() => {
    if (viewingStatusUser && viewingStatusUser !== myUserId) {
      const storiesList = statuses[viewingStatusUser] || [];
      const currentStory = storiesList[activeStoryIndex];
      if (currentStory && onStatusViewed) {
        onStatusViewed(viewingStatusUser, currentStory.id);
      }
    }
  }, [viewingStatusUser, activeStoryIndex, statuses, onStatusViewed, myUserId]);

  // 1. Generate unique deterministic gradient avatar based on phone number checksum
  const getDeterministicGradient = (phone) => {
    const colors = [
      ['#00e5ff', '#00b0ff'], // Neon Cyan/Blue
      ['#39ff14', '#00e676'], // Neon Green
      ['#d500f9', '#f50057'], // Neon Purple/Pink
      ['#ff9100', '#ff3d00'], // Bright Orange/Red
      ['#00e5ff', '#d500f9'], // Cyan to Pink gradient
      ['#39ff14', '#00e5ff']  // Green to Cyan gradient
    ];
    const sum = String(phone).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const idx = sum % colors.length;
    return `linear-gradient(135deg, ${colors[idx][0]}, ${colors[idx][1]})`;
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) {
      playSentChime(); // Confirmation chime feedback
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    let phoneVal = newPhone.trim().replace(/[\s-()]/g, '');
    if (!phoneVal) return;

    if (!phoneVal.startsWith('+')) {
      let dialCode = '+91';
      if (myPhone && myPhone.startsWith('+')) {
        const prefixes = ['+91', '+1', '+44', '+971', '+61', '+49', '+65'];
        const matched = prefixes.find(p => myPhone.startsWith(p));
        if (matched) {
          dialCode = matched;
        }
      }
      
      const dialDigits = dialCode.replace('+', '');
      if (phoneVal.startsWith(dialDigits) && phoneVal.length > dialDigits.length + 5) {
        phoneVal = '+' + phoneVal;
      } else {
        phoneVal = dialCode + phoneVal;
      }
    }
    
    setLoading(true);
    setError('');

    // Self addition check
    if (phoneVal === myPhone) {
      setError('You cannot add your own number as a contact.');
      setLoading(false);
      return;
    }

    const targetUrl = `${apiBaseUrl}/api/auth/pre-key-bundle/${phoneVal}`;

    try {
      const res = await fetch(targetUrl);
      if (!res.ok) {
        throw new Error('User not registered on GhostVibe network.');
      }
      
      const bundle = await res.json();
      
      onAddChat({
        phone_number: phoneVal,
        name: newName.trim() || phoneVal,
        user_id: bundle.user_id,
        username_hash: bundle.username_hash,
        identity_key_public: bundle.identity_key_public,
        one_time_pre_key: bundle.one_time_pre_key,
        messages: []
      });

      setNewPhone('');
      setNewName('');
      setShowAdd(false);
    } catch (err) {
      setError(err.message || 'Error adding contact.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroupSubmit = (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    if (onCreateGroup) {
      onCreateGroup(groupName.trim(), groupDesc.trim(), selectedGroupMembers);
    }
    setShowCreateGroup(false);
    setGroupName('');
    setGroupDesc('');
    setSelectedGroupMembers([]);
  };

  const formatLastActive = (isoString) => {
    if (!isoString) return 'Offline';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now - date;
      const diffMin = Math.floor(diffMs / 60000);
      
      if (diffMin < 1) return 'Active just now';
      if (diffMin < 60) return `Active ${diffMin}m ago`;
      
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `Active ${diffHours}h ago`;
      
      return `Active ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
    } catch {
      return 'Offline';
    }
  };

  // Status Stories Posting Handler
  const handleStatusUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const fileErr = validateFileUpload(file, 2 * 1024 * 1024);
    if (fileErr) {
      alert(fileErr);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      onPostStatus(reader.result, "Go Ghost, Keep the Vibe");
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // 2. Story Viewer Progress timer logic
  useEffect(() => {
    if (viewingStatusUser) {
      setTimeout(() => setStoryProgress(0), 0);
      const storiesList = statuses[viewingStatusUser] || [];
      if (storiesList.length === 0) {
        setTimeout(() => setViewingStatusUser(null), 0);
        return;
      }

      // Interval to increment progress bar (5000ms total, increments every 50ms = 100 steps)
      progressIntervalRef.current = setInterval(() => {
        setStoryProgress(prev => {
          if (prev >= 100) {
            // Move to next story or close if last
            if (activeStoryIndex < storiesList.length - 1) {
              setActiveStoryIndex(idx => idx + 1);
              return 0;
            } else {
              setViewingStatusUser(null);
              return 100;
            }
          }
          return prev + 1;
        });
      }, 50);
    }

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [viewingStatusUser, activeStoryIndex, statuses]);

  const handleNextStory = () => {
    const storiesList = statuses[viewingStatusUser] || [];
    if (activeStoryIndex < storiesList.length - 1) {
      setActiveStoryIndex(activeStoryIndex + 1);
      setStoryProgress(0);
    } else {
      setViewingStatusUser(null);
    }
  };

  const handlePrevStory = () => {
    if (activeStoryIndex > 0) {
      setActiveStoryIndex(activeStoryIndex - 1);
      setStoryProgress(0);
    }
  };

  const openStatusViewer = (userId) => {
    setViewingStatusUser(userId);
    setActiveStoryIndex(0);
    setStoryProgress(0);
  };

  // Filter contacts by search query
  const filteredChats = localChats.filter(chat => {
    const isLocked = chat.locked && !unlockedChatIds.has(chat.user_id);
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      if (isLocked) return false;
      const nameMatch = chat.name ? chat.name.toLowerCase().includes(query) : false;
      const phoneMatch = chat.phone_number ? chat.phone_number.includes(query) : false;
      return nameMatch || phoneMatch;
    }
    return true;
  });

  // Extract contact info by user_id
  const getContactInfo = (uId) => {
    if (uId === myUserId) return { name: "My Status", phone: "Me" };
    const contact = localChats.find(c => c.user_id === uId);
    return contact ? { name: contact.name, phone: contact.phone_number } : { name: "Secure Node", phone: "Node" };
  };

  const renderConnectionBadge = () => {
    let color = 'var(--text-muted)';
    let label = 'Disconnected';
    let pulse = '';

    if (connectionState === 'connected') {
      color = 'var(--accent-green)';
      label = 'Secure Network';
      pulse = 'pulse-glow';
    } else if (connectionState === 'connecting') {
      color = '#ffb300';
      label = 'Connecting...';
      pulse = 'pulse-glow';
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color, transition: 'all 0.3s ease' }}>
        <div className={pulse} style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: color,
          boxShadow: connectionState === 'connected' ? '0 0 10px var(--accent-green)' : (connectionState === 'connecting' ? '0 0 10px #ffb300' : 'none'),
          transition: 'all 0.3s ease'
        }} />
        <span style={{ fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
    );
  };

  return (
    <div className="glass-panel" style={{
      width: '380px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      padding: '20px',
      gap: '15px'
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '10px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h2 style={{ fontSize: '1.4rem', color: 'var(--accent-cyan)', margin: 0 }}>Vibes</h2>
          {renderConnectionBadge()}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button 
            className="btn-secondary" 
            style={{ 
              width: '32px',
              height: '32px',
              padding: 0, 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%', 
              color: soundOn ? 'var(--accent-cyan)' : 'var(--text-muted)',
              borderColor: soundOn ? 'rgba(0, 229, 255, 0.2)' : 'var(--border-color)'
            }}
            onClick={handleToggleSound}
            title={soundOn ? "Mute Sounds" : "Unmute Sounds"}
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button 
            className="btn-secondary" 
            style={{ 
              width: '32px',
              height: '32px',
              padding: 0, 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%' 
            }}
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings size={16} />
          </button>
          <button 
            className="btn-secondary" 
            style={{ 
              width: '32px',
              height: '32px',
              padding: 0, 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%' 
            }}
            onClick={() => {
              setShowCreateGroup(!showCreateGroup);
              setShowAdd(false);
            }}
            title="Create Group Chat"
          >
            <Users size={16} />
          </button>
          <button 
            className="btn-secondary" 
            style={{ 
              width: '32px',
              height: '32px',
              padding: 0, 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%' 
            }}
            onClick={() => {
              setShowAdd(!showAdd);
              setShowCreateGroup(false);
            }}
            title="Start Secure Chat"
          >
            <MessageSquarePlus size={16} />
          </button>
          <button 
            className="btn-danger" 
            style={{ 
              width: '32px',
              height: '32px',
              padding: 0, 
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%' 
            }}
            onClick={() => {
              if (window.confirm("Are you sure you want to disconnect this device? All local chat logs and security keys will be permanently deleted from this browser.")) {
                onLogout();
              }
            }}
            title="Disconnect Device"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      {/* Add secure chat prompt */}
      {showAdd && (
        <form onSubmit={handleAddSubmit} style={{
          background: 'rgba(0,0,0,0.2)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Contact Name
            </label>
            <input
              type="text"
              placeholder="Name Here"
              className="input-field"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Phone Number
            </label>
            <input
              type="tel"
              placeholder="Enter mobile number (e.g. +91 9876543210)..."
              className="input-field"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Securing...' : 'Add Secure Vibe'}
            </button>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ padding: '10px', fontSize: '0.85rem' }} 
              onClick={() => {
                setShowAdd(false);
                setError('');
              }}
            >
              Cancel
            </button>
          </div>
          {error && <span style={{ color: '#ff5252', fontSize: '0.75rem', marginTop: '2px' }}>{error}</span>}
        </form>
      )}

      {/* Create group chat prompt */}
      {showCreateGroup && (
        <form onSubmit={handleCreateGroupSubmit} style={{
          background: 'rgba(0,0,0,0.2)',
          padding: '16px',
          borderRadius: '12px',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Group Name
            </label>
            <input
              type="text"
              placeholder="Enter group name..."
              className="input-field"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Description
            </label>
            <input
              type="text"
              placeholder="Enter group description..."
              className="input-field"
              value={groupDesc}
              onChange={(e) => setGroupDesc(e.target.value)}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Select Members
            </label>
            <div style={{
              maxHeight: '100px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              background: 'rgba(0,0,0,0.3)',
              padding: '8px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)'
            }}>
              {localChats.filter(c => !c.isGroup).map(contact => {
                const isSelected = selectedGroupMembers.includes(contact.user_id);
                return (
                  <label key={contact.user_id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {
                        if (isSelected) {
                          setSelectedGroupMembers(prev => prev.filter(id => id !== contact.user_id));
                        } else {
                          setSelectedGroupMembers(prev => [...prev, contact.user_id]);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    {contact.name || contact.phone_number}
                  </label>
                );
              })}
              {localChats.filter(c => !c.isGroup).length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No contacts available.</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1, padding: '10px', fontSize: '0.85rem', justifyContent: 'center' }}>
              Create Group
            </button>
            <button 
              type="button" 
              className="btn-secondary" 
              style={{ padding: '10px', fontSize: '0.85rem' }} 
              onClick={() => {
                setShowCreateGroup(false);
                setGroupName('');
                setGroupDesc('');
                setSelectedGroupMembers([]);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* 3. Status/Stories Tray Bar */}
      <div className="status-tray" style={{
        display: 'flex',
        gap: '12px',
        overflowX: 'auto',
        paddingBottom: '8px',
        borderBottom: '1px solid var(--border-color)'
      }}>
        {/* My Status Update circle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px', cursor: 'pointer' }}>
          <div 
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '50%',
              background: getDeterministicGradient(myUserId),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              boxShadow: statuses[myUserId] ? '0 0 0 2px var(--accent-cyan)' : 'none'
            }}
            onClick={() => statuses[myUserId] ? openStatusViewer(myUserId) : fileInputRef.current?.click()}
          >
            <User size={20} style={{ color: '#fff' }} />
            {/* Add Status + Indicator overlay */}
            <div 
              style={{
                position: 'absolute',
                bottom: '-2px',
                right: '-2px',
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: 'var(--accent-cyan)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-main)'
              }}
              onClick={(e) => {
                if (statuses[myUserId]) {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }
              }}
            >
              <Plus size={12} style={{ color: '#000', fontWeight: 'bold' }} />
            </div>
          </div>
          <span style={{ fontSize: '0.7rem', marginTop: '6px', color: 'var(--text-secondary)' }}>My Status</span>
          <input 
            type="file" 
            ref={fileInputRef} 
            style={{ display: 'none' }} 
            accept="image/*"
            onChange={handleStatusUpload}
          />
        </div>

        {/* Contacts active stories */}
        {Object.keys(statuses).map(uId => {
          if (uId === myUserId) return null;
          const stories = statuses[uId] || [];
          if (stories.length === 0) return null;
          const contactInfo = getContactInfo(uId);

          return (
            <div 
              key={uId} 
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px', cursor: 'pointer' }}
              onClick={() => openStatusViewer(uId)}
            >
              <div 
                className="status-ring-unseen"
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  padding: '3px',
                  background: 'var(--bg-main)',
                  border: '2px solid var(--accent-green)',
                  boxShadow: '0 0 8px rgba(57, 255, 20, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  background: getDeterministicGradient(contactInfo.phone),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff'
                }}>
                  <User size={18} />
                </div>
              </div>
              <span style={{ 
                fontSize: '0.7rem', 
                marginTop: '6px', 
                color: 'var(--text-secondary)',
                maxWidth: '65px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {contactInfo.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Search Bar */}
      <div style={{ position: 'relative' }}>
        <Search size={18} style={{ position: 'absolute', left: '14px', top: '13px', color: 'var(--text-muted)' }} />
        <input
          type="text"
          placeholder="Search by name or phone..."
          className="input-field"
          style={{ paddingLeft: '45px', fontSize: '0.9rem' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Active Chats List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {['lock', 'locked', 'locked chats', 'password', 'pin'].includes(searchQuery.trim().toLowerCase()) && (
          <div 
            className="chat-item" 
            onClick={() => setShowLockedFolderUnlockModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              cursor: 'pointer',
              background: 'rgba(255, 255, 255, 0.02)'
            }}
          >
            <div className="avatar" style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'rgba(0, 229, 255, 0.1)',
              border: '1px solid var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '12px',
              color: 'var(--accent-cyan)'
            }}>
              🔒
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: 0, color: '#fff', fontSize: '0.95rem' }}>Locked Chats</h4>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Tap to unlock all locked chats</p>
            </div>
          </div>
        )}

        {filteredChats.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            marginTop: '40px',
            fontSize: '0.9rem',
            padding: '0 20px'
          }}>
            {searchQuery ? 'No contacts match your search.' : 'No active connections. Click the message icon above to start a secure conversation.'}
          </div>
        ) : (
          filteredChats.map(chat => {
            const isCurrentlyLocked = chat.locked && !unlockedChatIds.has(chat.user_id);
            const lastMsg = chat.messages[chat.messages.length - 1];
            const chatPresence = presence[chat.user_id] || { status: 'offline', last_active: null };
            const isOnline = chatPresence.status === 'online';
            const unreadCount = chat.messages.filter(m => m.sender === 'peer' && m.status !== 'read').length;

            return (
              <div 
                key={chat.user_id} 
                className={`chat-item ${activeChatId === chat.user_id ? 'active' : ''}`}
                onClick={() => onSelectChat(chat.user_id)}
                style={{ position: 'relative' }}
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: getDeterministicGradient(chat.phone_number || chat.user_id),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: '12px',
                  color: '#fff',
                  position: 'relative'
                }}>
                  {chat.isGroup ? <Users size={22} /> : <User size={22} />}
                  {isOnline && lastSeenEnabled && !isCurrentlyLocked && !chat.isGroup && (
                    <div className="pulse-glow" style={{
                      position: 'absolute',
                      bottom: '0',
                      right: '0',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: 'var(--accent-green)',
                      border: '2px solid #0c0f1d',
                      boxShadow: '0 0 8px var(--accent-green)'
                    }} />
                  )}
                </div>
                
                <div style={{ flex: 1, overflow: 'hidden', marginRight: '10px' }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '2px'
                  }}>
                    <span style={{ 
                      fontSize: '0.95rem', 
                      fontWeight: '600',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      maxWidth: '150px',
                      color: '#fff'
                    }}>
                      {isCurrentlyLocked 
                        ? "🔒 Locked Chat" 
                        : (encryptContactNames
                          ? (chat.isGroup ? `🔒 Group-[${chat.user_id.substring(0, 6)}]` : `🔒 Node-[${chat.user_id.substring(0, 6)}]`)
                          : (chat.isGroup ? `👥 ${chat.name}` : (chat.name ? chat.name : chat.phone_number)))}
                    </span>
                    <span style={{ 
                      fontSize: '0.65rem', 
                      color: chat.isGroup ? 'var(--accent-cyan)' : (isOnline ? 'var(--accent-green)' : 'var(--text-muted)') 
                    }}>
                      {!isCurrentlyLocked && (
                        chat.isGroup 
                          ? `${chat.members?.length || 0} members`
                          : (isOnline && lastSeenEnabled ? 'Online' : (lastSeenEnabled ? formatLastActive(chatPresence.last_active) : 'Offline'))
                      )}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <div style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      textOverflow: 'ellipsis',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      flex: 1,
                      marginRight: '8px'
                    }}>
                      {isCurrentlyLocked ? "" : (lastMsg ? (
                        lastMsg.msgType === 'image' ? '📷 Encrypted Photo' : (lastMsg.msgType === 'video' ? '📹 Encrypted Video' : lastMsg.text)
                      ) : (
                        'Secure session established.'
                      ))}
                    </div>
                    {unreadCount > 0 && !isCurrentlyLocked && (
                      <span style={{
                        background: 'var(--accent-cyan)',
                        color: '#000',
                        fontSize: '0.7rem',
                        fontWeight: '700',
                        padding: '2px 6px',
                        borderRadius: '10px',
                        minWidth: '18px',
                        textAlign: 'center',
                        boxShadow: '0 0 10px rgba(0, 229, 255, 0.4)'
                      }}>
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                    {!isCurrentlyLocked && (chat.name && chat.name !== chat.phone_number 
                      ? `Cipher ID: ENC[${chat.username_hash ? chat.username_hash.substring(0, 14) : chat.user_id.substring(0, 14)}...]`
                      : `Node Hash: ${chat.user_id.substring(0, 14)}...`)}
                  </div>
                </div>

                {/* 4. Delete Contact icon button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // Avoid triggering selection
                    onDeleteContact(chat.user_id);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 23, 68, 0.4)',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    position: 'absolute',
                    right: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)'
                  }}
                  className="delete-contact-btn"
                  title="Remove Secure Vibe"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Instagram/WhatsApp stories status viewer fullscreen modal */}
      {viewingStatusUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#000',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {/* Top Progress bar indicators */}
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '20px',
            right: '20px',
            display: 'flex',
            gap: '6px',
            zIndex: 10010
          }}>
            {(statuses[viewingStatusUser] || []).map((story, idx) => {
              let width = '0%';
              if (idx < activeStoryIndex) width = '100%';
              else if (idx === activeStoryIndex) width = `${storyProgress}%`;

              return (
                <div key={story.id} style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.2)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.05s linear' }} />
                </div>
              );
            })}
          </div>

          {/* Story Profile details header */}
          <div style={{
            position: 'absolute',
            top: '40px',
            left: '20px',
            right: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10010
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: getDeterministicGradient(getContactInfo(viewingStatusUser).phone),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: '0.8rem',
                fontWeight: 'bold'
              }}>
                <User size={16} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ color: '#fff', fontWeight: '600', fontSize: '0.9rem' }}>{getContactInfo(viewingStatusUser).name}</span>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.7rem' }}>
                  {new Date((statuses[viewingStatusUser] || [])[activeStoryIndex]?.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
            
            <button 
              onClick={() => setViewingStatusUser(null)}
              style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', padding: '6px' }}
            >
              <X size={24} />
            </button>
          </div>

          {/* Story Image container */}
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {/* Left Tap target navigation */}
            <div 
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', cursor: 'w-resize', zIndex: 10005 }}
              onClick={handlePrevStory}
            />
            {/* Right Tap target navigation */}
            <div 
              style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%', cursor: 'e-resize', zIndex: 10005 }}
              onClick={handleNextStory}
            />

            <img 
              src={(statuses[viewingStatusUser] || [])[activeStoryIndex]?.mediaData} 
              alt="Story Status"
              style={{ maxWidth: '100%', maxHeight: '80%', objectFit: 'contain', zIndex: 10002 }}
            />
          </div>

          {/* Caption Overlay */}
          <div style={{
            position: 'absolute',
            bottom: '60px',
            left: '20px',
            right: '20px',
            textAlign: 'center',
            color: '#fff',
            fontSize: '1rem',
            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
            zIndex: 10010
          }}>
            {(statuses[viewingStatusUser] || [])[activeStoryIndex]?.caption}
          </div>

          {/* Own Status Viewers List overlay at bottom */}
          {viewingStatusUser === myUserId && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(18, 22, 35, 0.95)',
              border: '1px solid var(--accent-cyan)',
              borderRadius: '12px',
              padding: '12px 20px',
              width: '80%',
              maxWidth: '300px',
              zIndex: 10020,
              boxShadow: 'var(--shadow-glow)',
              textAlign: 'left'
            }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px' }}>
                👁️ Viewers ({(statuses[myUserId] || [])[activeStoryIndex]?.viewers?.length || 0})
              </span>
              <div style={{ maxHeight: '80px', overflowY: 'auto', fontSize: '0.75rem', color: '#fff' }}>
                {((statuses[myUserId] || [])[activeStoryIndex]?.viewers || []).map(viewerId => {
                  const info = getContactInfo(viewerId);
                  return (
                    <div key={viewerId} style={{ padding: '2px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {info.name}
                    </div>
                  );
                })}
                {(!((statuses[myUserId] || [])[activeStoryIndex]?.viewers || []).length) && (
                  <span style={{ color: 'var(--text-muted)' }}>No views yet</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      {/* 6. Locked Folder PIN Verification Modal */}
      {showLockedFolderUnlockModal && (
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
            maxWidth: '360px',
            padding: '30px',
            border: '1px solid var(--accent-cyan)',
            boxShadow: 'var(--shadow-glow)',
            borderRadius: '16px',
            background: 'rgba(18, 22, 35, 0.95)',
            color: '#fff',
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <h3 style={{ margin: 0, color: 'var(--accent-cyan)' }}>Unlock Locked Chats</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Enter your secure lock PIN to access all locked conversations.
            </p>
            <form onSubmit={handleLockedFolderUnlockSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {lockedFolderError && (
                <div style={{ color: '#ff1744', fontSize: '0.8rem', background: 'rgba(255,23,68,0.08)', padding: '6px 12px', borderRadius: '6px' }}>
                  ⚠️ {lockedFolderError}
                </div>
              )}
              <input
                type="password"
                placeholder="Enter Lock PIN"
                className="input-field"
                value={lockedFolderPin}
                onChange={(e) => setLockedFolderPin(e.target.value)}
                autoFocus
                required
              />
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                <button type="submit" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>
                  Unlock
                </button>
                <button 
                  type="button" 
                  className="btn-secondary" 
                  style={{ flex: 1, justifyContent: 'center' }} 
                  onClick={() => {
                    setShowLockedFolderUnlockModal(false);
                    setLockedFolderPin('');
                    setLockedFolderError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
