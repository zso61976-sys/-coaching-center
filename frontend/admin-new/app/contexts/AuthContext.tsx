'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  permissions?: string[];
  is_super_admin: boolean;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  company: Company | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  login: (token: string, user: User, company?: Company) => void;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  hasRole: (minRole: string) => boolean;
  hasModuleAccess: (module: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ROLE_HIERARCHY: Record<string, number> = {
  super_admin: 100,
  admin: 80,
  manager: 60,
  staff: 40,
  viewer: 20,
};

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  admin: [
    'students:read', 'students:create', 'students:update', 'students:delete',
    'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete',
    'attendance:read', 'attendance:create',
    'accounts:read', 'accounts:manage',
    'users:read', 'users:manage',
  ],
  manager: [
    'students:read', 'students:create', 'students:update', 'students:delete',
    'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete',
    'attendance:read', 'attendance:create',
    'accounts:read', 'accounts:manage',
  ],
  staff: [
    'students:read', 'students:create', 'students:update',
    'teachers:read',
    'attendance:read', 'attendance:create',
  ],
  viewer: [
    'students:read',
    'teachers:read',
    'attendance:read',
    'accounts:read',
  ],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    // Load auth state from localStorage on mount
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      const storedCompany = localStorage.getItem('company');

      if (storedToken && storedUser) {
        setToken(storedToken);
        try {
          setUser(JSON.parse(storedUser));
          if (storedCompany) {
            setCompany(JSON.parse(storedCompany));
          }
        } catch (e) {
          // Invalid JSON in localStorage, clear it
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('company');
        }
      }
    }
    setIsLoading(false);
  }, []);

  const login = (newToken: string, newUser: User, newCompany?: Company) => {
    setToken(newToken);
    setUser(newUser);
    setCompany(newCompany || null);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    if (newCompany) {
      localStorage.setItem('company', JSON.stringify(newCompany));
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setCompany(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('company');
    router.push('/');
  };

  const hasPermission = (permission: string): boolean => {
    if (!user) return false;
    const permissions = ROLE_PERMISSIONS[user.role] || [];
    return permissions.includes('*') || permissions.includes(permission);
  };

  const hasRole = (minRole: string): boolean => {
    if (!user) return false;
    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;
    return userLevel >= requiredLevel;
  };

  const hasModuleAccess = (module: string): boolean => {
    if (!user) return false;
    // Admin and super_admin have access to all modules
    if (user.role === 'admin' || user.role === 'super_admin') return true;
    // Check user's custom permissions
    const userPermissions = user.permissions || [];
    return userPermissions.includes(module);
  };

  // Prevent hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          company: null,
          token: null,
          isLoading: true,
          isAuthenticated: false,
          isSuperAdmin: false,
          login,
          logout,
          hasPermission: () => false,
          hasRole: () => false,
          hasModuleAccess: () => false,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        company,
        token,
        isLoading,
        isAuthenticated: !!token && !!user,
        isSuperAdmin: user?.is_super_admin || false,
        login,
        logout,
        hasPermission,
        hasRole,
        hasModuleAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
