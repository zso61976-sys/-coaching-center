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
  { key: 'inside', label: 'Present', color: '#008300' },
  { key: 'left', label: 'Left', color: '#2a78d6' },
  { key: 'absent', label: 'Not arrived', color: '#d1d5db' },
] as const;

const PLOT_HEIGHT = 160;

/** Whole-number axis: four equal steps of 1, 2, 5, 10, 20, 25 or 50 teachers */
function axisScale(value: number) {
  const raw = Math.ceil(value / 4);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((c) => c >= raw) || raw;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

const STATE_BADGE: Record<TeacherStatus['state'], string> = {
  inside: 'bg-green-100 text-green-800',
  left: 'bg-blue-100 text-blue-800',
  absent: 'bg-gray-100 text-gray-600',
};

function formatTime(date: string | null) {
  return date ? new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';
}

/** Today's teacher attendance: vertical bars (present / left / not arrived) and the list */
export default function TeacherStatusCard({ teachers }: { teachers: TeacherStatus[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = teachers.length;
  const counts = {
    inside: teachers.filter((t) => t.state === 'inside').length,
    left: teachers.filter((t) => t.state === 'left').length,
    absent: teachers.filter((t) => t.state === 'absent').length,
  };
  const { max, ticks } = axisScale(Math.max(1, total));
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
          {/* Vertical bars */}
          <div className="flex">
            {/* Y axis */}
            <div className="relative w-8 flex-shrink-0" style={{ height: PLOT_HEIGHT }}>
              {ticks.map((t) => (
                <span
                  key={t}
                  className="absolute right-2 text-xs text-gray-400"
                  style={{ bottom: `${(t / max) * 100}%`, transform: 'translateY(50%)' }}
                >
                  {t}
                </span>
              ))}
            </div>

            <div className="flex-1 min-w-0">
              {/* Plot */}
              <div className="relative" style={{ height: PLOT_HEIGHT }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className={`absolute left-0 right-0 border-t ${t === 0 ? 'border-gray-300' : 'border-gray-100'}`}
                    style={{ bottom: `${(t / max) * 100}%` }}
                  />
                ))}
                <div className="absolute inset-0 flex items-end justify-around">
                  {SEGMENTS.map((s) => {
                    const value = counts[s.key];
                    const pct = Math.round((value / total) * 100);
                    return (
                      <div
                        key={s.key}
                        className="relative flex flex-col items-center justify-end h-full w-12 sm:w-16 cursor-default"
                        onMouseEnter={() => setHover(s.key)}
                        onMouseLeave={() => setHover(null)}
                      >
                        <span className="text-sm font-semibold text-gray-700 mb-1">{value}</span>
                        <div
                          className="w-full rounded-t transition-opacity"
                          style={{
                            height: `${(value / max) * 100}%`,
                            minHeight: value > 0 ? 2 : 0,
                            backgroundColor: s.color,
                            opacity: hover && hover !== s.key ? 0.55 : 1,
                          }}
                        />
                        {hover === s.key && (
                          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none">
                            {s.label}: {value} of {total} teachers ({pct}%)
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* X axis labels */}
              <div className="flex justify-around mt-2">
                {SEGMENTS.map((s) => (
                  <p key={s.key} className="w-20 text-center text-sm font-medium text-gray-800">
                    {s.label}
                  </p>
                ))}
              </div>
            </div>
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
