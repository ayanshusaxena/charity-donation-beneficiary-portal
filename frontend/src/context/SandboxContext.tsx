import React, { createContext, useContext, useState, useEffect } from 'react';

interface SandboxContextType {
  isSandbox: boolean;
  setIsSandbox: (val: boolean) => void;
  apiStatus: 'online' | 'offline' | 'checking';
  checkApiHealth: () => Promise<void>;
}

const SandboxContext = createContext<SandboxContextType | undefined>(undefined);

export const SandboxProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Check persisted mode or start in sandbox mode until health-check confirms online
  const [isSandbox, setIsSandboxState] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('donatekaro_mode');
        if (saved === 'live') return false;
        if (saved === 'sandbox') return true;
      }
    } catch {
      // ignore storage error
    }
    return true;
  });

  const [apiStatus, setApiStatus] = useState<'online' | 'offline' | 'checking'>('checking');

  const setIsSandbox = (val: boolean) => {
    setIsSandboxState(val);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('donatekaro_mode', val ? 'sandbox' : 'live');
      }
    } catch {
      // ignore storage error
    }
  };

  const checkApiHealth = async () => {
    setApiStatus('checking');
    try {
      const res = await fetch('/api/v1/campaigns?limit=1', { signal: AbortSignal.timeout(2500) });
      if (res.ok) {
        setApiStatus('online');
        // Live API Mode is the normal local development default when online
        // unless the user explicitly saved 'sandbox' preference
        try {
          const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('donatekaro_mode') : null;
          if (saved !== 'sandbox') {
            setIsSandboxState(false);
          }
        } catch {
          setIsSandboxState(false);
        }
      } else {
        setApiStatus('offline');
      }
    } catch {
      setApiStatus('offline');
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  return (
    <SandboxContext.Provider value={{ isSandbox, setIsSandbox, apiStatus, checkApiHealth }}>
      {children}
    </SandboxContext.Provider>
  );
};

export function useSandbox(): SandboxContextType {
  const context = useContext(SandboxContext);
  if (!context) {
    throw new Error('useSandbox must be used within a SandboxProvider');
  }
  return context;
}
