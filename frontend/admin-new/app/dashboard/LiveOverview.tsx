'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import ClassAttendanceChart, { ClassAttendance } from './ClassAttendanceChart';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : typeof window !== 'undefined'
    ? `http://${window.location.hostname}:3000/api`
    : 'http://localhost:3000/api';

const REFRESH_MS = 10000;
const DEVICE_ONLINE_MS = 5 * 60 * 1000;
const NEW_EVENT_MS = 2 * 60 * 1000;
const FEED_SIZE = 15;

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
}

interface WhatsappStatus {
  accounts: Sim[];
  settings: { enabled: boolean };
}

interface Device {
  id: string;
  name: string;
  serialNumber: string;
  lastSyncAt: string | null;
}

interface Session {
  attendance_id: string;
  student: { student_id: string; student_code: string; full_name: string };
  checkin_time: string;
  checkout_time: string | null;
}

interface StudentRow {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  biometricId: string | null;
  checkIn: string | null;
  checkOut: string | null;
  state: 'inside' | 'left' | 'absent';
}

interface ActivityEvent {
  key: string;
  type: 'in' | 'out';
  time: string;
  name: string;
  code: string;
}

type ActivityFilter = 'all' | 'in' | 'out';

const SIM_STATUS: Record<SimStatus, { label: string; dot: string; text: string }> = {
  connected: { label: 'Connected', dot: 'bg-green-500', text: 'text-green-700' },
  qr: { label: 'Waiting for QR scan', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  connecting: { label: 'Connecting...', dot: 'bg-blue-500', text: 'text-blue-700' },
  disconnected: { label: 'Offline', dot: 'bg-red-500', text: 'text-red-700' },
};

function dateKey(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(date: string | null) {
  return date ? new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

function timeAgo(date: string | null) {
  if (!date) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(date).toLocaleDateString();
}

/** One row per active student, combined with today's check-ins (fingerprint and kiosk) */
function buildStudentRows(students: any[], sessions: Session[]): StudentRow[] {
  const byStudent = new Map<string, Session[]>();
  for (const s of sessions) {
    const id = s.student?.student_id;
    if (!id) continue;
    if (!byStudent.has(id)) byStudent.set(id, []);
    byStudent.get(id)!.push(s);
  }

  return students
    .filter((s) => s.status === 'active')
    .map((s) => {
      const list = (byStudent.get(s.student_id) || []).sort(
        (a, b) => new Date(a.checkin_time).getTime() - new Date(b.checkin_time).getTime(),
      );
      const first = list[0];
      const latest = list[list.length - 1];
      const state: StudentRow['state'] = !latest ? 'absent' : latest.checkout_time ? 'left' : 'inside';
      return {
        id: s.student_id,
        code: s.student_code,
        name: s.full_name,
        grade: s.grade || null,
        biometricId: s.biometric_id || null,
        checkIn: first?.checkin_time || null,
        checkOut: latest?.checkout_time || null,
        state,
      };
    })
    .sort((a, b) => {
      const order = { inside: 0, left: 1, absent: 2 };
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
      return a.name.localeCompare(b.name);
    });
}

/** Students present (checked in at least once) per class, today and yesterday */
function buildClassAttendance(students: any[], today: Session[], yesterday: Session[]): ClassAttendance[] {
  const classOf = new Map<string, string>();
  for (const s of students) classOf.set(s.student_id, (s.grade || '').trim() || 'No class');

  const presentByClass = (sessions: Session[]) => {
    const seen = new Map<string, Set<string>>();
    for (const session of sessions) {
      const id = session.student?.student_id;
      if (!id) continue;
      const cls = classOf.get(id) || 'No class';
      if (!seen.has(cls)) seen.set(cls, new Set());
      seen.get(cls)!.add(id);
    }
    return seen;
  };
  const todayPresent = presentByClass(today);
  const yesterdayPresent = presentByClass(yesterday);

  const totals = new Map<string, number>();
  for (const s of students) {
    if (s.status !== 'active') continue;
    const cls = classOf.get(s.student_id)!;
    totals.set(cls, (totals.get(cls) || 0) + 1);
  }

  const classes = new Set(
    Array.from(totals.keys())
      .concat(Array.from(todayPresent.keys()))
      .concat(Array.from(yesterdayPresent.keys())),
  );
  return Array.from(classes)
    .map((name) => ({
      name,
      total: totals.get(name) || 0,
      today: todayPresent.get(name)?.size || 0,
      yesterday: yesterdayPresent.get(name)?.size || 0,
    }))
    .sort((a, b) => {
      if (a.name === 'No class') return 1;
      if (b.name === 'No class') return -1;
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    });
}

/** Every check-in and check-out today, newest first */
function buildActivity(sessions: Session[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const s of sessions) {
    if (!s.student) continue;
    const base = { name: s.student.full_name, code: s.student.student_code };
    events.push({ key: `${s.attendance_id}-in`, type: 'in', time: s.checkin_time, ...base });
    if (s.checkout_time) {
      events.push({ key: `${s.attendance_id}-out`, type: 'out', time: s.checkout_time, ...base });
    }
  }
  return events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${accent}`}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );
}

export default function LiveOverview() {
  const { token, hasRole, hasModuleAccess } = useAuth();
  const isAdmin = hasRole('admin');
  const canSeeDevices = hasModuleAccess('biometric');
  const canSeeStudents = hasModuleAccess('students');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [whatsapp, setWhatsapp] = useState<WhatsappStatus | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [studentRows, setStudentRows] = useState<StudentRow[] | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [classData, setClassData] = useState<ClassAttendance[] | null>(null);
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
      canSeeDevices ? get('/admin/biometric/devices') : Promise.resolve(null),
      canSeeStudents ? get('/admin/students') : Promise.resolve(null),
      canSeeStudents
        ? get(`/admin/attendance/report?date=${dateKey(0)}&limit=1000`)
        : Promise.resolve(null),
      canSeeStudents
        ? get(`/admin/attendance/report?date=${dateKey(1)}&limit=1000`)
        : Promise.resolve(null),
    ]);
    const [s, w, d, st, att, attYesterday] = results;
    if (s.status === 'fulfilled') setStats(s.value);
    if (w.status === 'fulfilled') setWhatsapp(w.value);
    if (d.status === 'fulfilled') setDevices(d.value);
    if (att.status === 'fulfilled' && att.value) {
      const sessions: Session[] = att.value.records || [];
      setActivity(buildActivity(sessions));
      if (st.status === 'fulfilled' && st.value) {
        const students = st.value.students || [];
        setStudentRows(buildStudentRows(students, sessions));
        if (attYesterday.status === 'fulfilled' && attYesterday.value) {
          setClassData(buildClassAttendance(students, sessions, attYesterday.value.records || []));
        }
      }
    }
    setFailed(results.every((r) => r.status === 'rejected'));
    setUpdatedAt(new Date());
  }, [token, get, isAdmin, canSeeDevices, canSeeStudents]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const sims = whatsapp?.accounts || [];
  const activeSims = sims.filter((s) => s.enabled && s.linked);
  const offlineSims = activeSims.filter((s) => s.status !== 'connected');
  const backupOnline = activeSims.some((s) => s.role === 'backup' && s.status === 'connected');

  const counts = {
    inside: studentRows?.filter((r) => r.state === 'inside').length || 0,
    left: studentRows?.filter((r) => r.state === 'left').length || 0,
    absent: studentRows?.filter((r) => r.state === 'absent').length || 0,
  };

  const onlineDevices = (devices || []).filter(
    (d) => d.lastSyncAt && Date.now() - new Date(d.lastSyncAt).getTime() < DEVICE_ONLINE_MS,
  );

  const activityCounts = {
    all: activity.length,
    in: activity.filter((e) => e.type === 'in').length,
    out: activity.filter((e) => e.type === 'out').length,
  };
  const visibleActivity = activity
    .filter((e) => activityFilter === 'all' || e.type === activityFilter)
    .slice(0, FEED_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Live monitoring</h2>
          <p className="text-sm text-gray-500">Who is inside, who left and who has not arrived today</p>
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
          {failed ? 'Cannot reach server' : updatedAt ? `Live · updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}
        </div>
      </div>

      {/* WhatsApp status */}
      {isAdmin && whatsapp && (
        <div className="bg-white rounded-xl shadow-sm px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-semibold text-gray-800">💬 WhatsApp</span>
          {sims.length === 0 ? (
            <span className="text-sm text-gray-500">No number linked</span>
          ) : (
            sims.map((sim) => {
              const style = SIM_STATUS[sim.status];
              return (
                <span
                  key={sim.id}
                  className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm"
                  title={sim.role === 'backup' ? 'Backup SIM' : `${sim.assignedParents} parents`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${sim.enabled ? style.dot : 'bg-gray-300'}`} />
                  <span className="font-medium text-gray-800">{sim.label}</span>
                  {sim.role === 'backup' && (
                    <span className="px-1.5 rounded bg-indigo-100 text-indigo-700 text-xs">Backup</span>
                  )}
                  {sim.phone && <span className="font-mono text-gray-500 text-xs">+{sim.phone}</span>}
                  <span className={`text-xs ${sim.enabled ? style.text : 'text-gray-500'}`}>
                    {sim.enabled ? style.label : 'Paused'}
                  </span>
                </span>
              );
            })
          )}
          {!whatsapp.settings.enabled && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-800">Messages to parents are off</span>
          )}
          <Link href="/dashboard/whatsapp" className="ml-auto text-sm text-indigo-600 hover:text-indigo-800">
            Manage →
          </Link>
        </div>
      )}

      {/* Alerts */}
      {offlineSims.length > 0 && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          ⚠️ WhatsApp {offlineSims.map((s) => s.label).join(', ')} {offlineSims.length === 1 ? 'is' : 'are'} offline.
          {activeSims.length > offlineSims.length
            ? backupOnline
              ? ' The backup SIM is covering.'
              : ' The other connected SIMs are covering.'
            : ' Parents are not receiving messages right now.'}{' '}
          <Link href="/dashboard/whatsapp" className="underline font-medium">Open WhatsApp</Link>
        </div>
      )}
      {devices && devices.length > onlineDevices.length && (
        <div className="p-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
          ⚠️ {devices.length - onlineDevices.length} biometric device(s) offline.{' '}
          <Link href="/dashboard/biometric" className="underline font-medium">Open Biometric</Link>
        </div>
      )}

      {/* Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {studentRows ? (
          <>
            <StatCard label="🟢 Inside now" value={counts.inside} accent="border-green-500" />
            <StatCard label="🔵 Left" value={counts.left} accent="border-blue-500" />
            <StatCard label="⚪ Not arrived" value={counts.absent} accent="border-gray-400" />
          </>
        ) : (
          <>
            <StatCard label="🟢 Inside now" value={stats?.attendance.currently_checked_in ?? '–'} accent="border-green-500" />
            <StatCard label="Checked in today" value={stats?.attendance.today_checkins ?? '–'} accent="border-blue-500" />
            <StatCard label="Active students" value={stats?.students.active ?? '–'} accent="border-gray-400" />
          </>
        )}
        <StatCard
          label="🖐️ Devices online"
          value={devices ? `${onlineDevices.length} / ${devices.length}` : '–'}
          accent={devices && devices.length > onlineDevices.length ? 'border-red-500' : 'border-green-500'}
        />
      </div>

      {canSeeStudents && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Live IN / OUT feed */}
          <div className="bg-white rounded-xl shadow-sm">
            <div className="p-4 sm:p-6 border-b border-gray-200 space-y-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Live IN / OUT</h3>
                <p className="text-xs text-gray-500">Latest check-ins and check-outs today</p>
              </div>
              <div className="flex gap-2">
                {([
                  ['all', 'All', 'bg-green-600 text-white'],
                  ['in', 'IN', 'bg-green-600 text-white'],
                  ['out', 'OUT', 'bg-blue-600 text-white'],
                ] as const).map(([key, label, activeClass]) => (
                  <button
                    key={key}
                    onClick={() => setActivityFilter(key)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      activityFilter === key ? activeClass : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {label} ({activityCounts[key]})
                  </button>
                ))}
              </div>
            </div>
            {visibleActivity.length === 0 ? (
              <p className="p-6 text-sm text-gray-500">
                {activity.length === 0
                  ? 'No check-ins yet today.'
                  : activityFilter === 'in'
                    ? 'No check-ins yet today.'
                    : 'No check-outs yet today.'}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {visibleActivity.map((event) => {
                  const isNew = Date.now() - new Date(event.time).getTime() < NEW_EVENT_MS;
                  return (
                    <li
                      key={event.key}
                      className={`px-4 sm:px-6 py-3 flex items-center gap-3 ${isNew ? 'bg-yellow-50' : ''}`}
                    >
                      <span
                        className={`w-12 text-center px-2 py-1 rounded-md text-xs font-bold flex-shrink-0 ${
                          event.type === 'in' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {event.type === 'in' ? 'IN' : 'OUT'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{event.name}</p>
                        <p className="text-xs text-gray-500 font-mono">ID {event.code}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm text-gray-800">{formatTime(event.time)}</p>
                        <p className={`text-xs ${isNew ? 'text-yellow-700 font-medium' : 'text-gray-400'}`}>
                          {isNew ? 'just now' : timeAgo(event.time)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Present by class: today vs yesterday */}
          <div className="xl:col-span-2">
            {classData ? (
              <ClassAttendanceChart data={classData} />
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-6 text-sm text-gray-500">Loading...</div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
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
