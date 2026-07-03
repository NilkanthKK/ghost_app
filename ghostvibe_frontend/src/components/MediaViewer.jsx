import React, { useEffect } from 'react';

export default function MediaViewer({ src, type = 'image', onClose }) {
  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const isVideo = type === 'video' || (src && src.startsWith('data:video/'));

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(5, 7, 12, 0.98)',
      backdropFilter: 'blur(15px)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      userSelect: 'none'
    }}>
      {/* Top bar control */}
      <div style={{
        position: 'absolute',
        top: '20px',
        right: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 10001
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.15)',
            color: '#fff',
            padding: '10px 20px',
            borderRadius: '24px',
            fontSize: '0.85rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'all 0.2s'
          }}
        >
          ✕ Close Media
        </button>
      </div>

      {/* Main viewer media wrapper */}
      <div style={{
        width: '100%',
        maxWidth: '850px',
        maxHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}>
        {isVideo ? (
          <video
            src={src}
            controls
            autoPlay
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.7)'
            }}
          />
        ) : (
          <img
            src={src}
            alt="View Once Content"
            style={{
              maxWidth: '100%',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 12px 36px rgba(0,0,0,0.7)'
            }}
          />
        )}
      </div>

      <div style={{
        marginTop: '20px',
        color: '#ff1744',
        fontSize: '0.85rem',
        fontWeight: 'bold',
        letterSpacing: '0.5px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(255,23,68,0.08)',
        padding: '8px 16px',
        borderRadius: '20px',
        border: '1px solid rgba(255,23,68,0.2)'
      }}>
        ⚠️ View Once: This media will be permanently deleted once closed.
      </div>
    </div>
  );
}
