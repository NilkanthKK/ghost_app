import { useState, useEffect, useRef } from 'react';
import Auth from './components/Auth';
import ChatList from './components/ChatList';
import ChatRoom from './components/ChatRoom';
import VideoCall from './components/VideoCall';
import SettingsModal from './components/SettingsModal';
import { ShieldCheck, PhoneCall, PhoneOff } from 'lucide-react';
import { decryptMessageLocal } from './utils/signal_crypto';
import { playSentChime, playReceivedChime, playVibeChime } from './utils/audio';
import { addToQueue, processQueue, handleAck } from './utils/offline_manager';
import { FEATURE_FLAGS } from './utils/flags';
import { initDatabase, saveRecord, getRecord, clearStore, encryptData, decryptData } from './utils/indexed_db';
import ChatLockModal, { hashPin } from './components/ChatLockModal';
import { validateUsername, validateBio, validateFileUpload } from './utils/validators';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';
const wsUrl = import.meta.env.VITE_WS_URL || '127.0.0.1:8080';

export default function App() {
  const safeGetItem = (key, fallback = '') => {
    try {
      return localStorage.getItem(key) || fallback;
    } catch (e) {
      console.warn(`Failed to read ${key} from localStorage:`, e);
      return fallback;
    }
  };

  const [token, setToken] = useState(() => safeGetItem('gv_token'));
  const [userId, setUserId] = useState(() => safeGetItem('gv_user_id'));
  const [myPhone, setMyPhone] = useState(() => safeGetItem('gv_phone_number'));
  const [reconnectCounter, setReconnectCounter] = useState(0);
  
  // Chats & Contacts
  // format: [{ user_id, phone_number, name, username_hash, identity_key_public, one_time_pre_key, messages: [...] }]
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [unlockedChatIds, setUnlockedChatIds] = useState(new Set());
  const lockTimersRef = useRef({});

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setUnlockedChatIds(new Set());
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);
  
  // Connection State: 'connecting' | 'connected' | 'disconnected'
  const [connectionState, setConnectionState] = useState('disconnected');
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Presence: { [userId]: { status: 'online'|'offline', last_active: ISOString } }
  const [presence, setPresence] = useState({});

  // Statuses (Stories): { [userId]: [{ id, mediaData, caption, timestamp, expiresAt }] }
  const [statuses, setStatuses] = useState({});

  // Vibe levels per chat: { [chatId]: 'chill' | 'electric' | 'ghost' | 'party' }
  const [chatVibes, setChatVibes] = useState(() => {
    try {
      const saved = safeGetItem(`gv_vibes_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed && typeof parsed === 'object' ? parsed : {};
      }
      return {};
    } catch {
      return {};
    }
  });

  // Vibe burst notification overlay: 'chill' | 'electric' | 'ghost' | 'party' | null
  const [vibeBurst, setVibeBurst] = useState(null);

  // Call States
  const [callSession, setCallSession] = useState(null); // { peerId, role, phone_number, active, callType }
  const [incomingCall, setIncomingCall] = useState(null); // { peerId, phone_number, offerSdp, callType }
  const [callTypeSelectionTarget, setCallTypeSelectionTarget] = useState(null); // { peerId, contact }
  const [myProfile, setMyProfile] = useState(() => {
    try {
      const p = localStorage.getItem('gv_my_profile');
      return p ? JSON.parse(p) : { username: '', avatar: '', bio: '' };
    } catch {
      return { username: '', avatar: '', bio: '' };
    }
  });
  const [profileSetupAvatar, setProfileSetupAvatar] = useState('');
  const [setupError, setSetupError] = useState('');
  const [linkedDevices, setLinkedDevices] = useState([]);

  // Reactive state for WebSocket passed to child components
  const [currentSocket, setCurrentSocket] = useState(null);

  // Settings & Theme States
  const [globalTheme, setGlobalTheme] = useState(() => safeGetItem('gv_global_theme', 'chill'));
  const [lastSeenEnabled, setLastSeenEnabled] = useState(() => safeGetItem('gv_last_seen_enabled', 'true') !== 'false');
  const [defaultTtl, setDefaultTtl] = useState(() => {
    const saved = safeGetItem('gv_default_ttl');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prefsLoadedRef = useRef(false);

  const syncPreferencesToBackend = async (theme, lastSeen, ttl, profileData) => {
    if (!token || !prefsLoadedRef.current) return;
    try {
      const activeProfile = profileData || myProfile;
      const prefs = { theme, lastSeen, ttl, profile: activeProfile };
      const encKey = getStorageKey();
      const encryptedPrefs = await encryptData(prefs, encKey);
      await fetch(`${apiBaseUrl}/api/user/preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          encrypted_prefs: encryptedPrefs,
          username: activeProfile?.username || '',
          full_name: activeProfile?.username || '',
          email: localStorage.getItem('gv_my_email') || ''
        })
      });
    } catch (err) {
      console.warn("Failed to backup preferences to backend:", err);
    }
  };

  const loadPreferencesFromBackend = async (userToken) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/user/preferences`, {
        headers: {
          'Authorization': `Bearer ${userToken || token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const encryptedPrefs = data.encrypted_prefs;
        if (encryptedPrefs) {
          const encKey = getStorageKey();
          const decrypted = await decryptData(encryptedPrefs, encKey);
          if (decrypted) {
            if (decrypted.theme) setGlobalTheme(decrypted.theme);
            if (decrypted.lastSeen !== undefined) setLastSeenEnabled(decrypted.lastSeen === 'true' || decrypted.lastSeen === true);
            if (decrypted.ttl !== undefined) setDefaultTtl(parseInt(decrypted.ttl, 10));
            if (decrypted.profile) {
              setMyProfile(decrypted.profile);
              localStorage.setItem('gv_my_profile', JSON.stringify(decrypted.profile));
            }
          }
        }
      }
    } catch (err) {
      console.warn("Failed to load preferences from backend:", err);
    } finally {
      prefsLoadedRef.current = true;
    }
  };

  // Fetch active linked devices on Settings open
  useEffect(() => {
    if (settingsOpen && token) {
      fetch(`${apiBaseUrl}/api/v1/devices/list`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      .then(res => res.ok ? res.json() : [])
      .then(data => setLinkedDevices(data))
      .catch(err => console.warn("Failed to fetch linked devices:", err));
    }
  }, [settingsOpen, token]);

  const handleRevokeDevice = async (deviceId) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/v1/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setLinkedDevices(prev => prev.filter(d => d.device_id !== deviceId));
      }
    } catch (err) {
      console.warn("Failed to revoke device:", err);
    }
  };

  // Sync global theme to body class
  useEffect(() => {
    document.body.className = `theme-${globalTheme}`;
    saveDualStorage('gv_global_theme', globalTheme);
    syncPreferencesToBackend(globalTheme, lastSeenEnabled, defaultTtl);
  }, [globalTheme]);

  // Sync last seen privacy to localStorage
  useEffect(() => {
    saveDualStorage('gv_last_seen_enabled', lastSeenEnabled ? 'true' : 'false');
    syncPreferencesToBackend(globalTheme, lastSeenEnabled, defaultTtl);
  }, [lastSeenEnabled]);

  // Sync default TTL to storage and backend
  useEffect(() => {
    saveDualStorage('gv_default_ttl', String(defaultTtl));
    syncPreferencesToBackend(globalTheme, lastSeenEnabled, defaultTtl);
  }, [defaultTtl]);

  // References to bypass React stale closures in WebSocket event listeners
  const chatsRef = useRef([]);
  const activeChatIdRef = useRef(null);
  const wsRef = useRef(null);

  // Sync refs with state on updates
  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Sync vibes to local storage
  useEffect(() => {
    if (userId) {
      saveDualStorage(`gv_vibes_${userId}`, chatVibes);
    }
  }, [chatVibes, userId]);

  // Reconnect WebSocket on browser online event
  useEffect(() => {
    const handleOnline = () => {
      console.log("Device back online. Reconnecting WebSocket...");
      if (userId) {
        setReconnectCounter(prev => prev + 1);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [userId]);

  // Centralized interval to prune expired disappearing messages from state & DB
  useEffect(() => {
    if (!userId) return;
    
    const interval = setInterval(async () => {
      let expiredFound = false;
      const now = Date.now();
      
      setChats(prevChats => {
        let changed = false;
        const updated = prevChats.map(chat => {
          const validMsgs = chat.messages.filter(m => {
            if (m.expires_at) {
              const expTime = new Date(m.expires_at).getTime();
              if (expTime <= now) {
                changed = true;
                expiredFound = true;
                return false;
              }
            }
            return true;
          });
          if (validMsgs.length !== chat.messages.length) {
            return { ...chat, messages: validMsgs };
          }
          return chat;
        });
        
        if (changed) {
          saveDualStorage(`gv_chats_${userId}`, updated);
          return updated;
        }
        return prevChats;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [userId]);

  // Listen for local expiry events from the offline queue manager
  useEffect(() => {
    if (!userId) return;
    const handleLocalExpiryEvent = (e) => {
      const msgId = e.detail.message_id;
      setChats(prevChats => {
        let changed = false;
        const updated = prevChats.map(chat => {
          const filtered = chat.messages.filter(m => {
            if (m.id === msgId) {
              changed = true;
              return false;
            }
            return true;
          });
          return { ...chat, messages: filtered };
        });
        if (changed) {
          saveDualStorage(`gv_chats_${userId}`, updated);
          return updated;
        }
        return prevChats;
      });
    };
    window.addEventListener('gv-message-expired', handleLocalExpiryEvent);
    return () => window.removeEventListener('gv-message-expired', handleLocalExpiryEvent);
  }, [userId]);

  // Resolve key inputs for cryptographic settings
  function getStorageKey() {
    return safeGetItem('gv_private_key') || safeGetItem('gv_phone_number') || 'ghostvibe_local_secure_fallback_key';
  }

  // Check if migration is finalized
  function isMigrationCompleted() {
    return localStorage.getItem('gv_migration_completed') === 'true';
  }

  // Map localStorage key to IndexedDB store and record ID
  function mapKeyToStore(storageKey) {
    if (storageKey.startsWith('gv_chats_')) {
      return { storeName: 'messages', recordId: storageKey };
    }
    if (storageKey.startsWith('gv_statuses_')) {
      return { storeName: 'cache', recordId: storageKey };
    }
    if (storageKey.startsWith('gv_vibes_')) {
      return { storeName: 'cache', recordId: storageKey };
    }
    if (storageKey === 'gv_global_theme' || storageKey === 'gv_last_seen_enabled') {
      return { storeName: 'preferences', recordId: storageKey };
    }
    return { storeName: 'cache', recordId: storageKey };
  }

  function cleanOpenedViewOnce(chatsList) {
    if (!Array.isArray(chatsList)) return chatsList;
    return chatsList.map(chat => {
      if (!chat.messages) return chat;
      const filtered = chat.messages.filter(m => !(m.view_once && m.opened));
      return { ...chat, messages: filtered };
    });
  }

  // Dual Storage Write: IndexedDB primary, localStorage fallback only
  async function saveDualStorageImmediate(key, value) {
    let success = false;
    let targetVal = value;
    if (key.startsWith('gv_chats_')) {
      targetVal = cleanOpenedViewOnce(value);
    }
    try {
      const { storeName, recordId } = mapKeyToStore(key);
      success = await saveRecord(storeName, recordId, targetVal, getStorageKey());
    } catch (e) {
      console.warn("IndexedDB save failed, falling back to localStorage:", e);
    }
    
    // Fallback to localStorage only if IndexedDB write failed
    if (!success) {
      try {
        localStorage.setItem(key, typeof targetVal === 'string' ? targetVal : JSON.stringify(targetVal));
      } catch (e) {
        console.warn("localStorage fallback write failed:", e);
      }
    } else {
      // Clean up legacy localStorage item to prevent duplication/leakage of active data
      if (key.startsWith('gv_chats_') || key.startsWith('gv_statuses_') || key.startsWith('gv_vibes_')) {
        try {
          localStorage.removeItem(key);
        } catch {}
      }
    }
  }

  const writeTimeoutRef = useRef({});
  const writeQueueRef = useRef({});

  // Debounced dual storage writer to batch DB transactions and avoid redundant encryption
  function saveDualStorage(key, value) {
    writeQueueRef.current[key] = value;
    
    if (writeTimeoutRef.current[key]) {
      clearTimeout(writeTimeoutRef.current[key]);
    }
    
    writeTimeoutRef.current[key] = setTimeout(async () => {
      const latestValue = writeQueueRef.current[key];
      delete writeQueueRef.current[key];
      delete writeTimeoutRef.current[key];
      
      await saveDualStorageImmediate(key, latestValue);
    }, 500);
  }

  // Dual Storage Read: Try IndexedDB first, fallback to localStorage
  async function getDualStorage(key) {
    try {
      const { storeName, recordId } = mapKeyToStore(key);
      const val = await getRecord(storeName, recordId, getStorageKey());
      if (val !== null && val !== undefined) {
        return val;
      }
    } catch (e) {
      console.warn("IndexedDB read failed, falling back to localStorage:", e);
    }

    const localVal = localStorage.getItem(key);
    if (localVal !== null && localVal !== undefined) {
      try {
        return JSON.parse(localVal);
      } catch {
        return localVal;
      }
    }
    return null;
  }

  // Migrate existing localStorage data to IndexedDB
  async function migrateLocalStorageToIndexedDB() {
    if (isMigrationCompleted()) {
      return;
    }
    console.log("Starting localStorage to IndexedDB migration...");
    try {
      const keysToMigrate = Object.keys(localStorage).filter(k => k.startsWith('gv_') && k !== 'gv_migration_completed');
      for (const key of keysToMigrate) {
        const valStr = localStorage.getItem(key);
        if (valStr !== null && valStr !== undefined) {
          let val;
          try {
            val = JSON.parse(valStr);
          } catch {
            val = valStr;
          }
          const { storeName, recordId } = mapKeyToStore(key);
          await saveRecord(storeName, recordId, val, getStorageKey());
          
          // Clear legacy localStorage active data after migration
          if (key.startsWith('gv_chats_') || key.startsWith('gv_statuses_') || key.startsWith('gv_vibes_')) {
            localStorage.removeItem(key);
          }
        }
      }
      localStorage.setItem('gv_migration_completed', 'true');
      console.log("LocalStorage to IndexedDB migration completed.");
    } catch (err) {
      console.warn("Migration failed:", err);
    }
  }

  // Change to 127.0.0.1 to avoid Windows IPv6 localhost connection blocking
  const backendUrl = wsUrl;

  // Load chats & statuses from local cache on startup
  useEffect(() => {
    if (userId) {
      setIsDbLoaded(false);
      async function initializeAndLoad() {
        // Initialize DB
        await initDatabase();
        // Migrate legacy localStorage if applicable
        await migrateLocalStorageToIndexedDB();

        // Load preferences from backend backup
        await loadPreferencesFromBackend();

        // 1. Try reading chats from Dual Storage (IndexedDB -> localStorage)
        try {
          const dbChats = await getDualStorage(`gv_chats_${userId}`);
          if (dbChats && Array.isArray(dbChats)) {
            setChats(dbChats);
          } else {
            setChats([]);
          }
        } catch (err) {
          console.error("Failed to load dual storage chats:", err);
          setChats([]);
        }

        // 2. Try reading statuses from Dual Storage
        try {
          const dbStatuses = await getDualStorage(`gv_statuses_${userId}`);
          if (dbStatuses && typeof dbStatuses === 'object') {
            const filtered = cleanExpiredStatuses(dbStatuses);
            setStatuses(filtered);
            await saveDualStorage(`gv_statuses_${userId}`, filtered);
          }
        } catch (err) {
          console.error("Failed to load dual storage statuses:", err);
        }
        setIsDbLoaded(true);
      }
      initializeAndLoad();
    }
  }, [userId]);

  // Clean expired statuses
  function cleanExpiredStatuses(statusMap) {
    const cleaned = {};
    const now = new Date();
    try {
      if (statusMap && typeof statusMap === 'object') {
        Object.keys(statusMap).forEach(uId => {
          const stories = statusMap[uId];
          if (Array.isArray(stories)) {
            const activeStories = stories.filter(story => {
              return story && story.expiresAt && new Date(story.expiresAt) > now;
            });
            if (activeStories.length > 0) {
              cleaned[uId] = activeStories;
            }
          }
        });
      }
    } catch (e) {
      console.error('Error cleaning expired statuses:', e);
    }
    return cleaned;
  };

  // Periodic status expiration cleanup task
  useEffect(() => {
    const interval = setInterval(() => {
      setStatuses(prev => {
        const cleaned = cleanExpiredStatuses(prev);
        if (userId) {
          localStorage.setItem(`gv_statuses_${userId}`, JSON.stringify(cleaned));
        }
        return cleaned;
      });
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [userId]);

  // Vibe burst trigger helper
  const triggerVibeBurst = (vibeType) => {
    setVibeBurst(vibeType);
    setTimeout(() => {
      setVibeBurst(prev => prev === vibeType ? null : prev);
    }, 4000);
  };

  // Decrypt and process incoming messages
  function handleIncomingMessage(senderId, messageData, customTimestamp = null) {
    const { id, msgType, encryptedBody } = messageData;
    console.log('Rendering message', id);
    
    // Decrypt locally using private key
    const myPrivateKey = safeGetItem('gv_private_key');
    const decryptedText = decryptMessageLocal(encryptedBody, myPrivateKey);

    // 1. Send immediate delivery-ack back
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'delivery-ack',
        target_id: senderId,
        data: { id }
      }));
      
      // 2. Send read-ack too if the user currently has this chat open
      if (activeChatIdRef.current === senderId) {
        wsRef.current.send(JSON.stringify({
          type: 'read-ack',
          target_id: senderId,
          data: { id }
        }));
      }
    }

    // Play chime sound
    playReceivedChime();

    // Trigger desktop notification
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
      const chat = chatsRef.current.find(c => c.user_id === senderId);
      const isLocked = chat && chat.locked;
      const title = isLocked ? "New Message" : (chat ? chat.name : "New Message");
      const body = isLocked ? "New Message" : (msgType === 'text' ? decryptedText : 'Sent a media file');
      new Notification(title, { body });
    }

    // Reset lock timer for active chat
    const chat = chatsRef.current.find(c => c.user_id === senderId);
    if (chat && chat.locked && chat.lock_timeout > 0 && activeChatIdRef.current === senderId) {
      refreshLockTimer(senderId, chat.lock_timeout);
    }

    // Update message logs in target chat
    const ttl = messageData.ttl;
    const expires_at = (ttl !== undefined && ttl !== null) ? new Date(new Date(customTimestamp || Date.now()).getTime() + ttl * 1000).toISOString() : null;
    const isViewOnce = messageData.view_once === true;

    const newMessage = {
      id,
      sender: 'peer',
      text: msgType === 'text' ? decryptedText : '',
      msgType,
      mediaData: (msgType === 'image' || msgType === 'video') ? decryptedText : null, // Base64 decrypted media
      status: activeChatIdRef.current === senderId ? 'read' : 'delivered',
      timestamp: customTimestamp || new Date().toISOString(),
      ttl,
      expires_at
    };
    if (isViewOnce) {
      newMessage.view_once = true;
      newMessage.opened = false;
    }

    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === senderId) {
          return {
            ...chat,
            messages: [...chat.messages, newMessage]
          };
        }
        return chat;
      });

      // Auto-create contact from incoming message if they aren't saved
      const exists = prevChats.some(c => c.user_id === senderId);
      if (!exists) {
        const newContact = {
          phone_number: `Node [${senderId.substring(0,6)}]`,
          name: `Node [${senderId.substring(0,6)}]`,
          user_id: senderId,
          username_hash: 'derived_' + Math.random().toString(36).substring(6),
          identity_key_public: 'injected_by_receiver',
          messages: [newMessage]
        };
        
        // Request initial presence
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'presence-query',
            target_id: senderId,
            data: {}
          }));
        }
        const finalChats = [...prevChats, newContact];
        if (userId) {
          saveDualStorage(`gv_chats_${userId}`, finalChats);
        }
        return finalChats;
      } else {
        if (userId) {
          saveDualStorage(`gv_chats_${userId}`, updatedChats);
        }
        return updatedChats;
      }
    });
  }

  function markLatestMessageStatus(newStatus) {
    setChats(prevChats => {
      const targetChatId = activeChatIdRef.current;
      if (!targetChatId) return prevChats;
      
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === targetChatId) {
          const msgs = [...chat.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].sender === 'me' && (msgs[i].status === 'sent' || msgs[i].status === 'pending')) {
              msgs[i] = { ...msgs[i], status: newStatus };
              break;
            }
          }
          return { ...chat, messages: msgs };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  }

  // Process incoming presence story status updates
  function handleIncomingStatus(senderId, statusData) {
    // Only contacts who have my number saved (is in my contact list) can show status
    const isContact = chatsRef.current.some(c => c.user_id === senderId);
    if (!isContact) {
      console.log(`[Status Ignored] Sender ${senderId} is not in local contacts.`);
      return;
    }

    const { id, mediaData, caption, timestamp, expiresAt } = statusData;
    
    // Check if status is already expired
    if (new Date(expiresAt) <= new Date()) return;

    setStatuses(prev => {
      const userStories = prev[senderId] || [];
      // Prevent duplicates
      if (userStories.some(s => s.id === id)) return prev;

      const updated = {
        ...prev,
        [senderId]: [...userStories, { id, mediaData, caption, timestamp, expiresAt }]
      };
      
      if (userId) {
        localStorage.setItem(`gv_statuses_${userId}`, JSON.stringify(updated));
      }
      return updated;
    });
  }

  const handleStatusViewed = (creatorId, storyId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'status-viewed',
        target_id: creatorId,
        data: {
          status_id: storyId,
          viewer_id: userId
        }
      }));
    }
  };

  // Update status ticks for sent messages
  function handleStatusUpdate(peerId, messageId, newStatus) {
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === peerId) {
          const updatedMsgs = chat.messages.map(msg => {
            if (msg.id === messageId) {
              if (msg.status === 'read' || (msg.status === 'delivered' && newStatus === 'delivered')) {
                return msg;
              }
              return { ...msg, status: newStatus };
            }
            return msg;
          });
          return { ...chat, messages: updatedMsgs };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  }

  // Sync "Delete for Everyone" locally
  function handleDeleteEveryoneIncoming(peerId, messageId) {
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === peerId) {
          const updatedMsgs = chat.messages.map(msg => {
            if (msg.id === messageId) {
              return {
                ...msg,
                text: 'This message was deleted',
                mediaData: null,
                deletedEveryone: true
              };
            }
            return msg;
          });
          return { ...chat, messages: updatedMsgs };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  }

  // Unified WebSocket Event Router (supports both live streaming and offline batch syncing)
  const handleWsEvent = (msg, customTimestamp = null) => {
    if (!msg || !msg.type) return;
    
    switch (msg.type) {
      case 'chat-message':
        console.log('[Message Received] Incoming chat message payload:', msg.data?.id);
        handleIncomingMessage(msg.sender_id, msg.data, customTimestamp);
        break;

      case 'message-sent': {
        const clientMsgId = msg.data.client_message_id || msg.data.id;
        const peerId = msg.data.recipient_id || msg.target_id || msg.sender_id;
        console.log('[ACK Sent] Server successfully routed message:', clientMsgId);
        handleStatusUpdate(peerId, clientMsgId, 'sent');
        if (FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED && clientMsgId) {
          handleAck(clientMsgId);
        }
        break;
      }

      case 'message-queued': {
        const clientMsgId = msg.data.client_message_id || msg.data.id;
        console.log('[ACK Queued] Server successfully buffered message offline:', clientMsgId);
        markLatestMessageStatus('queued');
        if (FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED && clientMsgId) {
          handleAck(clientMsgId);
        }
        break;
      }

      case 'delivery-ack':
      case 'message-delivered': {
        const clientMsgId = msg.data.client_message_id || msg.data.id;
        const peerId = msg.sender_id;
        console.log('[ACK Delivered] Recipient received message:', clientMsgId);
        handleStatusUpdate(peerId, clientMsgId, 'delivered');
        if (FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED && clientMsgId) {
          handleAck(clientMsgId);
        }
        break;
      }

      case 'read-ack':
      case 'message-read': {
        const clientMsgId = msg.data.client_message_id || msg.data.id;
        const peerId = msg.sender_id;
        console.log('[ACK Read] Recipient read message:', clientMsgId);
        handleStatusUpdate(peerId, clientMsgId, 'read');
        break;
      }

      case 'offline-sync': {
        console.log('offline-sync received');
        const syncMsgs = msg.data.messages || [];
        console.log('[Offline Sync] Batch delivery payload received. Size:', syncMsgs.length);
        syncMsgs.forEach(sMsg => {
          let parsedPacket;
          try {
            parsedPacket = JSON.parse(sMsg.encrypted_payload);
          } catch {
            parsedPacket = sMsg;
          }
          
          // Re-route inner packet dynamically to its main case handler
          handleWsEvent(parsedPacket, sMsg.timestamp);

          // Return ACK to server so the record can be deleted from the database
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'message-ack',
              data: {
                server_message_id: sMsg.server_message_id
              }
            }));
            console.log('message-ack sent');
          }
        });
        break;
      }

      case 'message-expired': {
        const expMsgId = msg.data.message_id;
        setChats(prevChats => {
          let changed = false;
          const updated = prevChats.map(chat => {
            const filtered = chat.messages.filter(m => {
              if (m.id === expMsgId) {
                changed = true;
                return false;
              }
              return true;
            });
            if (filtered.length !== chat.messages.length) {
              return { ...chat, messages: filtered };
            }
            return chat;
          });
          if (changed) {
            saveDualStorage(`gv_chats_${userId}`, updated);
            return updated;
          }
          return prevChats;
        });
        break;
      }

      case 'media-opened': {
        const openedMsgId = msg.data.message_id;
        setChats(prevChats => {
          let changed = false;
          const updated = prevChats.map(chat => {
            const updatedMsgs = chat.messages.map(m => {
              if (m.id === openedMsgId) {
                changed = true;
                if (m.sender === 'me') {
                  return {
                    ...m,
                    status: 'opened',
                    opened: true,
                    opened_at: msg.data.opened_at || new Date().toISOString(),
                    mediaData: null,
                    text: 'Opened'
                  };
                } else {
                  return null; // Prune recipient view once
                }
              }
              return m;
            }).filter(Boolean);
            if (updatedMsgs.length !== chat.messages.length || changed) {
              changed = true;
              return { ...chat, messages: updatedMsgs };
            }
            return chat;
          });
          if (changed) {
            saveDualStorage(`gv_chats_${userId}`, updated);
            return updated;
          }
          return prevChats;
        });
        break;
      }

      case 'message-sync-expiry': {
        const expiries = msg.data.expiries || {};
        setChats(prevChats => {
          let changed = false;
          const updated = prevChats.map(chat => {
            const updatedMsgs = chat.messages.map(m => {
              if (m.id in expiries) {
                const remainingTtl = expiries[m.id];
                if (remainingTtl <= 0) {
                  changed = true;
                  return null;
                } else {
                  const nextExpires = new Date(Date.now() + remainingTtl * 1000).toISOString();
                  if (m.expires_at !== nextExpires) {
                    changed = true;
                    return { ...m, expires_at: nextExpires };
                  }
                }
              }
              return m;
            }).filter(Boolean);
            if (updatedMsgs.length !== chat.messages.length || changed) {
              changed = true;
              return { ...chat, messages: updatedMsgs };
            }
            return chat;
          });
          if (changed) {
            saveDualStorage(`gv_chats_${userId}`, updated);
            return updated;
          }
          return prevChats;
        });
        break;
      }

      case 'offline-sync-complete':
        console.log('[Offline Sync] Batch sync transactions complete.');
        break;

      case 'delete-everyone':
        console.log('[Message Recalled] Message deletion received for id:', msg.data?.id);
        handleDeleteEveryoneIncoming(msg.sender_id, msg.data.id);
        break;

      case 'status-update':
        handleIncomingStatus(msg.sender_id, msg.data);
        break;

      case 'status-viewed': {
        const { status_id, viewer_id } = msg.data;
        setStatuses(prev => {
          const myStories = prev[userId] || [];
          const updatedStories = myStories.map(story => {
            if (story.id === status_id) {
              const currentViewers = story.viewers || [];
              if (!currentViewers.includes(viewer_id)) {
                return { ...story, viewers: [...currentViewers, viewer_id] };
              }
            }
            return story;
          });
          const updated = {
            ...prev,
            [userId]: updatedStories
          };
          if (userId) {
            localStorage.setItem(`gv_statuses_${userId}`, JSON.stringify(updated));
          }
          return updated;
        });
        break;
      }

      case 'presence-update': {
        const presData = msg.data;
        setPresence(prev => ({
          ...prev,
          [presData.user_id]: {
            status: presData.status,
            last_active: presData.last_active
          }
        }));
        break;
      }
        
      case 'vibe-update': {
        const receivedVibe = msg.data.vibe;
        setChatVibes(prev => {
          const updated = { ...prev, [msg.sender_id]: receivedVibe };
          if (userId) {
            saveDualStorage(`gv_vibes_${userId}`, updated);
          }
          return updated;
        });
        playVibeChime(receivedVibe);
        triggerVibeBurst(receivedVibe);
        break;
      }

      case 'call-offer': {
        const callerContact = chatsRef.current.find(c => c.user_id === msg.sender_id);
        const callerPhone = callerContact ? (callerContact.name || callerContact.phone_number) : 'Unknown secure node';
        
        const offerSdp = msg.data && msg.data.sdp ? msg.data.sdp : msg.data;
        const callType = msg.data && msg.data.callType ? msg.data.callType : 'video';

        setIncomingCall({
          peerId: msg.sender_id,
          phone_number: callerPhone,
          offerSdp: offerSdp,
          callType: callType
        });
        break;
      }

      case 'hangup':
        setCallSession(null);
        setIncomingCall(null);
        break;
        
      default:
        break;
    }
  };

  // Connect WebSocket and setup message handlers
  useEffect(() => {
    if (!userId || !token || !isDbLoaded) return;

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${backendUrl}/ws/${userId}?token=${token}`);
    wsRef.current = socket;
    console.log('[Socket] Connecting WebSocket to signaling node...', socket.url);
    
    setTimeout(() => {
      setConnectionState('connecting');
      setCurrentSocket(socket);
    }, 0);

    socket.onopen = () => {
      console.log('[Socket Connected] Established duplex pipeline with signaling server.');
      console.log('WebSocket Connected');
      setConnectionState('connected');
      
      if (FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED) {
        processQueue(socket);
      }

      if (FEATURE_FLAGS.DISAPPEARING_MESSAGES_ENABLED) {
        const activeTtlIds = [];
        chatsRef.current.forEach(chat => {
          if (chat.messages) {
            chat.messages.forEach(m => {
              if (m.expires_at && new Date(m.expires_at).getTime() > Date.now()) {
                activeTtlIds.push(m.id);
              }
            });
          }
        });
        socket.send(JSON.stringify({
          type: 'message-sync-expiry',
          target_id: 'system',
          data: {
            message_ids: activeTtlIds
          }
        }));
      }

      // Query initial presence for all contacts in our list
      chatsRef.current.forEach(contact => {
        socket.send(JSON.stringify({
          type: 'presence-query',
          target_id: contact.user_id,
          data: {}
        }));
      });
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log('[Socket Event] Type:', msg.type);
        handleWsEvent(msg);
      } catch (err) {
        console.error('[Socket Error] Failed to parse socket message:', err);
      }
    };

    socket.onclose = (event) => {
      console.log('[Socket Closed] Connection dropped. Code:', event.code, 'Reason:', event.reason);
      if (event.code === 1008) {
        console.warn('[Socket Auth Error] Policy Violation. Logging out user.');
        handleLogout();
        return;
      }
      setConnectionState('disconnected');
      setCurrentSocket(null);
      setTimeout(() => {
        if (userId && token) {
          setReconnectCounter(prev => prev + 1);
        }
      }, 3000);
    };

    socket.onerror = (err) => {
      console.error('[Socket Error] Connection error observed:', err);
    };

    return () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
      setCurrentSocket(null);
    };
  }, [userId, token, reconnectCounter, isDbLoaded]); // Reconnect if userId, token, reconnectCounter, or isDbLoaded changes

  // Send read receipts when a chat is opened
  useEffect(() => {
    if (activeChatId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const activeContact = chats.find(c => c.user_id === activeChatId);
      if (activeContact) {
        let ackSent = false;
        const updatedMessages = activeContact.messages.map(msg => {
          if (msg.sender === 'peer' && msg.status !== 'read') {
            wsRef.current.send(JSON.stringify({
              type: 'read-ack',
              target_id: activeChatId,
              data: { id: msg.id }
            }));
            ackSent = true;
            return { ...msg, status: 'read' };
          }
          return msg;
        });

        if (ackSent) {
          setChats(prev => {
            const updated = prev.map(c => {
              if (c.user_id === activeChatId) {
                return { ...c, messages: updatedMessages };
              }
              return c;
            });
            if (userId) {
              saveDualStorage(`gv_chats_${userId}`, updated);
            }
            return updated;
          });
        }
      }
    }
  }, [activeChatId]);

;

  const handleSendMessage = (targetId, rawText, encryptedBody, msgType = 'text', mediaData = null, viewOnce = false) => {
    const msgId = 'msg_' + Date.now() + Math.random().toString(36).substring(4);
    
    const useTtl = FEATURE_FLAGS.DISAPPEARING_MESSAGES_ENABLED && defaultTtl > 0;
    const packet = {
      type: useTtl ? 'message-send' : 'chat-message',
      target_id: targetId,
      data: {
        id: msgId,
        msgType,
        encryptedBody
      }
    };
    if (useTtl) {
      packet.data.ttl = defaultTtl;
    }
    if (viewOnce) {
      packet.data.view_once = true;
    }

    const isWsOpen = wsRef.current && wsRef.current.readyState === WebSocket.OPEN;
    let status = 'sent';

    if (!isWsOpen && FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED) {
      addToQueue(packet);
      status = 'pending';
    } else {
      try {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify(packet));
        } else {
          throw new Error("Socket not open");
        }
      } catch (err) {
        console.warn("Failed to send socket payload:", err);
        if (FEATURE_FLAGS.OFFLINE_QUEUE_ENABLED) {
          addToQueue(packet);
          status = 'pending';
        } else {
          status = 'failed';
        }
      }
    }

    // Play sent sound chime
    playSentChime();

    // Save locally
    const newMsg = {
      id: msgId,
      sender: 'me',
      text: msgType === 'text' ? rawText : '',
      msgType,
      mediaData,
      status: status,
      timestamp: new Date().toISOString()
    };
    if (useTtl) {
      newMsg.ttl = defaultTtl;
      newMsg.expires_at = new Date(Date.now() + defaultTtl * 1000).toISOString();
    }
    if (viewOnce) {
      newMsg.view_once = true;
      newMsg.opened = false;
    }

    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === targetId) {
          return {
            ...chat,
            messages: [...chat.messages, newMsg]
          };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });

    const activeChat = chatsRef.current.find(c => c.user_id === targetId);
    if (activeChat && activeChat.locked && activeChat.lock_timeout > 0) {
      refreshLockTimer(targetId, activeChat.lock_timeout);
    }
  };

  const handleMediaOpened = (targetId, msgId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'media-opened',
        target_id: targetId,
        data: {
          message_id: msgId,
          opened_at: new Date().toISOString()
        }
      }));
    }

    setChats(prevChats => {
      const updated = prevChats.map(chat => {
        if (chat.user_id === targetId) {
          const filtered = chat.messages.filter(m => m.id !== msgId);
          return { ...chat, messages: filtered };
        }
        return chat;
      });
      saveDualStorage(`gv_chats_${userId}`, updated);
      return updated;
    });
  };

  const handleUnlockChat = (chatId, timeoutSeconds) => {
    setUnlockedChatIds(prev => {
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });

    if (lockTimersRef.current[chatId]) {
      clearTimeout(lockTimersRef.current[chatId]);
    }

    if (timeoutSeconds > 0) {
      lockTimersRef.current[chatId] = setTimeout(() => {
        setUnlockedChatIds(prev => {
          const next = new Set(prev);
          next.delete(chatId);
          return next;
        });
        delete lockTimersRef.current[chatId];
      }, timeoutSeconds * 1000);
    }
  };

  const handleUnlockAllChats = (chatIds) => {
    setUnlockedChatIds(prev => {
      const next = new Set(prev);
      chatIds.forEach(id => next.add(id));
      return next;
    });
  };

  const refreshLockTimer = (chatId, timeoutSeconds) => {
    if (timeoutSeconds > 0 && lockTimersRef.current[chatId]) {
      clearTimeout(lockTimersRef.current[chatId]);
      lockTimersRef.current[chatId] = setTimeout(() => {
        setUnlockedChatIds(prev => {
          const next = new Set(prev);
          next.delete(chatId);
          return next;
        });
        delete lockTimersRef.current[chatId];
      }, timeoutSeconds * 1000);
    }
  };

  const handleSetChatLockSettings = (chatId, settings) => {
    setChats(prevChats => {
      const updated = prevChats.map(c => {
        if (c.user_id === chatId) {
          return {
            ...c,
            ...settings
          };
        }
        return c;
      });
      saveDualStorage(`gv_chats_${userId}`, updated);
      return updated;
    });

    if (settings.locked === false) {
      setUnlockedChatIds(prev => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
      if (lockTimersRef.current[chatId]) {
        clearTimeout(lockTimersRef.current[chatId]);
        delete lockTimersRef.current[chatId];
      }
    }
  };

  // Change conversation Vibe Level
  const handleUpdateVibe = (chatId, vibeType) => {
    setChatVibes(prev => {
      const updated = { ...prev, [chatId]: vibeType };
      if (userId) {
        localStorage.setItem(`gv_vibes_${userId}`, JSON.stringify(updated));
      }
      return updated;
    });

    // Play vibe sound chime locally
    playVibeChime(vibeType);

    // Trigger local particle burst animation
    triggerVibeBurst(vibeType);

    // Broadcast vibe update to target peer
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'vibe-update',
        target_id: chatId,
        data: { vibe: vibeType }
      }));
    }
  };

  // Delete message for me (local)
  const handleDeleteMessageLocal = (chatId, messageId) => {
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === chatId) {
          return {
            ...chat,
            messages: chat.messages.filter(m => m.id !== messageId)
          };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  };

  // Delete message for everyone
  const handleDeleteMessageEveryone = (chatId, messageId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'delete-everyone',
        target_id: chatId,
        data: { id: messageId }
      }));
    }

    // Update local state
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === chatId) {
          return {
            ...chat,
            messages: chat.messages.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  text: 'This message was deleted',
                  mediaData: null,
                  deletedEveryone: true
                };
              }
              return m;
            })
          };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  };

  // Clear local Chat history
  const handleClearChat = (chatId) => {
    setChats(prevChats => {
      const updatedChats = prevChats.map(chat => {
        if (chat.user_id === chatId) {
          return {
            ...chat,
            messages: []
          };
        }
        return chat;
      });
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updatedChats);
      }
      return updatedChats;
    });
  };

  // Delete Contact / User from outside
  const handleDeleteContact = (chatId) => {
    if (window.confirm("Are you sure you want to remove this secure contact? Chat logs will be deleted.")) {
      setChats(prevChats => {
        const updatedChats = prevChats.filter(chat => chat.user_id !== chatId);
        if (userId) {
          saveDualStorage(`gv_chats_${userId}`, updatedChats);
        }
        return updatedChats;
      });
      if (activeChatIdRef.current === chatId) {
        setActiveChatId(null);
      }
    }
  };

  // Upload/Post a Story Status Update
  const handlePostStatus = (mediaData, caption, expiresHours = 24) => {
    const statusId = 'status_' + Date.now() + Math.random().toString(36).substring(4);
    const timestamp = new Date().toISOString();
    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000).toISOString();

    const newStatus = {
      id: statusId,
      mediaData,
      caption,
      timestamp,
      expiresAt
    };

    // Save locally under my user id
    setStatuses(prev => {
      const myStories = prev[userId] || [];
      const updated = {
        ...prev,
        [userId]: [...myStories, newStatus]
      };
      if (userId) {
        saveDualStorage(`gv_statuses_${userId}`, updated);
      }
      return updated;
    });

    // Broadcast status to all active contacts
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      chatsRef.current.forEach(contact => {
        wsRef.current.send(JSON.stringify({
          type: 'status-update',
          target_id: contact.user_id,
          data: newStatus
        }));
      });
    }
  };

  const handleAddChat = (newContact) => {
    setChats(prev => {
      if (prev.some(c => c.user_id === newContact.user_id)) return prev;
      const updated = [...prev, newContact];
      if (userId) {
        saveDualStorage(`gv_chats_${userId}`, updated);
      }
      return updated;
    });
    setActiveChatId(newContact.user_id);
    
    // Query initial presence
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'presence-query',
        target_id: newContact.user_id,
        data: {}
      }));
    }
  };

  // Initiate a Call
  const handleInitiateCall = (peerId) => {
    const contact = chats.find(c => c.user_id === peerId);
    setCallTypeSelectionTarget({ peerId, contact });
  };

  const startSelectedCall = (callType) => {
    if (!callTypeSelectionTarget) return;
    const { peerId, contact } = callTypeSelectionTarget;
    setCallSession({
      peerId,
      role: 'caller',
      phone_number: contact ? (contact.name || contact.phone_number) : 'Secure Node',
      callType,
      active: true
    });
    setCallTypeSelectionTarget(null);
  };

  // Accept incoming call
  const handleAcceptCall = () => {
    if (!incomingCall) return;
    setCallSession({
      peerId: incomingCall.peerId,
      role: 'receiver',
      phone_number: incomingCall.phone_number,
      callType: incomingCall.callType || 'video',
      active: true
    });
    setIncomingCall(null);
  };

  // Reject incoming call
  const handleRejectCall = () => {
    if (!incomingCall) return;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'hangup',
        target_id: incomingCall.peerId,
        data: {}
      }));
    }
    setIncomingCall(null);
  };

  const handleEndCall = (sendHangupSignal = true) => {
    if (sendHangupSignal && callSession && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'hangup',
        target_id: callSession.peerId,
        data: {}
      }));
    }
    setCallSession(null);
  };

  const handleLogout = () => {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
    try {
      clearStore('messages');
      clearStore('drafts');
      clearStore('preferences');
      clearStore('keys');
      clearStore('cache');
    } catch (e) {
      console.warn('Failed to clear IndexedDB:', e);
    }
    setToken('');
    setUserId('');
    setMyPhone('');
    setChats([]);
    setActiveChatId(null);
    setCallSession(null);
    setIncomingCall(null);
    setPresence({});
    setStatuses({});
    setChatVibes({});
    setVibeBurst(null);
    setMyProfile({ username: '', avatar: '', bio: '' });
    setConnectionState('disconnected');
    setIsDbLoaded(false);
  };

  const handleAuthSuccess = (uId, tok) => {
    setUserId(uId);
    setToken(tok);
    let cachedPhone = '';
    try {
      cachedPhone = localStorage.getItem('gv_phone_number') || '';
    } catch (e) {
      console.warn('Failed to read phone number from localStorage:', e);
    }
    setMyPhone(cachedPhone);
  };

  const activeChat = chats.find(chat => chat.user_id === activeChatId);

  // Unauthenticated screen
  if (!userId || !token) {
    return <Auth onAuthSuccess={handleAuthSuccess} />;
  }

  const isProfileIncomplete = userId && token && (!myProfile || !myProfile.username);
  
  if (isProfileIncomplete) {
    return (
      <div style={{
        height: '100vh',
        width: '100vw',
        background: 'radial-gradient(circle at 50% 0%, #10192a 0%, #090b11 70%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div className="glass-panel pulse-glow" style={{
          width: '100%',
          maxWidth: '400px',
          padding: '40px 30px',
          border: '1px solid var(--accent-cyan)',
          borderRadius: '16px',
          textAlign: 'center',
          background: 'rgba(18, 22, 35, 0.95)',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <h2 style={{ color: 'var(--accent-cyan)', marginBottom: '10px' }}>Setup Your Profile</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Choose a display alias and customize your secure identity card.
          </p>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            setSetupError('');
            const usernameInput = e.target.username.value;
            const bioInput = e.target.bio.value;

            const userErr = validateUsername(usernameInput);
            if (userErr) {
              setSetupError(userErr);
              return;
            }

            const bioErr = validateBio(bioInput);
            if (bioErr) {
              setSetupError(bioErr);
              return;
            }
            
            const updatedProfile = {
              username: usernameInput.trim(),
              avatar: profileSetupAvatar || '',
              bio: bioInput.trim()
            };
            
            setMyProfile(updatedProfile);
            localStorage.setItem('gv_my_profile', JSON.stringify(updatedProfile));
            
            // Sync to backend
            await syncPreferencesToBackend(globalTheme, lastSeenEnabled, defaultTtl, updatedProfile);
          }} style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>

            {setupError && (
              <div style={{
                background: 'rgba(255, 23, 68, 0.15)',
                border: '1px solid rgba(255, 23, 68, 0.3)',
                borderRadius: '8px',
                padding: '12px',
                color: '#ff5252',
                fontSize: '0.9rem',
                marginBottom: '10px'
              }}>
                ⚠️ {setupError}
              </div>
            )}
            
            {/* Profile Avatar Loader */}
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <div 
                onClick={() => document.getElementById('profile-avatar-file').click()}
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: 'rgba(0, 229, 255, 0.05)',
                  border: '2px dashed var(--accent-cyan)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 10px auto',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  position: 'relative'
                }}
              >
                {profileSetupAvatar ? (
                  <img src={profileSetupAvatar} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>Upload Photo</span>
                )}
              </div>
              <input 
                id="profile-avatar-file"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  setSetupError('');
                  const file = e.target.files[0];
                  if (file) {
                    const uploadErr = validateFileUpload(file, 1024 * 1024);
                    if (uploadErr) {
                      setSetupError(uploadErr);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      setProfileSetupAvatar(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }
                }}
                style={{ display: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Secure Display Alias
              </label>
              <input
                name="username"
                type="text"
                placeholder="e.g. GhostRider"
                className="input-field"
                required
              />
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                About / Bio (Optional)
              </label>
              <input
                name="bio"
                type="text"
                placeholder="Go Ghost, Keep the Vibe."
                className="input-field"
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px', marginTop: '10px' }}>
              Create Profile Card
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* 1. Sidebar Contacts panel */}
      <div className="sidebar">
        {/* Device Profile info */}
        <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>This Device</span>
            <span style={{ fontSize: '0.95rem', fontWeight: '600', color: 'var(--accent-cyan)' }}>{myPhone}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(57,255,20,0.1)', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', color: 'var(--accent-green)' }}>
            <ShieldCheck size={12} /> Secure
          </div>
        </div>

        <ChatList 
          chats={chats} 
          activeChatId={activeChatId} 
          onSelectChat={setActiveChatId}
          onAddChat={handleAddChat}
          onDeleteContact={handleDeleteContact}
          onLogout={handleLogout}
          presence={presence}
          statuses={statuses}
          onPostStatus={handlePostStatus}
          myUserId={userId}
          connectionState={connectionState}
          myPhone={myPhone}
          onOpenSettings={() => setSettingsOpen(true)}
          lastSeenEnabled={lastSeenEnabled}
          unlockedChatIds={unlockedChatIds}
          onUnlockAllChats={handleUnlockAllChats}
          onStatusViewed={handleStatusViewed}
        />
      </div>

      {/* 2. Main screen - Switches between Active Call and Chat logs */}
      <div className="main-content">
        {callSession ? (
          <VideoCall 
            callSession={callSession}
            ws={currentSocket}
            userId={userId}
            onEndCall={handleEndCall}
          />
        ) : activeChat ? (
          <ChatRoom 
            chat={activeChat} 
            onSendMessage={handleSendMessage}
            onInitiateCall={handleInitiateCall}
            onDeleteLocal={handleDeleteMessageLocal}
            onDeleteEveryone={handleDeleteMessageEveryone}
            onClearChat={handleClearChat}
            presenceStatus={presence[activeChatId]}
            vibe={chatVibes[activeChatId] || 'chill'}
            onUpdateVibe={(vibeType) => handleUpdateVibe(activeChatId, vibeType)}
            vibeBurst={vibeBurst}
            myPhone={myPhone}
            lastSeenEnabled={lastSeenEnabled}
            onMediaOpened={handleMediaOpened}
            unlockedChatIds={unlockedChatIds}
            onUnlockChat={handleUnlockChat}
            onSetChatLockSettings={handleSetChatLockSettings}
          />
        ) : (
          <div className="glass-panel" style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            textAlign: 'center',
            padding: '40px'
          }}>
            <img 
              src="https://img.icons8.com/nolan/128/ghost.png" 
              alt="Ghost Logo" 
              style={{ width: '100px', height: '100px', marginBottom: '20px', filter: 'hue-rotate(130deg)' }} 
            />
            <h2 style={{ color: 'var(--accent-cyan)' }}>Go Ghost, Keep the Vibe.</h2>
            <p style={{ maxWidth: '400px', fontSize: '0.95rem', lineHeight: '1.6' }}>
              Select a verified secure session from the list, or add a contact to start messaging and video calling with real-time translation support.
            </p>
          </div>
        )}
      </div>

      {/* 2.5 Call Type Selector Modal */}
      {callTypeSelectionTarget && (
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
          zIndex: 12000
        }}>
          <div className="glass-panel pulse-glow" style={{
            width: '100%',
            maxWidth: '360px',
            padding: '30px',
            textAlign: 'center',
            border: '1px solid var(--accent-cyan)'
          }}>
            <h3 style={{ fontSize: '1.3rem', marginBottom: '20px', color: 'var(--accent-cyan)' }}>Start Secure Call</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px' }}>
              Select call type for {callTypeSelectionTarget.contact?.name || callTypeSelectionTarget.contact?.phone_number}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                className="btn-primary" 
                style={{ justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-cyan), #00b0ff)' }}
                onClick={() => startSelectedCall('voice')}
              >
                📞 Voice Call
              </button>
              <button 
                className="btn-primary" 
                style={{ justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-green), #00c853)' }}
                onClick={() => startSelectedCall('video')}
              >
                🎥 Video Call
              </button>
              <button 
                className="btn-secondary" 
                style={{ justifyContent: 'center', marginTop: '8px' }}
                onClick={() => setCallTypeSelectionTarget(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Incoming Call dialog modal */}
      {incomingCall && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 7, 12, 0.9)',
          backdropFilter: 'blur(15px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div className="glass-panel pulse-glow" style={{
            width: '100%',
            maxWidth: '380px',
            padding: '40px 30px',
            textAlign: 'center',
            border: '1px solid var(--accent-cyan)'
          }}>
            <div style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              background: 'rgba(0, 229, 255, 0.1)',
              border: '2px solid var(--accent-cyan)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              color: 'var(--accent-cyan)'
            }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>
                {incomingCall.phone_number[0]?.toUpperCase() || 'S'}
              </span>
            </div>
            
            <h3 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>
              Secure {incomingCall.callType === 'voice' ? 'Voice' : 'Video'} Call
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', marginBottom: '32px' }}>
              {incomingCall.phone_number}
            </p>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <button 
                className="btn-primary" 
                style={{ flex: 1, justifyContent: 'center', padding: '12px', background: 'linear-gradient(135deg, var(--accent-green), #00c853)', boxShadow: 'var(--shadow-glow-green)' }}
                onClick={handleAcceptCall}
              >
                Accept
              </button>
              <button 
                className="btn-danger" 
                style={{ flex: 1, justifyContent: 'center', padding: '12px' }}
                onClick={handleRejectCall}
              >
                <PhoneOff size={16} /> Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Global Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          myProfile={myProfile}
          setMyProfile={setMyProfile}
          globalTheme={globalTheme}
          setGlobalTheme={setGlobalTheme}
          lastSeenEnabled={lastSeenEnabled}
          setLastSeenEnabled={setLastSeenEnabled}
          defaultTtl={defaultTtl}
          setDefaultTtl={setDefaultTtl}
          linkedDevices={linkedDevices}
          onRevokeDevice={handleRevokeDevice}
          myPhone={myPhone}
          myUserId={userId}
        />
      )}
    </div>
  );
}
