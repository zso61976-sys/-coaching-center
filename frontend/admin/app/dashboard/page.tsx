'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  CheckCircle,
  MessageSquare,
  TrendingUp,
} from 'lucide-react';
import { getDashboard, getCurrentlyCheckedIn, getTelegramStats } from '@/lib/api';

interface DashboardData {
  students: { total: number; active: number };
  parents: { total: number; telegram_connected: number };
  attendance: { today_checkins: number; currently_checked_in: number };
}

interface TelegramStats {
  total_messages: number;
  sent: number;
  failed: number;
  success_rate: number;
}

interface CheckedInStudent {
  student_id: string;
  student_code: string;
  full_name: string;
  branch_name: string;
  checkin_time: string;
  duration_minutes: number;
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [telegramStats, setTelegramStats] = useState<TelegramStats | null>(null);
  const [checkedIn, setCheckedIn] = useState<CheckedInStudent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dashRes, telegramRes, checkedInRes] = await Promise.all([
          getDashboard(),
          getTelegramStats(),
          getCurrentlyCheckedIn(),
        ]);

        if (dashRes.success) setDashboard(dashRes.data);
        if (telegramRes.success) setTelegramStats(telegramRes.data);
        if (checkedInRes.success) setCheckedIn(checkedInRes.data.students);
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Overview of your coaching center</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Students</p>
              <p className="text-2xl font-bold text-gray-900">
                {dashboard?.students.total || 0}
              </p>
              <p className="text-xs text-gray-400">
                {dashboard?.students.active || 0} active
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Check-ins</p>
              <p className="text-2xl font-bold text-gray-900">
                {dashboard?.attendance.today_checkins || 0}
              </p>
              <p className="text-xs text-gray-400">
                {dashboard?.attendance.currently_checked_in || 0} currently in
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Telegram Connected</p>
              <p className="text-2xl font-bold text-gray-900">
                {dashboard?.parents.telegram_connected || 0}
              </p>
              <p className="text-xs text-gray-400">
                of {dashboard?.parents.total || 0} parents
              </p>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Message Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {telegramStats?.success_rate || 0}%
              </p>
              <p className="text-xs text-gray-400">
                {telegramStats?.sent || 0} / {telegramStats?.total_messages || 0} sent
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Currently Checked In */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold text-gray-900">
              Currently Checked In ({checkedIn.length})
            </h2>
          </div>
        </div>
        <div className="p-6">
          {checkedIn.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No students currently checked in
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <th className="pb-3">Student</th>
                    <th className="pb-3">Branch</th>
                    <th className="pb-3">Check-in Time</th>
                    <th className="pb-3">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {checkedIn.map((student) => (
                    <tr key={student.student_id}>
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {student.full_name}
                          </p>
                          <p className="text-sm text-gray-500">
                            {student.student_code}
                          </p>
                        </div>
                      </td>
                      <td className="py-3 text-gray-600">{student.branch_name}</td>
                      <td className="py-3 text-gray-600">
                        {new Date(student.checkin_time).toLocaleTimeString('en-US', {
                          hour: 'numeric',
                          minute: '2-digit',
                          hour12: true,
                        })}
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          {formatDuration(student.duration_minutes)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
