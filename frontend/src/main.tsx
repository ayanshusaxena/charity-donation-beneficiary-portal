import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { SandboxProvider } from './context/SandboxContext';
import { AuthProvider } from './context/AuthContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SandboxProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </SandboxProvider>
  </React.StrictMode>
);
