'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import BroadcastCard from './BroadcastCard';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api';

interface SimStatus {
  status: string;
  enabled: boolean;
}

export default function BroadcastPage() {
  const { token } = useAuth();
  const [status, setStatus] = useState<{ enabled: boolean; connected: number } | null>(null);

  const request = useCallback(
    async (path: string, method = 'GET', body?: unknown) => {
      const res = await fetch(`${API_URL}/admin/whatsapp${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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

  useEffect(() => {
    if (!token) return;
    request('/status')
      .then((json) =>
        setStatus({
          enabled: json.data.settings.enabled,
          connected: (json.data.accounts as SimStatus[]).filter((a) => a.enabled && a.status === 'connected').length,
        }),
      )
      .catch((err) => console.error('Failed to load WhatsApp status:', err));
  }, [token, request]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Broadcast</h2>
          <p className="text-sm text-gray-500">Send a notice to the parents of selected classes on WhatsApp</p>
        </div>
        {status && (
          <Link href="/dashboard/whatsapp" className="text-sm text-indigo-600 hover:text-indigo-800">
            💬 {status.connected} WhatsApp number{status.connected === 1 ? '' : 's'} connected →
          </Link>
        )}
      </div>

      {status && status.connected === 0 && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          No WhatsApp number is connected.{' '}
          <Link href="/dashboard/whatsapp" className="underline font-medium">
            Open WhatsApp
          </Link>{' '}
          to link a SIM first.
        </div>
      )}

      {status ? (
        <BroadcastCard request={request} enabled={status.enabled} connectedCount={status.connected} />
      ) : (
        <p className="text-sm text-gray-500">Loading…</p>
      )}
    </div>
  );
}
