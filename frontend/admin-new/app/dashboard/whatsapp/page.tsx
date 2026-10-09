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
  welcomeEnabled: boolean;
  countryCode: string;
  timeZone: string;
}

type SimRole = 'balance' | 'backup';

interface Account {
  id: string;
  label: string;
  enabled: boolean;
  role: SimRole;
  linked: boolean;
  status: ConnectionStatus;
  qr: string | null;
  phone: string | null;
  assignedParents: number;
  sentToday: number;
}

interface MessageLog {
  id: string;
  studentName: string | null;
  parentName: string | null;
  phone: string;
  messageType: string;
  status: string;
  errorText: string | null;
  accountLabel: string | null;
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

const MESSAGE_TYPES: Record<string, string> = {
  checkin: 'Check-in',
  checkout: 'Check-out',
  welcome: 'Welcome',
};

export default function WhatsappPage() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [settingsForm, setSettingsForm] = useState<Settings | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [testPhone, setTestPhone] = useState('');
  const [testAccountId, setTestAccountId] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; label: string } | null>(null);
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
      setAccounts(json.data.accounts);
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

  // Poll while any SIM shows a QR code or is connecting
  const waiting = accounts?.some((a) => a.status === 'qr' || a.status === 'connecting');
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(loadStatus, 3000);
    return () => clearInterval(timer);
  }, [waiting, loadStatus]);

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

  const handleAddSim = () =>
    run(async () => {
      await request('/accounts', 'POST', {});
      await loadStatus();
    });

  const handleConnect = (account: Account) =>
    run(async () => {
      await request(`/accounts/${account.id}/connect`, 'POST');
      await loadStatus();
    });

  const handleLogout = (account: Account) => {
    if (!window.confirm(`Disconnect ${account.label}? Its parents will be sent from your other SIMs until you scan it again.`)) return;
    run(async () => {
      await request(`/accounts/${account.id}/logout`, 'POST');
      await loadStatus();
      setMessage({ ok: true, text: `${account.label} disconnected` });
    });
  };

  const handleRemove = (account: Account) => {
    if (!window.confirm(`Remove ${account.label}? Its parents will be moved to your other SIMs.`)) return;
    run(async () => {
      await request(`/accounts/${account.id}`, 'DELETE');
      await loadStatus();
      setMessage({ ok: true, text: `${account.label} removed` });
    });
  };

  const handleToggle = (account: Account) =>
    run(async () => {
      await request(`/accounts/${account.id}`, 'PUT', { enabled: !account.enabled });
      await loadStatus();
    });

  const handleRole = (account: Account, role: SimRole) => {
    if (account.role === role) return;
    run(async () => {
      await request(`/accounts/${account.id}`, 'PUT', { role });
      await loadStatus();
      setMessage({
        ok: true,
        text:
          role === 'backup'
            ? `${account.label} is now a backup SIM. Its parents were moved to the balancing SIMs.`
            : `${account.label} is now a balancing SIM and has taken its share of parents.`,
      });
    });
  };

  const handleRename = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renaming) return;
    run(async () => {
      await request(`/accounts/${renaming.id}`, 'PUT', { label: renaming.label });
      setRenaming(null);
      await loadStatus();
    });
  };

  const handleRebalance = () =>
    run(async () => {
      const json = await request('/rebalance', 'POST');
      await loadStatus();
      setMessage({
        ok: true,
        text: `Parents spread evenly over your SIMs (${json.moved} of ${json.total} moved)`,
      });
    });

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm) return;
    run(async () => {
      const json = await request('/settings', 'PUT', settingsForm);
      setSettingsForm(json.data);
      setMessage({ ok: true, text: 'Settings saved' });
    });
  };

  const handlePendingWelcomes = () =>
    run(async () => {
      const json = await request('/welcome-pending', 'POST');
      await loadLogs();
      setMessage({
        ok: true,
        text: json.queued
          ? `Welcome message queued for ${json.queued} parent(s)`
          : 'All parents have already received the welcome message',
      });
    });

  const handleTest = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const json = await request('/test', 'POST', {
        phone: testPhone,
        accountId: testAccountId || undefined,
      });
      const sim = accounts?.find((a) => a.id === json.accountId)?.label;
      setMessage({ ok: true, text: `Test message sent to +${json.phone}${sim ? ` from ${sim}` : ''}` });
    });
  };

  if (!accounts || !settingsForm) {
    return <div className="text-gray-600">Loading WhatsApp settings...</div>;
  }

  const connectedCount = accounts.filter((a) => a.status === 'connected').length;
  const linkedCount = accounts.filter((a) => a.linked && a.enabled && a.role === 'balance').length;
  const backupOnline = accounts.some(
    (a) => a.role === 'backup' && a.enabled && a.status === 'connected',
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">WhatsApp Notifications</h2>
        <p className="text-gray-600 text-sm mt-1">
          Parents get a WhatsApp message when their child checks in or out (fingerprint or kiosk).
          Each parent is assigned to one SIM and always hears from the same number.
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

      {accounts.some((a) => a.linked && a.enabled && a.status !== 'connected' && a.status !== 'qr') && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          ⚠️ A SIM is offline. Its parents are being sent from{' '}
          {backupOnline ? 'the backup SIM' : 'your other connected SIMs'} until it is back.
        </div>
      )}

      {/* SIMs */}
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">WhatsApp numbers (SIMs)</h3>
            <p className="text-sm text-gray-500">
              {connectedCount} of {accounts.length} connected
            </p>
          </div>
          <div className="flex gap-2">
            {linkedCount > 1 && (
              <button
                onClick={handleRebalance}
                disabled={busy}
                className="px-4 py-2 border border-indigo-300 text-indigo-700 rounded-lg hover:bg-indigo-50 transition-colors disabled:opacity-50"
                title="Spread all parents evenly over the linked SIMs"
              >
                Rebalance parents
              </button>
            )}
            <button
              onClick={handleAddSim}
              disabled={busy}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
            >
              + Add SIM
            </button>
          </div>
        </div>

        {accounts.length === 0 && (
          <p className="text-gray-600 text-sm">
            No WhatsApp number yet. Click <strong>+ Add SIM</strong>, then scan the QR code with the phone.
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((account) => {
            const style = STATUS_STYLES[account.status];
            return (
              <div
                key={account.id}
                className={`border rounded-xl p-4 space-y-3 ${
                  account.enabled ? 'border-gray-200' : 'border-gray-200 bg-gray-50 opacity-75'
                }`}
              >
                <div className="flex justify-between items-start gap-2">
                  {renaming?.id === account.id ? (
                    <form onSubmit={handleRename} className="flex gap-2 flex-1">
                      <input
                        value={renaming.label}
                        onChange={(e) => setRenaming({ ...renaming, label: e.target.value })}
                        className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                        maxLength={100}
                        autoFocus
                      />
                      <button type="submit" className="text-sm text-indigo-600">Save</button>
                      <button type="button" onClick={() => setRenaming(null)} className="text-sm text-gray-500">
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      onClick={() => setRenaming({ id: account.id, label: account.label })}
                      className="font-semibold text-gray-800 hover:underline text-left"
                      title="Rename"
                    >
                      {account.label}
                    </button>
                  )}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${style.className}`}>
                    {account.enabled ? style.label : 'Paused'}
                  </span>
                </div>

                {account.phone && (
                  <p className="font-mono text-gray-700">+{account.phone}</p>
                )}

                <div className="flex gap-4 text-sm text-gray-600">
                  {account.role === 'backup' ? (
                    <span>🛟 Covers all SIMs</span>
                  ) : (
                    <span>👪 {account.assignedParents} parents</span>
                  )}
                  <span>📤 {account.sentToday} sent today</span>
                </div>

                <div className="space-y-1.5 border-t border-gray-100 pt-3">
                  {([
                    ['balance', 'Balancing SIM', 'Shares the parents equally with the other balancing SIMs'],
                    ['backup', 'Backup SIM', 'No parents of its own; sends when any balancing SIM is down'],
                  ] as const).map(([role, title, help]) => (
                    <label key={role} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={account.role === role}
                        onChange={() => handleRole(account, role)}
                        disabled={busy}
                        className="w-4 h-4 mt-0.5"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-gray-800">{title}</span>
                        <span className="block text-xs text-gray-500">{help}</span>
                      </span>
                    </label>
                  ))}
                </div>

                {account.status === 'qr' && account.qr && (
                  <div className="space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={account.qr} alt="WhatsApp QR code" className="w-56 h-56 border rounded-lg" />
                    <p className="text-xs text-gray-600">
                      On the phone: WhatsApp → Settings (or ⋮) → Linked devices → Link a device, then scan.
                    </p>
                  </div>
                )}

                {account.status === 'connecting' && (
                  <p className="text-sm text-gray-600">Connecting to WhatsApp...</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {account.status === 'disconnected' && (
                    <button
                      onClick={() => handleConnect(account)}
                      disabled={busy}
                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
                    >
                      {account.linked ? 'Reconnect' : 'Connect (scan QR)'}
                    </button>
                  )}
                  {account.status === 'connected' && (
                    <button
                      onClick={() => handleLogout(account)}
                      disabled={busy}
                      className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                  <button
                    onClick={() => handleToggle(account)}
                    disabled={busy}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    {account.enabled ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleRemove(account)}
                    disabled={busy}
                    className="px-3 py-1.5 text-red-600 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 border-t pt-3">
          Parents are spread evenly over the balancing SIMs automatically whenever a SIM is connected,
          paused, removed or changes role. A backup SIM sends for any balancing SIM that is down. Each
          phone must open WhatsApp at least once every 14 days, or WhatsApp unlinks it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settingsForm.welcomeEnabled}
              onChange={(e) => setSettingsForm({ ...settingsForm, welcomeEnabled: e.target.checked })}
              className="w-5 h-5 mt-0.5"
            />
            <span className="text-gray-800">
              Send a welcome message when a student is added or a parent mobile changes
              <span className="block text-xs text-gray-500">
                Asks the parent to save the number and not to reply.
              </span>
            </span>
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
          </div>

          <button
            type="submit"
            disabled={busy}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            Save Settings
          </button>
        </form>

        <div className="space-y-6">
          {/* Welcome for existing parents */}
          <div className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Welcome existing parents</h3>
            <p className="text-sm text-gray-600">
              Send the welcome message to every parent who has not received it yet. Messages go out
              slowly, one every few seconds.
            </p>
            <button
              onClick={handlePendingWelcomes}
              disabled={busy || connectedCount === 0}
              className="px-4 py-2 border border-green-300 text-green-700 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              Send welcome to remaining parents
            </button>
          </div>

          {/* Test message */}
          <form onSubmit={handleTest} className="bg-white rounded-xl shadow-sm p-6 space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">Send a test message</h3>
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              placeholder="Phone number, e.g. 0501234567"
              required
            />
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={testAccountId}
                onChange={(e) => setTestAccountId(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Any connected SIM</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                    {a.phone ? ` (+${a.phone})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy || connectedCount === 0}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                Send Test
              </button>
            </div>
          </form>
        </div>
      </div>

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
                {['Time', 'Student', 'Parent', 'Phone', 'Type', 'SIM', 'Status'].map((h) => (
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
                    {MESSAGE_TYPES[log.messageType] || log.messageType}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{log.accountLabel || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.status === 'sent'
                          ? 'bg-green-100 text-green-800'
                          : log.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                      }`}
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
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
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
