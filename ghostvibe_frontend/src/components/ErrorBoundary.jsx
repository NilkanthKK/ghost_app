import React from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Caught runtime React component crash:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    try {
      localStorage.clear();
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          height: '100vh',
          width: '100vw',
          background: 'radial-gradient(circle at 50% 0%, #1a0f1a 0%, #09090b 80%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontFamily: 'Outfit, Inter, sans-serif',
          padding: '20px'
        }}>
          <div className="glass-panel pulse-glow" style={{
            width: '100%',
            maxWidth: '460px',
            padding: '40px 30px',
            border: '1px solid #ff1744',
            boxShadow: '0 0 30px rgba(255, 23, 68, 0.15)',
            borderRadius: '16px',
            textAlign: 'center',
            background: 'rgba(20, 10, 15, 0.95)'
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'rgba(255, 23, 68, 0.1)',
              border: '2px solid #ff1744',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px auto',
              color: '#ff1744'
            }}>
              <ShieldAlert size={36} />
            </div>
            <h2 style={{ color: '#ff1744', fontSize: '1.6rem', marginBottom: '10px' }}>Secure Shield Recovery</h2>
            <p style={{ color: '#90a4ae', fontSize: '0.85rem', marginBottom: '24px', lineHeight: '1.5' }}>
              A cryptographic memory fault or component rendering exception occurred. The system has intercepted the crash to prevent data corruption.
            </p>
            
            <div style={{
              textAlign: 'left',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              color: '#ffa726',
              maxHeight: '120px',
              overflowY: 'auto',
              marginBottom: '24px'
            }}>
              {this.state.error && this.state.error.toString()}
              {this.state.errorInfo && this.state.errorInfo.componentStack}
            </div>

            <button 
              onClick={this.handleReset}
              className="btn-primary" 
              style={{
                width: '100%',
                justifyContent: 'center',
                padding: '12px',
                background: 'linear-gradient(135deg, #ff1744, #d50000)',
                color: '#fff',
                boxShadow: '0 0 15px rgba(255, 23, 68, 0.3)'
              }}
            >
              <RotateCcw size={16} /> Force Session Recovery & Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
