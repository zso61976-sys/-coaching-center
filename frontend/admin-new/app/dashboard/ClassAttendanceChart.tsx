'use client';

import { useState } from 'react';

export interface ClassAttendance {
  name: string;
  total: number;
  today: number;
  yesterday: number;
}

// Categorical slots 1 and 2 (validated: CVD ΔE 24.7, normal-vision ΔE 33.6, ≥3:1 on white)
const SERIES = [
  { key: 'today', label: 'Today', color: '#2a78d6' },
  { key: 'yesterday', label: 'Yesterday', color: '#eb6834' },
] as const;

const PLOT_HEIGHT = 220;

/** Whole-number axis: four equal steps of 1, 2, 5, 10, 20, 25 or 50 students */
function axisScale(value: number) {
  const raw = Math.ceil(value / 4);
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((c) => c >= raw) || raw;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

function percent(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Vertical grouped bars: students present per class, today vs yesterday */
export default function ClassAttendanceChart({ data }: { data: ClassAttendance[] }) {
  const [hover, setHover] = useState<{ cls: string; series: 'today' | 'yesterday' } | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { max, ticks } = axisScale(Math.max(1, ...data.flatMap((c) => [c.today, c.yesterday])));
  const totals = data.reduce(
    (acc, c) => ({ today: acc.today + c.today, yesterday: acc.yesterday + c.yesterday }),
    { today: 0, yesterday: 0 },
  );

  return (
    <div className="bg-white rounded-xl shadow-sm">
      <div className="p-4 sm:p-6 border-b border-gray-200 flex flex-wrap gap-3 justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Present by class</h3>
          <p className="text-xs text-gray-500">
            Students who checked in · today {totals.today}, yesterday {totals.yesterday}
          </p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-sm text-gray-700">
          {SERIES.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {data.length === 0 ? (
        <p className="p-6 text-sm text-gray-500">No students yet.</p>
      ) : (
        <div className="p-4 sm:p-6">
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

            {/* Plot */}
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="relative" style={{ height: PLOT_HEIGHT, minWidth: data.length * 72 }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className={`absolute left-0 right-0 border-t ${t === 0 ? 'border-gray-300' : 'border-gray-100'}`}
                    style={{ bottom: `${(t / max) * 100}%` }}
                  />
                ))}

                <div className="absolute inset-0 flex items-end justify-around">
                  {data.map((cls) => (
                    <div key={cls.name} className="relative flex items-end gap-[2px] h-full">
                      {SERIES.map((s) => {
                        const value = cls[s.key];
                        const isHover = hover?.cls === cls.name && hover.series === s.key;
                        return (
                          <div
                            key={s.key}
                            className="relative flex flex-col items-center justify-end h-full w-6 sm:w-8 cursor-default"
                            onMouseEnter={() => setHover({ cls: cls.name, series: s.key })}
                            onMouseLeave={() => setHover(null)}
                          >
                            {/* Direct label on today's bar only; yesterday is in the tooltip and table */}
                            {s.key === 'today' && (
                              <span className="text-xs font-medium text-gray-700 mb-1">{value}</span>
                            )}
                            <div
                              className="w-full rounded-t transition-opacity"
                              style={{
                                height: `${(value / max) * 100}%`,
                                minHeight: value > 0 ? 2 : 0,
                                backgroundColor: s.color,
                                opacity: hover && !isHover ? 0.55 : 1,
                              }}
                            />
                            {isHover && (
                              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap bg-gray-900 text-white text-xs rounded-md px-2.5 py-1.5 shadow-lg pointer-events-none">
                                <p className="font-semibold">{cls.name}</p>
                                <p>
                                  {s.label}: {value} of {cls.total} present ({percent(value, cls.total)}%)
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* X axis labels */}
              <div className="flex justify-around mt-2" style={{ minWidth: data.length * 72 }}>
                {data.map((cls) => (
                  <div key={cls.name} className="text-center w-16">
                    <p className="text-sm font-medium text-gray-800 truncate" title={cls.name}>
                      {cls.name}
                    </p>
                    <p className="text-xs text-gray-400">of {cls.total}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowTable((v) => !v)}
            className="mt-4 text-xs text-indigo-600 hover:text-indigo-800"
          >
            {showTable ? 'Hide table' : 'Show as table'}
          </button>

          {showTable && (
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {['Class', 'Students', 'Today', 'Yesterday'].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((cls) => (
                    <tr key={cls.name}>
                      <td className="px-3 py-2 text-gray-900">{cls.name}</td>
                      <td className="px-3 py-2 text-gray-600">{cls.total}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {cls.today} ({percent(cls.today, cls.total)}%)
                      </td>
                      <td className="px-3 py-2 text-gray-700">
                        {cls.yesterday} ({percent(cls.yesterday, cls.total)}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
