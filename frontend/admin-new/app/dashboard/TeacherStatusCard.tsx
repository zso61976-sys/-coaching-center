'use client';

import { useState } from 'react';

export interface TeacherStatus {
  teacher_id: string;
  teacher_code: string;
  full_name: string;
  state: 'inside' | 'left' | 'absent';
  first_in: string | null;
  last_out: string | null;
}

// Green and blue validated together (CVD ΔE 26.5, ≥3:1 on white); gray is the neutral "not arrived"
const SEGMENTS = [
  { key: 'inside', label: 'Present', color: '#008300', text: 'text-white' },
  { key: 'left', label: 'Left', color: '#2a78d6', text: 'text-white' },
  { key: 'absent', label: 'Not arrived', color: '#e5e7eb', text: 'text-gray-700' },
] as const;

const STATE_BADGE: Record<TeacherStatus['state'], string> = {
  inside: 'bg-green-100 text-green-800',
  left: 'bg-blue-100 text-blue-800',
  absent: 'bg-gray-100 text-gray-600',
};

function formatTime(date: string | null) {
  return date ? new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

/** Today's teacher attendance: one stacked bar (present / left / not arrived) and the list */
export default function TeacherStatusCard({ teachers }: { teachers: TeacherStatus[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = teachers.length;
  const counts = {
    inside: teachers.filter((t) => t.state === 'inside').length,
    left: teachers.filter((t) => t.state === 'left').length,
    absent: teachers.filter((t) => t.state === 'absent').length,
  };
  const order = { inside: 0, left: 1, absent: 2 };
  const sorted = [...teachers].sort(
    (a, b) => order[a.state] - order[b.state] || a.full_name.localeCompare(b.full_name),
  );

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-baseline mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Teachers today</h3>
        <span className="text-sm text-gray-500">
          {counts.inside + counts.left} of {total} came in
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm text-gray-500">No active teachers.</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-9 gap-[2px] rounded overflow-visible">
            {SEGMENTS.filter((s) => counts[s.key] > 0).map((s, i, visible) => {
              const value = counts[s.key];
              const pct = (value / total) * 100;
              return (
                <div
                  key={s.key}
                  className={`relative flex items-center justify-center text-sm font-semibold ${s.text} ${
                    i === 0 ? 'rounded-l' : ''
                  } ${i === visible.length - 1 ? 'rounded-r' : ''}`}
                  style={{
                    width: `${pct}%`,
                    minWidth: 28,
                    backgroundColor: s.color,
                    opacity: hover && hover !== s.key ? 0.6 : 1,
                  }}
                  onMouseEnter={() => setHover(s.key)}
                  onMouseLeave={() => setHover(null)}
                >
                  {value}
                  {hover === s.key && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-gray-900 text-white text-xs font-normal rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none">
                      {s.label}: {value} of {total} teachers ({Math.round(pct)}%)
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 mt-3 text-sm text-gray-700">
            {SEGMENTS.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5">
                <span
                  className="h-3 w-3 rounded-sm border border-gray-200"
                  style={{ backgroundColor: s.color }}
                />
                {s.label} <span className="font-semibold">{counts[s.key]}</span>
              </span>
            ))}
          </div>

          {/* Teacher list */}
          <ul className="divide-y divide-gray-100 mt-4 max-h-72 overflow-y-auto">
            {sorted.map((t) => (
              <li key={t.teacher_id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{t.full_name}</p>
                  <p className="text-xs text-gray-500 font-mono">ID {t.teacher_code}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right text-xs text-gray-600">
                    <p>IN {formatTime(t.first_in)}</p>
                    <p>OUT {formatTime(t.last_out)}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium w-24 text-center ${STATE_BADGE[t.state]}`}>
                    {t.state === 'inside' ? 'Present' : t.state === 'left' ? 'Left' : 'Not arrived'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
