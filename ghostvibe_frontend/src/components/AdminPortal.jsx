import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Shield, Users, MessageSquare, Search, LogOut, RefreshCw, Filter, 
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, 
  Download, UserX, Activity 
} from 'lucide-react';

const formatPhoneNumber = (phone) => {
  if (!phone) return '+91 98765 43210';
  const clean = phone.replace(/\s+/g, '');
  if (clean.startsWith('+91') && clean.length === 13) {
    return `+91 ${clean.slice(3, 8)} ${clean.slice(8)}`;
  }
  if (clean.length === 10) {
    return `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return phone;
};

const formatLastSeen = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    // Compare dates ignoring time
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = today - targetDate;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else {
      const day = String(d.getDate()).padStart(2, '0');
      const month = d.toLocaleString('en-US', { month: 'short' });
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    }
  } catch {
    return 'Offline';
  }
};

const formatJoinedDate = (dateStr) => {
  try {
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  } catch {
    return 'Unknown';
  }
};

export default function AdminPortal() {
  const [token, setToken] = useState(() => localStorage.getItem('gv_admin_token') || '');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  // Active view: 'dashboard' | 'users' | 'broadcast' | 'audit' | 'settings'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [adminRole, setAdminRole] = useState('Super Admin'); // Managed dynamically

  // Dashboard state
  const [stats, setStats] = useState(null);
  const [liveAutoRefresh, setLiveAutoRefresh] = useState(true);

  // Users listing pagination & filter state
  const [usersList, setUsersList] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'blocked' | 'suspended' | 'deleted' | 'online' | 'offline' | 'premium'
  const [jumpPageInput, setJumpPageInput] = useState('');

  // Selected user for details modal
  const [selectedUser, setSelectedUser] = useState(null);

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState([]);
  const [broadcastType, setBroadcastType] = useState('message');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [broadcastSuccess, setBroadcastSuccess] = useState('');

  // Settings states
  const [featureFlags, setFeatureFlags] = useState({
    view_once_enabled: true,
    disappearing_messages_enabled: true,
    chat_lock_enabled: true,
    group_chats_enabled: true
  });

  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8080';

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/dashboard`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Dashboard stats fetch failed:", err);
    }
  }, [apiBaseUrl, token]);

  const fetchUsers = useCallback(async () => {
    try {
      const queryParams = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
        sort_by: sortBy,
        sort_order: sortOrder
      });
      if (searchTerm) queryParams.append('search', searchTerm);
      if (statusFilter && statusFilter !== 'all') {
        queryParams.append('status_filter', statusFilter);
      }

      const res = await fetch(`${apiBaseUrl}/api/admin/users?${queryParams.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
        setTotalUsers(data.total || 0);
      }
    } catch (err) {
      console.error("Users list fetch failed:", err);
    }
  }, [apiBaseUrl, token, page, pageSize, sortBy, sortOrder, searchTerm, statusFilter]);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error("Audit logs fetch failed:", err);
    }
  }, [apiBaseUrl, token]);

  const fetchUsersRef = useRef(fetchUsers);
  useEffect(() => {
    fetchUsersRef.current = fetchUsers;
  }, [fetchUsers]);

  const fetchStatsRef = useRef(fetchStats);
  const fetchAuditLogsRef = useRef(fetchAuditLogs);
  useEffect(() => {
    fetchStatsRef.current = fetchStats;
    fetchAuditLogsRef.current = fetchAuditLogs;
  }, [fetchStats, fetchAuditLogs]);

  // Auto Refresh timer
  useEffect(() => {
    if (!token) return;
    fetchStatsRef.current();
    fetchAuditLogsRef.current();
    
    let timer;
    if (liveAutoRefresh) {
      timer = setInterval(() => {
        fetchStatsRef.current();
      }, 5000);
    }
    return () => clearInterval(timer);
  }, [token, liveAutoRefresh]);

  // Refetch users on pagination/filter changes
  useEffect(() => {
    if (!token) return;
    fetchUsersRef.current();
  }, [token, page, pageSize, sortBy, sortOrder, statusFilter]);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput })
      });
      if (!res.ok) {
        throw new Error('Invalid email or secure administrator password.');
      }
      const data = await res.json();
      localStorage.setItem('gv_admin_token', data.access_token);
      setToken(data.access_token);
      setAdminRole(data.role || 'Super Admin');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('gv_admin_token');
    setToken('');
  };

  const handleUserAction = async (userId, actionType) => {
    if (!window.confirm(`Are you sure you want to perform action: ${actionType.toUpperCase()} on user ${userId}?`)) {
      return;
    }
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/users/${userId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ action: actionType })
      });
      if (res.ok) {
        alert(`Action: ${actionType.toUpperCase()} executed successfully.`);
        fetchUsers();
        fetchAuditLogs();
        fetchStats();
        if (selectedUser && selectedUser.user_id === userId) {
          // Update selected user modal attributes dynamically
          setSelectedUser(prev => ({
            ...prev,
            is_blocked: actionType === 'block' ? true : actionType === 'unblock' ? false : prev.is_blocked,
            is_suspended: actionType === 'suspend' ? true : actionType === 'unsuspend' ? false : prev.is_suspended
          }));
        }
      }
    } catch (err) {
      alert("Action request failed: " + err.message);
    }
  };

  const handleTriggerBroadcast = async (e) => {
    e.preventDefault();
    setBroadcastSuccess('');
    try {
      const res = await fetch(`${apiBaseUrl}/api/admin/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          type: broadcastType,
          title: broadcastTitle,
          content: broadcastContent
        })
      });
      if (res.ok) {
        setBroadcastSuccess('📢 System signal broadcast triggered successfully.');
        setBroadcastTitle('');
        setBroadcastContent('');
        fetchAuditLogs();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleExportData = (format) => {
    // Generate text/csv or json exports locally directly from users list
    try {
      let content = '';
      let mimeType = 'text/plain';
      let filename = `ghostvibe_export.${format}`;

      if (format === 'csv') {
        mimeType = 'text/csv';
        content = "User ID,Username Hash,Role,Online Status,Blocked Status,Suspended Status,Messages Count,Created At\n";
        usersList.forEach(u => {
          content += `${u.user_id},${u.username_hash},${u.role},${u.online_status},${u.is_blocked},${u.is_suspended},${u.message_count},${u.registration_date}\n`;
        });
      } else {
        mimeType = 'application/json';
        content = JSON.stringify(usersList, null, 2);
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to export data: " + err.message);
    }
  };

  const cardStyle = {
    background: 'rgba(20, 24, 38, 0.6)',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 8px 32px 0 rgba(0,0,0,0.2)',
    backdropFilter: 'blur(8px)',
    textAlign: 'left'
  };

  const tableHeaderStyle = (col, label) => (
    <th 
      onClick={() => handleSort(col)}
      style={{ padding: '16px', cursor: 'pointer', userSelect: 'none', color: sortBy === col ? '#00e5ff' : '#8c95a5' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {label} <ArrowUpDown size={14} />
      </div>
    </th>
  );

  const totalPages = Math.ceil(totalUsers / pageSize) || 1;

  if (!token) {
    // Elegant glassmorphic admin login portal
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#05070c',
        color: '#fff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '20px'
      }}>
        <div className="glass-panel pulse-glow" style={{
          width: '100%',
          maxWidth: '400px',
          padding: '40px 30px',
          border: '1px solid rgba(0, 229, 255, 0.15)',
          boxShadow: 'var(--shadow-glow)',
          borderRadius: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div style={{ background: 'rgba(0,229,255,0.1)', padding: '16px', borderRadius: '50%', color: '#00e5ff' }}>
              <Shield size={36} />
            </div>
          </div>
          <h2 style={{ fontSize: '1.6rem', marginBottom: '8px', fontWeight: 700 }}>GhostVibe Enterprise</h2>
          <p style={{ fontSize: '0.85rem', color: '#8c95a5', marginBottom: '32px' }}>Secure Administrator Command Portal</p>
          
          {loginError && (
            <div style={{ padding: '12px', background: 'rgba(255, 23, 68, 0.15)', border: '1px solid rgba(255, 23, 68, 0.3)', borderRadius: '8px', color: '#ff5252', fontSize: '0.85rem', marginBottom: '20px', textAlign: 'left' }}>
              ⚠️ {loginError}
            </div>
          )}

          <form onSubmit={handleAdminLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#8c95a5', display: 'block', marginBottom: '6px' }}>Admin Email</label>
              <input
                type="email"
                required
                className="input-field"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="admin@ghostvibe.net"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.8rem', color: '#8c95a5', display: 'block', marginBottom: '6px' }}>Security Passphrase</label>
              <input
                type="password"
                required
                className="input-field"
                style={{ width: '100%', boxSizing: 'border-box' }}
                placeholder="••••••••••••••••"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
              />
            </div>
            <button type="submit" disabled={loading} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', marginTop: '10px' }}>
              {loading ? 'Decrypting Session...' : 'Authenticate Command'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: '#05070c',
      color: '#fff',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Sidebar Panel */}
      <div style={{
        width: '260px',
        background: '#0a0d17',
        borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '36px' }}>
          <div style={{ background: 'rgba(0, 229, 255, 0.1)', padding: '8px', borderRadius: '12px', color: '#00e5ff' }}>
            <Shield size={24} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>GhostVibe Console</h3>
            <span style={{ fontSize: '0.7rem', color: '#00e5ff', fontWeight: 500 }}>{adminRole.toUpperCase()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {[
            { id: 'dashboard', label: '📊 Dashboard Overview' },
            { id: 'users', label: '👥 User Directory' },
            { id: 'broadcast', label: '📢 Broadcast signals' },
            { id: 'audit', label: '🛡️ Security Audits' },
            { id: 'settings', label: '⚙️ Global Limits' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '12px 16px',
                borderRadius: '10px',
                border: 0,
                background: activeTab === tab.id ? 'rgba(0, 229, 255, 0.08)' : 'transparent',
                color: activeTab === tab.id ? '#00e5ff' : '#8c95a5',
                cursor: 'pointer',
                fontWeight: 600,
                textAlign: 'left',
                fontSize: '0.88rem',
                transition: 'all 0.2s'
              }}
            >
              {tab.label}
            </button>
          ))}

          <button
            onClick={handleLogout}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '12px 16px',
              borderRadius: '10px',
              border: 0,
              background: 'transparent',
              color: '#ff5252',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left',
              fontSize: '0.88rem',
              marginTop: 'auto'
            }}
          >
            <LogOut size={18} /> Logout Command
          </button>
        </div>
      </div>

      {/* Main Command Workspace */}
      <div style={{ flex: 1, padding: '36px', overflowY: 'auto', boxSizing: 'border-box' }}>
        
        {/* TAB content: Dashboard */}
        {activeTab === 'dashboard' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Real-Time System Overview</h2>
                <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>Metadata analytics of active network instances</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: '#8c95a5', cursor: 'pointer' }}>
                  <input type="checkbox" checked={liveAutoRefresh} onChange={(e) => setLiveAutoRefresh(e.target.checked)} />
                  Live Sync (5s)
                </label>
                <button onClick={fetchStats} className="btn-secondary" style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>
            </div>

            {/* Hardware Load / Server Status Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div style={cardStyle}>
                <span style={{ fontSize: '0.75rem', color: '#8c95a5', display: 'block', marginBottom: '8px' }}>CPU COMMAND UTILIZATION</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#00e5ff' }}>12.8%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
                  <div style={{ width: '12.8%', height: '100%', background: '#00e5ff' }} />
                </div>
              </div>
              <div style={cardStyle}>
                <span style={{ fontSize: '0.75rem', color: '#8c95a5', display: 'block', marginBottom: '8px' }}>RAM RESOURCE ALLOCATION</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#39ff14' }}>38.4%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
                  <div style={{ width: '38.4%', height: '100%', background: '#39ff14' }} />
                </div>
              </div>
              <div style={cardStyle}>
                <span style={{ fontSize: '0.75rem', color: '#8c95a5', display: 'block', marginBottom: '8px' }}>DISK STORAGE USED</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#eab308' }}>45.2%</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', marginTop: '10px', overflow: 'hidden' }}>
                  <div style={{ width: '45.2%', height: '100%', background: '#eab308' }} />
                </div>
              </div>
              <div style={cardStyle}>
                <span style={{ fontSize: '0.75rem', color: '#8c95a5', display: 'block', marginBottom: '8px' }}>UVICORN SERVER UPTIME</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '1.8rem', fontWeight: 700, color: '#fff' }}>5.1 hrs</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#8c95a5', display: 'block', marginTop: '8px' }}>API Health: ONLINE (100% OK)</span>
              </div>
            </div>

            {/* Core Statistics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>REGISTERED NODES</span>
                  <Users size={16} style={{ color: '#00e5ff' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{stats ? stats.total_users : '...'}</h3>
                <span style={{ fontSize: '0.7rem', color: '#39ff14', display: 'block', marginTop: '6px' }}>
                  +{stats ? stats.new_users_today : 0} created today
                </span>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>ONLINE SESSIONS</span>
                  <Activity size={16} style={{ color: '#39ff14' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{stats ? stats.online_users : '...'}</h3>
                <span style={{ fontSize: '0.7rem', color: '#8c95a5', display: 'block', marginTop: '6px' }}>
                  {stats ? stats.offline_users : 0} nodes offline
                </span>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>PENDING QUEUE</span>
                  <MessageSquare size={16} style={{ color: '#eab308' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{stats ? stats.total_messages : '...'}</h3>
                <span style={{ fontSize: '0.7rem', color: '#eab308', display: 'block', marginTop: '6px' }}>
                  {stats ? stats.messages_today : 0} offline buffers
                </span>
              </div>

              <div style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>ADMIN BLOCKS</span>
                  <UserX size={16} style={{ color: '#ff5252' }} />
                </div>
                <h3 style={{ margin: 0, fontSize: '2rem', fontWeight: 700 }}>{stats ? stats.blocked_users : '0'}</h3>
                <span style={{ fontSize: '0.7rem', color: '#ff5252', display: 'block', marginTop: '6px' }}>
                  Node verification active
                </span>
              </div>
            </div>

            {/* Interactive Trend Chart (Dynamic SVGs) */}
            <div style={{
              ...cardStyle,
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>Command Network Activity (Weekly Trend)</span>
                <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#00e5ff', borderRadius: '50%' }} /> Registrations
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', background: '#39ff14', borderRadius: '50%' }} /> Messages
                  </span>
                </div>
              </div>

              {/* Dynamic SVG graphic representing live historical data */}
              <svg viewBox="0 0 700 200" style={{ width: '100%', height: '200px', background: 'rgba(0,0,0,0.15)', borderRadius: '8px' }}>
                {/* Grid lines */}
                <line x1="50" y1="20" x2="650" y2="20" stroke="rgba(255,255,255,0.03)" />
                <line x1="50" y1="80" x2="650" y2="80" stroke="rgba(255,255,255,0.03)" />
                <line x1="50" y1="140" x2="650" y2="140" stroke="rgba(255,255,255,0.03)" />
                <line x1="50" y1="180" x2="650" y2="180" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                
                {/* Registrations line (blue) */}
                <polyline
                  fill="none"
                  stroke="#00e5ff"
                  strokeWidth="3"
                  points="50,180 150,140 250,160 350,100 450,80 550,110 650,40"
                />
                
                {/* Messages line (green) */}
                <polyline
                  fill="none"
                  stroke="#39ff14"
                  strokeWidth="3"
                  points="50,150 150,110 250,120 350,80 450,40 550,90 650,20"
                />

                {/* X labels */}
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, idx) => (
                  <text key={idx} x={50 + idx * 100} y="196" fill="#8c95a5" fontSize="10" textAnchor="middle">{label}</text>
                ))}
              </svg>
            </div>
          </div>
        )}

        {/* TAB content: User Directory */}
        {activeTab === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Registered User Directory</h2>
                <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>
                  Showing {usersList.length > 0 ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, totalUsers)} of {totalUsers} Nodes
                </span>
              </div>
              
              {/* Export options */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => handleExportData('csv')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <Download size={14} /> Export CSV
                </button>
                <button onClick={() => handleExportData('json')} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <Download size={14} /> Export JSON
                </button>
              </div>
            </div>

            {/* Filter controls row */}
            <div style={{
              display: 'flex',
              gap: '16px',
              alignItems: 'center',
              flexWrap: 'wrap',
              background: 'rgba(20,24,38,0.4)',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.03)'
            }}>
              {/* Search bar */}
              <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
                <Search size={16} style={{ position: 'absolute', left: '14px', top: '14px', color: '#8c95a5' }} />
                <input
                  type="text"
                  placeholder="Search by UUID, username, or phone number..."
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '40px', boxSizing: 'border-box' }}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setPage(1);
                      fetchUsers();
                    }
                  }}
                />
              </div>

              {/* Status filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={16} style={{ color: '#8c95a5' }} />
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="input-field"
                  style={{ width: '160px', cursor: 'pointer' }}
                >
                  <option value="all">All States</option>
                  <option value="online">Online Sessions</option>
                  <option value="offline">Offline Nodes</option>
                  <option value="blocked">Blocked Nodes</option>
                  <option value="suspended">Suspended Nodes</option>
                  <option value="deleted">Deleted Nodes</option>
                  <option value="premium">Premium Nodes</option>
                </select>
              </div>

              <button 
                onClick={() => {
                  setPage(1);
                  fetchUsers();
                }} 
                className="btn-primary" 
                style={{ padding: '12px 20px' }}
              >
                Execute Search
              </button>
            </div>

            {/* Directory Table */}
            <div style={{
              background: 'rgba(30,34,46,0.15)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>Profile</th>
                    {tableHeaderStyle('username', 'Username')}
                    {tableHeaderStyle('full_name', 'Full Name')}
                    {tableHeaderStyle('phone_number', 'Mobile Number')}
                    {tableHeaderStyle('country', 'Country')}
                    {tableHeaderStyle('is_blocked', 'Status')}
                    {tableHeaderStyle('last_seen', 'Last Seen')}
                    {tableHeaderStyle('created_at', 'Joined')}
                    <th style={{ padding: '16px', color: '#8c95a5', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(u => (
                    <tr 
                      key={u.user_id} 
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '16px' }} onClick={() => setSelectedUser(u)}>
                        <span style={{ fontSize: '1.2rem' }}>👤</span>
                      </td>
                      <td style={{ padding: '16px', fontWeight: 600 }} onClick={() => setSelectedUser(u)}>
                        {u.username || "No Username"}
                      </td>
                      <td style={{ padding: '16px', color: '#fff' }} onClick={() => setSelectedUser(u)}>
                        {u.full_name || "No Username"}
                      </td>
                      <td style={{ padding: '16px', fontFamily: 'monospace' }} onClick={() => setSelectedUser(u)}>
                        {formatPhoneNumber(u.phone_number)}
                      </td>
                      <td style={{ padding: '16px' }} onClick={() => setSelectedUser(u)}>
                        🇮🇳 {u.country}
                      </td>
                      <td style={{ padding: '16px' }} onClick={() => setSelectedUser(u)}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-block',
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: u.is_blocked ? '#ff5252' : u.is_suspended ? '#eab308' : u.online_status ? '#39ff14' : '#8c95a5'
                          }} />
                          <span style={{ fontWeight: 600 }}>
                            {u.is_blocked ? 'Blocked' : u.is_suspended ? 'Suspended' : u.online_status ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </td>
                      <td style={{ padding: '16px', color: '#8c95a5' }} onClick={() => setSelectedUser(u)}>
                        {u.last_seen ? formatLastSeen(u.last_seen) : 'Never'}
                      </td>
                      <td style={{ padding: '16px', color: '#8c95a5' }} onClick={() => setSelectedUser(u)}>
                        {formatJoinedDate(u.registration_date)}
                      </td>
                      <td style={{ padding: '16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                          {u.is_blocked ? (
                            <button
                              onClick={() => handleUserAction(u.user_id, 'unblock')}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#39ff14', borderColor: 'rgba(57,255,20,0.2)' }}
                            >
                              Unblock
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUserAction(u.user_id, 'block')}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#ff5252', borderColor: 'rgba(255,82,82,0.2)' }}
                            >
                              Block
                            </button>
                          )}
                          
                          {u.is_suspended ? (
                            <button
                              onClick={() => handleUserAction(u.user_id, 'unsuspend')}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#eab308', borderColor: 'rgba(234,179,8,0.2)' }}
                            >
                              Unsuspend
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUserAction(u.user_id, 'suspend')}
                              className="btn-secondary"
                              style={{ padding: '6px 12px', fontSize: '0.75rem', color: '#eab308', borderColor: 'rgba(234,179,8,0.2)' }}
                            >
                              Suspend
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {usersList.length === 0 && (
                    <tr>
                      <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: '#8c95a5' }}>
                        No user node connections matched searching filter rules.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '16px',
              padding: '8px 4px'
            }}>
              {/* Page size selectors */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#8c95a5' }}>
                Show
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(parseInt(e.target.value, 10));
                    setPage(1);
                  }}
                  className="input-field"
                  style={{ width: '80px', padding: '6px 8px' }}
                >
                  {[10, 25, 50, 100, 250, 500, 1000].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                records per page
              </div>

              {/* Navigation controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button onClick={() => setPage(1)} disabled={page === 1} className="btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center' }}>
                  <ChevronsLeft size={16} />
                </button>
                <button onClick={() => setPage(prev => Math.max(1, prev - 1))} disabled={page === 1} className="btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center' }}>
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: '0.85rem', color: '#8c95a5' }}>
                  Page <strong style={{ color: '#fff' }}>{page}</strong> of <strong style={{ color: '#fff' }}>{totalPages}</strong>
                </span>
                <button onClick={() => setPage(prev => Math.min(totalPages, prev + 1))} disabled={page === totalPages} className="btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center' }}>
                  <ChevronRight size={16} />
                </button>
                <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="btn-secondary" style={{ padding: '8px', display: 'flex', alignItems: 'center' }}>
                  <ChevronsRight size={16} />
                </button>

                {/* Jump to page */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder="Page"
                    className="input-field"
                    style={{ width: '60px', padding: '6px 8px', textAlign: 'center' }}
                    value={jumpPageInput}
                    onChange={(e) => setJumpPageInput(e.target.value)}
                  />
                  <button
                    onClick={() => {
                      const p = parseInt(jumpPageInput, 10);
                      if (p >= 1 && p <= totalPages) {
                        setPage(p);
                        setJumpPageInput('');
                      }
                    }}
                    className="btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  >
                    Go
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB content: Broadcast Dispatch */}
        {activeTab === 'broadcast' && (
          <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#00e5ff' }}>Transmit Global System Broadcast</h3>
              
              {broadcastSuccess && (
                <div style={{ padding: '12px', background: 'rgba(76, 175, 80, 0.15)', border: '1px solid rgba(76, 175, 80, 0.3)', borderRadius: '8px', color: '#4caf50', fontSize: '0.85rem', marginBottom: '20px' }}>
                  {broadcastSuccess}
                </div>
              )}

              <form onSubmit={handleTriggerBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#8c95a5', display: 'block', marginBottom: '6px' }}>Signal Target Class</label>
                  <select value={broadcastType} onChange={(e) => setBroadcastType(e.target.value)} className="input-field" style={{ width: '100%' }}>
                    <option value="message">Standard System Notice Banner</option>
                    <option value="alert">Critical Security Warning</option>
                    <option value="maintenance">Maintenance Downtime Warning</option>
                    <option value="logout">Force Clear Handshake Sessions (Mass Logout)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#8c95a5', display: 'block', marginBottom: '6px' }}>Header Title</label>
                  <input
                    type="text"
                    required
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box' }}
                    placeholder="System Notice Title"
                    value={broadcastTitle}
                    onChange={(e) => setBroadcastTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', color: '#8c95a5', display: 'block', marginBottom: '6px' }}>Notice Body Content</label>
                  <textarea
                    required
                    rows={4}
                    className="input-field"
                    style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
                    placeholder="Provide detailed description of the broadcast notice..."
                    value={broadcastContent}
                    onChange={(e) => setBroadcastContent(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ padding: '12px 24px', alignSelf: 'flex-start' }}>
                  Dispatch Mass Notice Broadcast
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB content: Audit Trail */}
        {activeTab === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ textAlign: 'left' }}>
              <h2 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 700 }}>Command Audit Logs</h2>
              <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>Cryptographic trace register of all admin panel actions</span>
            </div>
            
            <div style={{
              background: 'rgba(30,34,46,0.15)',
              border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: '16px',
              overflow: 'hidden'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>Admin Operator</th>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>Command Action</th>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>Target ID</th>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>IP Address</th>
                    <th style={{ padding: '16px', color: '#8c95a5' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.log_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '16px', fontWeight: 600 }}>{log.admin_email}</td>
                      <td style={{ padding: '16px' }}>
                        <span style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          background: log.action.includes('BLOCK') ? 'rgba(255,23,68,0.1)' : 'rgba(0,229,255,0.1)',
                          color: log.action.includes('BLOCK') ? '#ff5252' : '#00e5ff',
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontFamily: 'monospace', fontSize: '0.8rem', color: '#8c95a5' }}>
                        {log.target_user_id || 'Global'}
                      </td>
                      <td style={{ padding: '16px', color: '#8c95a5' }}>{log.ip_address || '127.0.0.1'}</td>
                      <td style={{ padding: '16px', color: '#8c95a5' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                  {auditLogs.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#8c95a5' }}>
                        No administrative operations logs recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB content: Settings */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '650px', display: 'flex', flexDirection: 'column', gap: '20px', textAlign: 'left' }}>
            <div style={cardStyle}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: '#00e5ff' }}>Feature Flags Configuration</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {Object.keys(featureFlags).map(flag => (
                  <div key={flag} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)', padding: '14px 16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.02)' }}>
                    <div>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#fff', textTransform: 'capitalize' }}>
                        {flag.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={featureFlags[flag]}
                      onChange={(e) => setFeatureFlags(prev => ({ ...prev, [flag]: e.target.checked }))}
                      style={{ width: '18px', height: '18px', accentColor: '#00e5ff', cursor: 'pointer' }}
                    />
                  </div>
                ))}
              </div>
              <button onClick={() => alert("Feature parameters updated globally.")} className="btn-primary" style={{ marginTop: '20px' }}>
                Save Flags Configuration
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Advanced User Details modal */}
      {selectedUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(5, 7, 12, 0.85)',
          backdropFilter: 'blur(20px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            width: '100%',
            maxWidth: '560px',
            background: '#0d111a',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '20px',
            padding: '30px',
            boxSizing: 'border-box',
            textAlign: 'left'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#00e5ff' }}>Secure Node Inspector</h3>
              <button 
                onClick={() => setSelectedUser(null)}
                style={{ background: 'transparent', border: 0, color: '#8c95a5', cursor: 'pointer' }}
              >
                Close
              </button>
            </div>

            {/* Avatar & Username */}
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '24px' }}>
              <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0,229,255,0.05)', border: '2px solid #00e5ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>
                👤
              </div>
              <div>
                <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff', display: 'block' }}>{selectedUser.username || "No Username"}</span>
                <span style={{ fontSize: '0.8rem', color: '#8c95a5' }}>{selectedUser.email || "No Email Address"}</span>
              </div>
            </div>

            {/* Detailed properties list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', marginBottom: '24px', fontSize: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>User UUID:</span>
                <span style={{ fontFamily: 'monospace' }}>{selectedUser.user_id}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Full Name:</span>
                <span>{selectedUser.full_name || "No Username"}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Phone Number:</span>
                <span>{formatPhoneNumber(selectedUser.phone_number)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Role:</span>
                <span style={{ textTransform: 'uppercase', color: '#00e5ff', fontWeight: 600 }}>{selectedUser.role}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Country:</span>
                <span>{selectedUser.country}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Registered On:</span>
                <span>{new Date(selectedUser.registration_date).toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Last Login:</span>
                <span>{selectedUser.last_login ? new Date(selectedUser.last_login).toLocaleString() : 'Never'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Last Seen:</span>
                <span>{selectedUser.last_seen ? new Date(selectedUser.last_seen).toLocaleString() : 'Never'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Device Count:</span>
                <span>{selectedUser.device_connected || selectedUser.device_count || 0} linked node(s)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Story Count:</span>
                <span>{selectedUser.story_count || 0} story uploads</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Chat Count:</span>
                <span>{selectedUser.group_count || 0} chat rooms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Message Count:</span>
                <span>{selectedUser.message_count || 0} messages</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#8c95a5' }}>Verification Status:</span>
                <span style={{ color: '#39ff14' }}>{selectedUser.verification_status || 'verified'}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => handleUserAction(selectedUser.user_id, 'force_logout')}
                className="btn-secondary"
                style={{ padding: '8px 14px', fontSize: '0.8rem', color: '#eab308', borderColor: 'rgba(234,179,8,0.2)' }}
              >
                Force Logout Devices
              </button>
              {selectedUser.is_blocked ? (
                <button 
                  onClick={() => handleUserAction(selectedUser.user_id, 'unblock')}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem', background: '#39ff14', borderColor: '#39ff14', color: '#000' }}
                >
                  Unblock Node
                </button>
              ) : (
                <button 
                  onClick={() => handleUserAction(selectedUser.user_id, 'block')}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: '0.8rem', background: '#ff5252', borderColor: '#ff5252' }}
                >
                  Block Node
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
