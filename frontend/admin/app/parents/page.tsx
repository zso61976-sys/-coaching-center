'use client';

import { useEffect, useState } from 'react';
import {
  Search,
  MessageSquare,
  Link as LinkIcon,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getParents, generateTelegramLink } from '@/lib/api';
import Sidebar from '@/components/Sidebar';

interface Parent {
  parent_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  telegram_connected: boolean;
  telegram_username: string | null;
  notification_enabled: boolean;
  students: Array<{
    student_id: string;
    student_code: string;
    full_name: string;
    relationship: string;
  }>;
}

export default function ParentsPage() {
  const [parents, setParents] = useState<Parent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showLink, setShowLink] = useState<{ parentId: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchParents = async () => {
    setLoading(true);
    try {
      const response = await getParents({ page, search, limit: 20 });
      if (response.success) {
        setParents(response.data.parents);
        setTotalPages(response.data.pagination.total_pages);
      }
    } catch (error) {
      console.error('Failed to fetch parents:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchParents();
  }, [page, search]);

  const handleGenerateLink = async (parentId: string) => {
    setGenerating(parentId);
    try {
      const response = await generateTelegramLink(parentId);
      if (response.success) {
        setShowLink({ parentId, link: response.data.telegram_link });
      }
    } catch (error) {
      console.error('Failed to generate link:', error);
    } finally {
      setGenerating(null);
    }
  };

  const handleCopyLink = () => {
    if (showLink) {
      navigator.clipboard.writeText(showLink.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Parents</h1>
            <p className="text-gray-500">Manage parent contacts and Telegram connections</p>
          </div>

          {/* Search */}
          <div className="card p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or phone..."
                className="input pl-10"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {/* Parents Table */}
          <div className="card overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : parents.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No parents found</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <th className="px-6 py-3">Parent</th>
                        <th className="px-6 py-3">Contact</th>
                        <th className="px-6 py-3">Students</th>
                        <th className="px-6 py-3">Telegram</th>
                        <th className="px-6 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {parents.map((parent) => (
                        <tr key={parent.parent_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4">
                            <p className="font-medium text-gray-900">{parent.full_name}</p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-600">{parent.phone}</p>
                            {parent.email && (
                              <p className="text-sm text-gray-400">{parent.email}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {parent.students.map((student) => (
                              <div key={student.student_id} className="text-sm">
                                <span className="text-gray-600">{student.full_name}</span>
                                <span className="text-gray-400 ml-1">({student.relationship})</span>
                              </div>
                            ))}
                          </td>
                          <td className="px-6 py-4">
                            {parent.telegram_connected ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  <MessageSquare className="w-3 h-3 mr-1" />
                                  Connected
                                </span>
                                {parent.telegram_username && (
                                  <span className="text-sm text-gray-400">
                                    @{parent.telegram_username}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                                Not connected
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {!parent.telegram_connected && (
                              <button
                                onClick={() => handleGenerateLink(parent.parent_id)}
                                disabled={generating === parent.parent_id}
                                className="btn btn-secondary btn-sm"
                              >
                                {generating === parent.parent_id ? (
                                  'Generating...'
                                ) : (
                                  <>
                                    <LinkIcon className="w-4 h-4 mr-1" />
                                    Generate Link
                                  </>
                                )}
                              </button>
                            )}
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

          {/* Link Modal */}
          {showLink && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Telegram Connection Link
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Share this link with the parent. It expires in 24 hours.
                </p>
                <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-4">
                  <input
                    type="text"
                    value={showLink.link}
                    readOnly
                    className="flex-1 bg-transparent text-sm text-gray-700 outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <Check className="w-5 h-5 text-green-600" />
                    ) : (
                      <Copy className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <button
                  onClick={() => setShowLink(null)}
                  className="btn btn-primary btn-md w-full"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
