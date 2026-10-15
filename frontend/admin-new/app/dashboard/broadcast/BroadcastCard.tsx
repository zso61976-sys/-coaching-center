'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ClassOption {
  name: string;
  students: number;
  parents: number;
}

interface Preview {
  recipients: number;
  notWelcomed: number;
  gapSeconds: number;
  firstSendAt: string | null;
  lastSendAt: string | null;
  timeZone: string;
  samples: string[];
}

interface Broadcast {
  id: string;
  message: string;
  classes: string[];
  total: number;
  status: 'running' | 'completed' | 'cancelled';
  firstSendAt: string | null;
  lastSendAt: string | null;
  createdAt: string;
  sent: number;
  failed: number;
  pending: number;
  cancelled: number;
}

type Request = (path: string, method?: string, body?: unknown) => Promise<any>;

const MAX_LENGTH = 1000;
const NO_CLASS_LABEL = 'No class';

const STATUS_BADGE: Record<Broadcast['status'], { label: string; className: string }> = {
  running: { label: 'Sending', className: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Finished', className: 'bg-green-100 text-green-800' },
  cancelled: { label: 'Stopped', className: 'bg-gray-100 text-gray-700' },
};

function className(name: string) {
  return name || NO_CLASS_LABEL;
}

function formatGap(seconds: number) {
  if (seconds < 90) return `${seconds} seconds`;
  return `${Math.round(seconds / 60)} minutes`;
}

/** Parents-only broadcast by class, one message about every 5 minutes, 9 AM – 9 PM */
export default function BroadcastCard({
  request,
  enabled,
  connectedCount,
}: {
  request: Request;
  enabled: boolean;
  connectedCount: number;
}) {
  const [classes, setClasses] = useState<ClassOption[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [onlyWelcomed, setOnlyWelcomed] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const loadBroadcasts = useCallback(async () => {
    try {
      setBroadcasts((await request('/broadcasts')).data);
    } catch (err) {
      console.error('Failed to load broadcasts:', err);
    }
  }, [request]);

  useEffect(() => {
    request('/broadcast/classes')
      .then((json) => setClasses(json.data))
      .catch((err) => console.error('Failed to load classes:', err));
    loadBroadcasts();
  }, [request, loadBroadcasts]);

  // Keep progress fresh while a broadcast is sending
  const running = broadcasts.some((b) => b.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(loadBroadcasts, 30000);
    return () => clearInterval(timer);
  }, [running, loadBroadcasts]);

  // Preview: who gets it, how fast and until when
  useEffect(() => {
    if (selected.length === 0) {
      setPreview(null);
      return;
    }
    const timer = setTimeout(() => {
      request('/broadcast/preview', 'POST', { classes: selected, onlyWelcomed, message: text || undefined })
        .then((json) => setPreview(json.data))
        .catch((err) => console.error('Preview failed:', err));
    }, 400);
    return () => clearTimeout(timer);
  }, [selected, onlyWelcomed, text, request]);

  const toggleClass = (name: string) =>
    setSelected((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));

  const insertPlaceholder = (placeholder: string) => {
    const el = textRef.current;
    if (!el) return setText((t) => t + placeholder);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = (text.slice(0, start) + placeholder + text.slice(end)).slice(0, MAX_LENGTH);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + placeholder.length;
    });
  };

  const formatTime = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString('en-GB', {
          timeZone: preview?.timeZone,
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : '—';

  const send = async () => {
    if (!preview || preview.recipients === 0) return;
    const ok = window.confirm(
      `Send this message to ${preview.recipients} parent(s)?\n\n` +
        `It goes out slowly, one message about every ${formatGap(preview.gapSeconds)}, ` +
        `and finishes around ${formatTime(preview.lastSendAt)}.`,
    );
    if (!ok) return;

    setBusy(true);
    setNotice(null);
    try {
      const json = await request('/broadcasts', 'POST', { classes: selected, onlyWelcomed, message: text });
      setNotice({ ok: true, text: `Broadcast started: ${json.data.total} message(s) scheduled.` });
      setText('');
      setSelected([]);
      await loadBroadcasts();
    } catch (err: unknown) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not start the broadcast' });
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: string) => {
    if (!window.confirm('Stop this broadcast? Messages not sent yet will be dropped.')) return;
    setBusy(true);
    try {
      const json = await request(`/broadcasts/${id}/cancel`, 'POST');
      setNotice({ ok: true, text: `Broadcast stopped. ${json.cancelled} message(s) were not sent.` });
      await loadBroadcasts();
    } catch (err: unknown) {
      setNotice({ ok: false, text: err instanceof Error ? err.message : 'Could not stop the broadcast' });
    } finally {
      setBusy(false);
    }
  };

  const allSelected = !!classes && classes.length > 0 && selected.length === classes.length;
  const canSend =
    enabled && connectedCount > 0 && !running && !busy && text.trim().length > 0 && !!preview && preview.recipients > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">New broadcast</h3>
        <p className="text-sm text-gray-600 mt-1">
          Send a notice (exam, test, holiday…) to the parents of selected classes. To keep your WhatsApp
          numbers safe, one message goes out about every 5 minutes (150 parents ≈ 12 hours), only between
          9 AM and 9 PM, from each parent&apos;s own SIM. Parents with the same number get it once.
        </p>
      </div>

      {notice && (
        <div
          className={`p-3 rounded-lg text-sm border ${
            notice.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-700 border-red-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {!enabled && (
        <div className="p-3 rounded-lg text-sm bg-yellow-50 text-yellow-800 border border-yellow-200">
          Turn on WhatsApp notifications in Settings to send broadcasts.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Classes */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-gray-700">1. Choose classes</p>
            {classes && classes.length > 0 && (
              <button
                type="button"
                onClick={() => setSelected(allSelected ? [] : classes.map((c) => c.name))}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                {allSelected ? 'Clear' : 'Select all'}
              </button>
            )}
          </div>
          {!classes ? (
            <p className="text-sm text-gray-500">Loading classes…</p>
          ) : classes.length === 0 ? (
            <p className="text-sm text-gray-500">No active students yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {classes.map((c) => {
                const checked = selected.includes(c.name);
                return (
                  <label
                    key={c.name || '__none'}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                      checked ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClass(c.name)}
                      className="h-4 w-4 text-indigo-600 rounded"
                    />
                    <span className="font-medium text-gray-800 truncate">{className(c.name)}</span>
                    <span className="ml-auto text-xs text-gray-500 whitespace-nowrap">
                      {c.parents} parent{c.parents === 1 ? '' : 's'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm text-gray-700 pt-2">
            <input
              type="checkbox"
              checked={onlyWelcomed}
              onChange={(e) => setOnlyWelcomed(e.target.checked)}
              className="h-4 w-4 mt-0.5 text-indigo-600 rounded"
            />
            <span>
              Only parents who received the welcome message{' '}
              <span className="text-gray-500">(safer — they were asked to save the number)</span>
            </span>
          </label>
        </div>

        {/* Message */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">2. Write the message</p>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
            placeholder="Class 5 math test is on Monday at 4 PM. Please make sure your child comes on time."
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-gray-500">Insert:</span>
            {['{parent_name}', '{student_name}'].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => insertPlaceholder(p)}
                className="px-2 py-1 rounded border border-gray-300 font-mono text-gray-700 hover:bg-gray-50"
              >
                {p}
              </button>
            ))}
            <span className="ml-auto text-gray-500">
              {text.length}/{MAX_LENGTH}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Just write the notice. The parent&apos;s and child&apos;s names are added automatically, with a
            greeting and closing worded a little differently for every parent, so WhatsApp sees normal
            messages instead of hundreds of copies. Your notice itself stays exactly as written.
          </p>
        </div>
      </div>

      {/* Preview and send */}
      {preview && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 text-sm">
          <p className="font-medium text-gray-800">3. Check and send</p>
          {preview.recipients === 0 ? (
            <p className="text-gray-600">No parents to send to in the selected classes.</p>
          ) : (
            <ul className="space-y-1 text-gray-700">
              <li>
                👪 <span className="font-semibold">{preview.recipients}</span> parent number
                {preview.recipients === 1 ? '' : 's'}
              </li>
              <li>⏱ One message about every {formatGap(preview.gapSeconds)}</li>
              <li>
                🕘 Starts {formatTime(preview.firstSendAt)} · finishes around {formatTime(preview.lastSendAt)}
              </li>
            </ul>
          )}
          {preview.notWelcomed > 0 && (
            <p className="text-xs text-yellow-800">
              {preview.notWelcomed} parent number(s) are skipped because they have not received the welcome
              message yet.
            </p>
          )}
          {preview.samples.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Examples — each parent gets slightly different wording:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {preview.samples.map((sample, i) => (
                  <div
                    key={i}
                    className="whitespace-pre-wrap rounded-lg bg-[#dcf8c6] text-gray-900 px-3 py-2 text-sm"
                  >
                    {sample}
                  </div>
                ))}
              </div>
            </div>
          )}
          {running && (
            <p className="text-xs text-blue-800">A broadcast is still sending. Wait for it to finish or stop it below.</p>
          )}
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            Send broadcast
          </button>
        </div>
      )}

      {/* History */}
      {broadcasts.length > 0 && (
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium text-gray-700">Recent broadcasts</p>
            <button onClick={loadBroadcasts} className="text-sm text-indigo-600 hover:text-indigo-800">
              Refresh
            </button>
          </div>
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
            {broadcasts.map((b) => {
              const badge = STATUS_BADGE[b.status] || STATUS_BADGE.completed;
              const pct = (n: number) => (b.total ? (n / b.total) * 100 : 0);
              return (
                <li key={b.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-gray-500">{new Date(b.createdAt).toLocaleString()}</span>
                    <span className="text-xs text-gray-600">
                      · {(b.classes || []).map(className).join(', ')}
                    </span>
                    {b.status === 'running' && (
                      <button
                        onClick={() => stop(b.id)}
                        disabled={busy}
                        className="ml-auto px-3 py-1 text-xs border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Stop
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-800 line-clamp-2 whitespace-pre-wrap">{b.message}</p>
                  <div className="flex h-2 gap-[2px] rounded overflow-hidden bg-gray-200" aria-hidden>
                    <div style={{ width: `${pct(b.sent)}%`, backgroundColor: '#008300' }} />
                    <div style={{ width: `${pct(b.failed)}%`, backgroundColor: '#dc2626' }} />
                  </div>
                  <p className="text-xs text-gray-600">
                    Sent <span className="font-semibold">{b.sent}</span> of {b.total}
                    {b.pending > 0 && <> · waiting {b.pending}</>}
                    {b.failed > 0 && <> · failed {b.failed}</>}
                    {b.cancelled > 0 && <> · not sent {b.cancelled}</>}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
