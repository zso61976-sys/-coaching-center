'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api';

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface Settings {
  enabled: boolean;
  countryCode: string;
  timeZone: string;
}

interface StatusData {
  status: ConnectionStatus;
  qr: string | null;
  phone: string | null;
  settings: Settings;
}

interface MessageLog {
  id: string;
  studentName: string | null;
  parentName: string | null;
  phone: string;
  messageType: string;
  status: string;
  errorText: string | null;
  createdAt: string;
}

const TIME_ZONES = [
  { value: 'Asia/Dubai', label: 'UAE / Oman (GMT+4)' },
  { value: 'Asia/Karachi', label: 'Pakistan (GMT+5)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia / Qatar / Kuwait (GMT+3)' },
  { value: 'Asia/Kolkata', label: 'India (GMT+5:30)' },
  { value: 'Asia/Dhaka', label: 'Bangladesh (GMT+6)' },
];

const STATUS_STYLES: Record<ConnectionStatus, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-green-100 text-green-800' },
  qr: { label: 'Waiting for scan', className: 'bg-yellow-100 text-yellow-800' },
  connecting: { label: 'Connecting...', className: 'bg-blue-100 text-blue-800' },
  disconnected: { label: 'Not connected', className: 'bg-gray-100 text-gray-700' },
};

export default function WhatsappPage() {
  const { token } = useAuth();
  const [data, setData] = useState<StatusData | null>(null);
  const [settingsForm, setSettingsForm] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [testPhone, setTestPhone] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const request = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await fetch(`${API_URL}/admin/whatsapp${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(json.message) ? json.message.join(', ') : json.message;
        throw new Error(msg || 'Request failed');
      }
      return json;
    },
    [token],
  );

  const loadStatus = useCallback(async () => {
    if (!token) return;
    try {
      const json = await request('/status');
      setData(json.data);
      setSettingsForm((prev) => prev ?? json.data.settings);
    } catch (err) {
      console.error('Failed to load WhatsApp status:', err);
    }
  }, [token, request]);

  const loadLogs = useCallback(async () => {
    if (!token) return;
    try {
      const json = await request('/logs');
      setLogs(json.data);
    } catch (err) {
      console.error('Failed to load WhatsApp logs:', err);
    }
  }, [token, request]);

  useEffect(() => {
    loadStatus();
    loadLogs();
  }, [loadStatus, loadLogs]);

  // Poll while a QR code is shown or a connection is being made
  useEffect(() => {
    if (data?.status !== 'qr' && data?.status !== 'connecting') return;
    const timer = setInterval(loadStatus, 3000);
    return () => clearInterval(timer);
  }, [data?.status, loadStatus]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (err: unknown) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Something went wrong' });
    } finally {
      setBusy(false);
    }
  };

  const handleConnect = () =>
    run(async () => {
      await request('/connect', 'POST');
      await loadStatus();
    });

  const handleLogout = () =>
    run(async () => {
      await request('/logout', 'POST');
      await loadStatus();
      setMessage({ ok: true, text: 'WhatsApp disconnected' });
    });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    run(async () => {
      const json = await request('/settings', 'PUT', settingsForm);
      setSettingsForm(json.data);
      await loadStatus();
      setMessage({ ok: true, text: 'Settings saved' });
    });
  };

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const json = await request('/test', 'POST', { phone: testPhone });
      setMessage({ ok: true, text: `Test message sent to +${json.phone}` });
    });
  };

  if (!data || !settingsForm) {
    return <div className="text-gray-600">Loading WhatsApp settings...</div>;
  }

  const statusStyle = STATUS_STYLES[data.status];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">WhatsApp Notifications</h2>
        <p className="text-gray-600 text-sm mt-1">
          Parents get a WhatsApp message when their child checks in or out (fingerprint or kiosk).
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Connection */}
        <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">Connection</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusStyle.className}`}>
              {statusStyle.label}
            </span>
          </div>

          {data.status === 'connected' && (
            <>
              <p className="text-gray-700">
                Sending from <span className="font-mono font-medium">+{data.phone}</span>
              </p>
              <button
                onClick={handleLogout}
                disabled={busy}
                className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Disconnect WhatsApp
              </button>
            </>
          )}

          {data.status === 'qr' && data.qr && (
            <div className="space-y-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.qr} alt="WhatsApp QR code" className="w-64 h-64 border rounded-lg" />
              <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1">
                <li>Open WhatsApp on the phone you want to send from</li>
                <li>Tap Settings (or ⋮) → Linked devices → Link a device</li>
                <li>Scan this code. It refreshes automatically.</li>
              </ol>
            </div>
          )}

          {data.status === 'connecting' && (
            <p className="text-gray-600 text-sm">Connecting to WhatsApp, please wait...</p>
          )}

          {data.status === 'disconnected' && (
            <>
              <p className="text-gray-600 text-sm">
                Link a WhatsApp number to start sending messages to parents.
              </p>
              <button
                onClick={handleConnect}
                disabled={busy}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                Connect WhatsApp
              </button>
            </>
          )}

          <p className="text-xs text-gray-500 border-t pt-3">
            Tip: use a separate number for the center. Automated messages from a personal number
            can get it restricted by WhatsApp.
          </p>
        </div>

        {/* Settings */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-xl shadow-sm p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-800">Settings</h3>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={settingsForm.enabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, enabled: e.target.checked })}
              className="w-5 h-5"
            />
            <span className="text-gray-800">Send check-in / check-out messages to parents</span>
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Country code</label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">+</span>
              <input
                type="text"
                value={settingsForm.countryCode}
                onChange={(e) =>
                  setSettingsForm({ ...settingsForm, countryCode: e.target.value.replace(/\D/g, '') })
                }
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="971"
                required
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Added to parent numbers that start with 0 (e.g. 0501234567 → +971501234567).
              971 = UAE, 92 = Pakistan.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time zone</label>
            <select
              value={settingsForm.timeZone}
              onChange={(e) => setSettingsForm({ ...settingsForm, timeZone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            >
              {!TIME_ZONES.some((tz) => tz.value === settingsForm.timeZone) && (
                <option value={settingsForm.timeZone}>{settingsForm.timeZone}</option>
              )}
              {TIME_ZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">Used for the time shown in messages.</p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save Settings
          </button>
        </form>
      </div>

      {/* Test message */}
      <form onSubmit={handleTest} className="bg-white rounded-xl shadow-sm p-6 space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Send a test message</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="tel"
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
            placeholder="Phone number, e.g. 0501234567"
            required
          />
          <button
            type="submit"
            disabled={busy || data.status !== 'connected'}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Send Test
          </button>
        </div>
        {data.status !== 'connected' && (
          <p className="text-xs text-gray-500">Connect WhatsApp first.</p>
        )}
      </form>

      {/* Message log */}
      <div className="bg-white rounded-xl shadow-sm">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">Recent messages</h3>
          <button onClick={loadLogs} className="text-sm text-indigo-600 hover:text-indigo-800">
            Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Time', 'Student', 'Parent', 'Phone', 'Type', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-900">{log.studentName}</td>
                  <td className="px-4 py-3 text-gray-600">{log.parentName}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{log.phone}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {log.messageType === 'checkin' ? 'Check-in' : 'Check-out'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.status === 'sent'
                          ? 'bg-green-100 text-green-800'
                          : log.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
                      title={log.errorText || undefined}
                    >
                      {log.status}
                    </span>
                    {log.errorText && log.status !== 'sent' && (
                      <div className="text-xs text-red-600 mt-1">{log.errorText}</div>
                    )}
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No messages yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
