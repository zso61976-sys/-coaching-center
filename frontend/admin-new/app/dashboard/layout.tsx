'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, company, isLoading, isAuthenticated, isSuperAdmin, logout, hasRole, hasModuleAccess } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/');
    } else if (!isLoading && isSuperAdmin) {
      router.push('/super-admin');
    }
  }, [isLoading, isAuthenticated, isSuperAdmin, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!isAuthenticated || isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-green-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">Attendance System</h1>
              {company && (
                <p className="text-green-200 text-sm">
                  {company.name} ({company.code})
                </p>
              )}
            </div>
            <div className="flex gap-4 items-center">
              <Link href="/dashboard" className="hover:underline">
                Dashboard
              </Link>
              {hasRole('admin') && (
                <Link href="/dashboard/users" className="hover:underline">
                  Users
                </Link>
              )}
              {hasModuleAccess('biometric') && (
                <Link href="/dashboard/biometric" className="hover:underline">
                  Biometric
                </Link>
              )}
              <div className="flex items-center gap-3 ml-4 border-l border-green-500 pl-4">
                <div className="text-right">
                  <p className="text-sm font-medium">{user?.full_name}</p>
                  <p className="text-xs text-green-200 capitalize">{user?.role}</p>
                </div>
                <button
                  onClick={logout}
                  className="bg-green-700 px-3 py-1 rounded hover:bg-green-800 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto p-6">{children}</main>
    </div>
  );
}
