/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AdminPortal from './components/AdminPortal.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

import { useState, useEffect } from 'react'

function RootElement() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (currentPath === '/admin' || currentPath.startsWith('/admin/')) {
    return <AdminPortal />;
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <RootElement />
    </ErrorBoundary>
  </StrictMode>,
)
