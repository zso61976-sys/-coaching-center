'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  href: string;
  label: string;
  icon: string;
  show: boolean;
  isActive: (pathname: string, tab: string | null) => boolean;
}

function Sidebar({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = searchParams.get('tab');
  const { hasRole, hasModuleAccess } = useAuth();

  const tabItem = (id: string, label: string, icon: string, module: string): NavItem => ({
    href: `/dashboard?tab=${id}`,
    label,
    icon,
    show: hasModuleAccess(module),
    isActive: (path, current) => path === '/dashboard' && current === id,
  });

  const sections: NavItem[][] = [
    [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: '📊',
        show: true,
        isActive: (path, current) => path === '/dashboard' && (!current || current === 'overview'),
      },
      tabItem('students', 'Students', '🎓', 'students'),
      tabItem('subjects', 'Subjects', '📚', 'students'),
      tabItem('teachers', 'Teachers', '👩‍🏫', 'teachers'),
      tabItem('accounts', 'Accounts', '💰', 'accounts'),
      tabItem('reports', 'Attendance Reports', '📋', 'reports'),
    ],
    [
      {
        href: '/dashboard/biometric',
        label: 'Biometric',
        icon: '🖐️',
        show: hasModuleAccess('biometric'),
        isActive: (path) => path.startsWith('/dashboard/biometric'),
      },
      {
        href: '/dashboard/whatsapp',
        label: 'WhatsApp',
        icon: '💬',
        show: hasRole('admin'),
        isActive: (path) => path.startsWith('/dashboard/whatsapp'),
      },
      {
        href: '/dashboard/users',
        label: 'Users',
        icon: '👥',
        show: hasRole('admin'),
        isActive: (path) => path.startsWith('/dashboard/users'),
      },
    ],
  ];

  return (
    <nav className="flex-1 overflow-y-auto py-4">
      {sections.map((items, i) => {
        const visible = items.filter((item) => item.show);
        if (visible.length === 0) return null;
        return (
          <div key={i} className={i > 0 ? 'mt-4 pt-4 border-t border-green-600' : ''}>
            {visible.map((item) => {
              const active = item.isActive(pathname, tab);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  className={`flex items-center gap-3 mx-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    active ? 'bg-white text-green-800 shadow-sm' : 'text-green-50 hover:bg-green-600'
                  }`}
                >
                  <span className="text-base w-5 text-center" aria-hidden>
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, company, isLoading, isAuthenticated, isSuperAdmin, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="min-h-screen bg-gray-100 flex">
      {/* Mobile backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-green-700 text-white flex flex-col transform transition-transform lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-5 py-5 border-b border-green-600">
          <h1 className="text-lg font-bold">Attendance System</h1>
          {company && (
            <p className="text-green-200 text-sm truncate">
              {company.name} ({company.code})
            </p>
          )}
        </div>

        <Suspense fallback={<div className="flex-1" />}>
          <Sidebar onNavigate={() => setMenuOpen(false)} />
        </Suspense>

        <div className="px-5 py-4 border-t border-green-600 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{user?.full_name}</p>
            <p className="text-xs text-green-200 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="bg-green-800 px-3 py-1.5 rounded text-sm hover:bg-green-900 transition-colors"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden bg-green-700 text-white px-4 py-3 flex items-center gap-3 shadow">
          <button
            onClick={() => setMenuOpen(true)}
            className="text-2xl leading-none px-1"
            aria-label="Open menu"
          >
            ☰
          </button>
          <span className="font-semibold truncate">{company?.name || 'Attendance System'}</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 w-full max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
