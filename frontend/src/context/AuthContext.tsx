import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'DONOR' | 'NGO' | 'REVIEWER';

interface AuthContextType {
  role: UserRole;
  setRole: (role: UserRole) => void;
  token?: string;
  userName: string;
  organizationId: string;
  organizationName: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [role, setRole] = useState<UserRole>('DONOR');

  const getUserDetails = () => {
    switch (role) {
      case 'NGO':
        return {
          userName: 'Bal Vikas Trust (Admin)',
          organizationId: '1',
          organizationName: 'Bal Vikas Trust',
          token: 'mock-oidc-ngo-token',
        };
      case 'REVIEWER':
        return {
          userName: 'Prof. S. K. Kulkarni (IRB)',
          organizationId: 'platform',
          organizationName: 'Institutional Review Board',
          token: 'mock-oidc-reviewer-token',
        };
      case 'DONOR':
      default:
        return {
          userName: 'Anonymous / Guest Donor',
          organizationId: '',
          organizationName: '',
          token: undefined,
        };
    }
  };

  const details = getUserDetails();

  return (
    <AuthContext.Provider
      value={{
        role,
        setRole,
        token: details.token,
        userName: details.userName,
        organizationId: details.organizationId,
        organizationName: details.organizationName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
