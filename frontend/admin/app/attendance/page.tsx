'use client';

import { useEffect, useState } from 'react';
import {
  Calendar,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getAttendanceReport, getDailyStats } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

interface AttendanceRecord {
  attendance_id: string;
  student: {
    student_id: string;
    student_code: string;
    full_name: string;
  };
  branch_name: string;
  checkin_time: string;
  checkout_time: string | null;
  duration_minutes: number | null;
  checkout_method: string | null;
  status: string;
}

interface DailyStats {
  date: string;
  total_checkins: number;
  unique_students: number;
  checked_out: number;
  still_checked_in: number;
  avg_duration_minutes: number;
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reportRes, statsRes] = await Promise.all([
        getAttendanceReport({
          from: dateFilter,
          to: dateFilter,
          page,
          limit: 20,
        }),
        getDailyStats(dateFilter),
      ]);

      if (reportRes.success) {
        setRecords(reportRes.data.records);
        setTotalPages(reportRes.data.pagination.total_pages);
      }
      if (statsRes.success) {
        setStats(statsRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, dateFilter]);

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
              <p className="text-gray-500">View and manage attendance records</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="input"
              />
              <button className="btn btn-secondary btn-md">
                <Download className="w-4 h-4 mr-2" />
                Export
              </button>
            </div>
          </div>

          {/* Daily Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="stat-card">
                <p className="text-sm text-gray-500">Total Check-ins</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total_checkins}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Unique Students</p>
                <p className="text-2xl font-bold text-gray-900">{stats.unique_students}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Checked Out</p>
                <p className="text-2xl font-bold text-green-600">{stats.checked_out}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Still Checked In</p>
                <p className="text-2xl font-bold text-amber-600">{stats.still_checked_in}</p>
              </div>
              <div className="stat-card">
                <p className="text-sm text-gray-500">Avg Duration</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.avg_duration_minutes > 0 ? formatDuration(stats.avg_duration_minutes) : '-'}
                </p>
              </div>
            </div>
          )}

          {/* Attendance Table */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No attendance records for this date
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">Branch</th>
                        <th className="px-6 py-3">Check-in</th>
                        <th className="px-6 py-3">Check-out</th>
                        <th className="px-6 py-3">Duration</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {records.map((record) => (
                        <tr key={record.attendance_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">
                                {record.student.full_name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {record.student.student_code}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {record.branch_name}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {formatTime(record.checkin_time)}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {record.checkout_time
                              ? formatTime(record.checkout_time)
                              : '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {record.duration_minutes
                              ? formatDuration(record.duration_minutes)
                              : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                record.status === 'checked_out'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {record.status === 'checked_out' ? 'Checked Out' : 'Checked In'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="btn btn-secondary btn-sm"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="btn btn-secondary btn-sm"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
