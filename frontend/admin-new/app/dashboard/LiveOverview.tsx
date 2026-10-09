'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api';

const REFRESH_MS = 10000;
const DEVICE_ONLINE_MS = 5 * 60 * 1000;

type SimStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface DashboardStats {
  students: { total: number; active: number };
  attendance: { today_checkins: number; currently_checked_in: number };
}

interface Sim {
  id: string;
  label: string;
  enabled: boolean;
  role: 'balance' | 'backup';
  linked: boolean;
  status: SimStatus;
  phone: string | null;
  assignedParents: number;
  sentToday: number;
}

interface WhatsappStatus {
  accounts: Sim[];
  settings: { enabled: boolean };
  today: { sent: number; failed: number; pending: number };
}

interface MessageLog {
  id: string;
  studentName: string | null;
  messageType: string;
  status: string;
  accountLabel: string | null;
  createdAt: string;
}

interface Device {
  id: string;
  name: string;
  serialNumber: string;
  lastSyncAt: string | null;
}

const SIM_STATUS: Record<SimStatus, { label: string; dot: string; text: string }> = {
  connected: { label: 'Connected', dot: 'bg-green-500', text: 'text-green-700' },
  qr: { label: 'Waiting for QR scan', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  connecting: { label: 'Connecting...', dot: 'bg-blue-500', text: 'text-blue-700' },
  disconnected: { label: 'Offline', dot: 'bg-red-500', text: 'text-red-700' },
};

const MESSAGE_TYPES: Record<string, string> = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  welcome: 'Welcome',
};

function timeAgo(date: string | null) {
  if (!date) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(date).toLocaleDateString();
}

function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function LiveOverview() {
  const { token, hasRole, hasModuleAccess } = useAuth();
  const isAdmin = hasRole('admin');
  const canSeeDevices = hasModuleAccess('biometric');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappStatus | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [failed, setFailed] = useState(false);

  const get = useCallback(
    async (path: string) => {
      const res = await fetch(`${API_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${path} failed`);
      return (await res.json()).data;
    },
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const results = await Promise.allSettled([
      get('/admin/dashboard'),
      isAdmin ? get('/admin/whatsapp/status') : Promise.resolve(null),
      isAdmin ? get('/admin/whatsapp/logs') : Promise.resolve([]),
      canSeeDevices ? get('/admin/biometric/devices') : Promise.resolve(null),
    ]);
    const [s, w, l, d] = results;
    if (s.status === 'fulfilled') setStats(s.value);
    if (w.status === 'fulfilled') setWhatsapp(w.value);
    if (l.status === 'fulfilled') setLogs((l.value || []).slice(0, 8));
    if (d.status === 'fulfilled') setDevices(d.value);
    setFailed(results.every((r) => r.status === 'rejected'));
    setUpdatedAt(new Date());
  }, [token, get, isAdmin, canSeeDevices]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const sims = whatsapp?.accounts || [];
  const activeSims = sims.filter((s) => s.enabled && s.linked);
  const offlineSims = activeSims.filter((s) => s.status !== 'connected');
  const backupOnline = activeSims.some((s) => s.role === 'backup' && s.status === 'connected');
  const onlineDevices = (devices || []).filter(
    (d) => d.lastSyncAt && Date.now() - new Date(d.lastSyncAt).getTime() < DEVICE_ONLINE_MS,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Live monitoring</h2>
          <p className="text-sm text-gray-500">Refreshes automatically every 10 seconds</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="relative flex h-2.5 w-2.5">
            <span
              className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${
                failed ? 'bg-red-400' : 'bg-green-400 animate-ping'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                failed ? 'bg-red-500' : 'bg-green-500'
              }`}
            />
          </span>
          {failed ? 'Cannot reach server' : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}
        </div>
      </div>

      {/* Alerts */}
      {isAdmin && whatsapp && !whatsapp.settings.enabled && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
          WhatsApp check-in / check-out messages are turned off.{' '}
          <Link href="/dashboard/whatsapp" className="underline font-medium">Turn them on</Link>
        </div>
      )}
      {offlineSims.length > 0 && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          ⚠️ {offlineSims.map((s) => s.label).join(', ')} {offlineSims.length === 1 ? 'is' : 'are'} offline.
          {activeSims.length > offlineSims.length
            ? backupOnline
              ? ' The backup SIM is sending their messages.'
              : ' Their parents are being sent from the other connected SIMs.'
            : ' No WhatsApp messages can be sent right now.'}{' '}
          <Link href="/dashboard/whatsapp" className="underline font-medium">Open WhatsApp</Link>
        </div>
      )}
      {devices && devices.length > onlineDevices.length && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          ⚠️ {devices.length - onlineDevices.length} biometric device(s) offline.{' '}
          <Link href="/dashboard/biometric" className="underline font-medium">Open Biometric</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Checked in today" value={stats?.attendance.today_checkins ?? '–'} />
        <StatCard label="Inside right now" value={stats?.attendance.currently_checked_in ?? '–'} />
        {isAdmin ? (
          <StatCard
            label="WhatsApp sent today"
            value={whatsapp?.today.sent ?? '–'}
            hint={
              whatsapp
                ? `${whatsapp.today.failed} failed · ${whatsapp.today.pending} pending`
                : undefined
            }
          />
        ) : (
          <StatCard label="Active students" value={stats?.students.active ?? '–'} />
        )}
        <StatCard
          label="Devices online"
          value={devices ? `${onlineDevices.length} / ${devices.length}` : '–'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* WhatsApp SIMs */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">WhatsApp numbers</h3>
              <Link href="/dashboard/whatsapp" className="text-sm text-indigo-600 hover:text-indigo-800">
                Manage →
              </Link>
            </div>
            {sims.length === 0 ? (
              <p className="text-sm text-gray-500">
                No WhatsApp number linked yet.{' '}
                <Link href="/dashboard/whatsapp" className="text-indigo-600 underline">Add one</Link>
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {sims.map((sim) => {
                  const style = SIM_STATUS[sim.status];
                  return (
                    <li key={sim.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`h-3 w-3 rounded-full flex-shrink-0 ${sim.enabled ? style.dot : 'bg-gray-300'}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">
                            {sim.label}
                            {sim.role === 'backup' && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-xs font-normal">
                                Backup
                              </span>
                            )}
                            {sim.phone && <span className="font-mono text-gray-500 font-normal"> · +{sim.phone}</span>}
                          </p>
                          <p className={`text-xs ${sim.enabled ? style.text : 'text-gray-500'}`}>
                            {sim.enabled ? style.label : 'Paused'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500 flex-shrink-0">
                        <p>{sim.role === 'backup' ? 'covers all SIMs' : `${sim.assignedParents} parents`}</p>
                        <p>{sim.sentToday} sent today</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* Recent WhatsApp messages */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Latest WhatsApp messages</h3>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-500">No messages yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <li key={log.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-gray-800 truncate">
                        {MESSAGE_TYPES[log.messageType] || log.messageType} · {log.studentName}
                      </p>
                      <p className="text-xs text-gray-500">
                        {timeAgo(log.createdAt)}
                        {log.accountLabel ? ` · ${log.accountLabel}` : ''}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                        log.status === 'sent'
                          ? 'bg-green-100 text-green-800'
                          : log.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {log.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Biometric devices */}
        {canSeeDevices && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Biometric devices</h3>
              <Link href="/dashboard/biometric" className="text-sm text-indigo-600 hover:text-indigo-800">
                Manage →
              </Link>
            </div>
            {!devices || devices.length === 0 ? (
              <p className="text-sm text-gray-500">No devices registered.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {devices.map((device) => {
                  const online = onlineDevices.includes(device);
                  return (
                    <li key={device.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`h-3 w-3 rounded-full flex-shrink-0 ${online ? 'bg-green-500' : 'bg-red-500'}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 truncate">{device.name}</p>
                          <p className="text-xs text-gray-500 font-mono">{device.serialNumber}</p>
                        </div>
                      </div>
                      <div className="text-right text-xs flex-shrink-0">
                        <p className={online ? 'text-green-700' : 'text-red-700'}>{online ? 'Online' : 'Offline'}</p>
                        <p className="text-gray-500">Last seen {timeAgo(device.lastSyncAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
