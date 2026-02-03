'use client';

import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Key,
  Edit,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getStudents, resetStudentPin } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

interface Student {
  student_id: string;
  student_code: string;
  full_name: string;
  phone: string;
  email: string;
  grade: string;
  status: string;
  branch_name: string;
  parents: Array<{
    parent_id: string;
    full_name: string;
    phone: string;
    relationship: string;
    telegram_connected: boolean;
  }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showResetPin, setShowResetPin] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const response = await getStudents({ page, search, limit: 20 });
      if (response.success) {
        setStudents(response.data.students);
        setPagination(response.data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch students:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, search]);

  const handleResetPin = async (studentId: string) => {
    if (!newPin || newPin.length < 4) return;
    setResetting(true);
    try {
      await resetStudentPin(studentId, newPin);
      setShowResetPin(null);
      setNewPin('');
    } catch (error) {
      console.error('Failed to reset PIN:', error);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Students</h1>
              <p className="text-gray-500">Manage student records</p>
            </div>
            <button className="btn btn-primary btn-md">
              <Plus className="w-5 h-5 mr-2" />
              Add Student
            </button>
          </div>

          {/* Search */}
          <div className="card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search students..."
                className="input pl-10"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Students Table */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : students.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No students found
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">Grade</th>
                        <th className="px-6 py-3">Branch</th>
                        <th className="px-6 py-3">Parents</th>
                        <th className="px-6 py-3">Status</th>
                        <th className="px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {students.map((student) => (
                        <tr key={student.student_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <div>
                              <p className="font-medium text-gray-900">
                                {student.full_name}
                              </p>
                              <p className="text-sm text-gray-500">
                                {student.student_code}
                              </p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {student.grade || '-'}
                          </td>
                          <td className="px-6 py-4 text-gray-600">
                            {student.branch_name}
                          </td>
                          <td className="px-6 py-4">
                            {student.parents.map((parent) => (
                              <div key={parent.parent_id} className="flex items-center gap-2 text-sm">
                                <span className="text-gray-600">{parent.full_name}</span>
                                {parent.telegram_connected && (
                                  <MessageSquare className="w-4 h-4 text-blue-500" />
                                )}
                              </div>
                            ))}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                student.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {student.status}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setShowResetPin(student.student_id)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                title="Reset PIN"
                              >
                                <Key className="w-4 h-4" />
                              </button>
                              <button
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                                title="Edit"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination && pagination.total_pages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      Showing {(page - 1) * pagination.limit + 1} to{' '}
                      {Math.min(page * pagination.limit, pagination.total)} of{' '}
                      {pagination.total} students
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn btn-secondary btn-sm"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {page} of {pagination.total_pages}
                      </span>
                      <button
                        onClick={() =>
                          setPage((p) => Math.min(pagination.total_pages, p + 1))
                        }
                        disabled={page === pagination.total_pages}
                        className="btn btn-secondary btn-sm"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Reset PIN Modal */}
          {showResetPin && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Reset Student PIN
                </h3>
                <div className="mb-4">
                  <label className="label">New PIN (4-6 digits)</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Enter new PIN"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowResetPin(null);
                      setNewPin('');
                    }}
                    className="btn btn-secondary btn-md flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleResetPin(showResetPin)}
                    disabled={newPin.length < 4 || resetting}
                    className="btn btn-primary btn-md flex-1"
                  >
                    {resetting ? 'Resetting...' : 'Reset PIN'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
