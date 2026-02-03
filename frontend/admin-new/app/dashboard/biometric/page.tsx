'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000`
  : 'http://localhost:3000';

interface BiometricDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string | null;
  location: string | null;
  ipAddress: string | null;
  status: string;
  timezoneOffset: number;
  lastSyncAt: string | null;
  createdAt: string;
  _count: {
    enrollments: number;
    punchLogs: number;
  };
}

interface PunchLog {
  id: string;
  deviceUserId: string;
  punchTime: string;
  punchType: string;
  verifyMethod: string;
  processed: boolean;
  errorMessage: string | null;
  device: BiometricDevice;
  attendance: {
    student: {
      id: string;
      studentCode: string;
      fullName: string;
    };
  } | null;
  enrollment?: {
    student?: {
      id: string;
      studentCode: string;
      fullName: string;
    };
    teacher?: {
      id: string;
      teacherCode: string;
      fullName: string;
    };
  } | null;
}

interface DeviceStatus {
  id: string;
  serialNumber: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  isOnline: boolean;
  enrollmentCount: number;
  punchesToday: number;
}

interface Enrollment {
  id: string;
  deviceUserId: string;
  memberType: string;
  status: string;
  enrolledAt: string;
  device: BiometricDevice;
  student?: {
    id: string;
    studentCode: string;
    fullName: string;
  } | null;
  teacher?: {
    id: string;
    teacherCode: string;
    fullName: string;
  } | null;
}

export default function BiometricPage() {
  const { token, hasRole, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'devices' | 'logs' | 'enrollments'>('devices');

  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [punchLogs, setPunchLogs] = useState<PunchLog[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus[]>([]);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showAddDevice, setShowAddDevice] = useState(false);
  const [showEditDevice, setShowEditDevice] = useState(false);
  const [selectedLogDevice, setSelectedLogDevice] = useState<string>('');
  const [selectedEnrollDevice, setSelectedEnrollDevice] = useState<string>('');
  const [logSearch, setLogSearch] = useState<string>('');
  const [editingDevice, setEditingDevice] = useState<BiometricDevice | null>(null);

  const [newDevice, setNewDevice] = useState({
    serialNumber: '',
    name: '',
    model: '',
    location: '',
    ipAddress: '',
    timezoneOffset: 0,
  });

  const [editDevice, setEditDevice] = useState({
    name: '',
    model: '',
    location: '',
    ipAddress: '',
    status: '',
    timezoneOffset: 0,
  });

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDevices(data.data);
      }
    } catch (err) {
      setError('Failed to fetch devices');
    }
  };

  const fetchPunchLogs = async (deviceId?: string, search?: string) => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (deviceId) params.append('deviceId', deviceId);
      if (search) params.append('search', search);
      const res = await fetch(`${API_URL}/api/admin/biometric/logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setPunchLogs(data.data);
      }
    } catch (err) {
      setError('Failed to fetch punch logs');
    }
  };

  const fetchEnrollments = async (deviceId?: string) => {
    try {
      const params = new URLSearchParams();
      if (deviceId) params.append('deviceId', deviceId);
      const res = await fetch(`${API_URL}/api/admin/biometric/enrollments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setEnrollments(data.data);
      }
    } catch (err) {
      setError('Failed to fetch enrollments');
    }
  };

  const handleDeleteEnrollment = async (enrollmentId: string) => {
    if (!confirm('Are you sure you want to remove this enrollment? This will also queue a delete command to remove the user from the device.')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/enroll/${enrollmentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchEnrollments(selectedEnrollDevice || undefined);
        fetchSyncStatus();
      } else {
        setError(data.message || 'Failed to delete enrollment');
      }
    } catch (err) {
      setError('Failed to delete enrollment');
    }
  };

  const handlePushToDevice = async (enrollment: Enrollment) => {
    const name = enrollment.student?.fullName || enrollment.teacher?.fullName || 'User';
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${enrollment.device.id}/push-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin: enrollment.deviceUserId, name }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Push command queued for ${name} (PIN: ${enrollment.deviceUserId}). The device will sync on next poll.`);
      } else {
        setError(data.message || 'Failed to queue push command');
      }
    } catch (err) {
      setError('Failed to queue push command');
    }
  };

  const handleDeleteFromDevice = async (enrollment: Enrollment) => {
    if (!confirm(`Are you sure you want to delete user ${enrollment.deviceUserId} from the device? This only removes from device, not from enrollment.`)) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${enrollment.device.id}/delete-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pin: enrollment.deviceUserId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Delete command queued for PIN: ${enrollment.deviceUserId}. The device will sync on next poll.`);
      } else {
        setError(data.message || 'Failed to queue delete command');
      }
    } catch (err) {
      setError('Failed to queue delete command');
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/sync-status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeviceStatus(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch sync status');
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchDevices(),
        fetchSyncStatus(),
      ]);
      setLoading(false);
    };
    if (token) {
      loadData();
    } else if (!isLoading) {
      // Auth finished loading but no token - stop showing spinner
      setLoading(false);
    }
  }, [token, isLoading]);

  useEffect(() => {
    if (activeTab === 'logs' && token) {
      fetchPunchLogs(selectedLogDevice || undefined, logSearch || undefined);
    }
  }, [activeTab, selectedLogDevice, logSearch, token]);

  useEffect(() => {
    if (activeTab === 'enrollments' && token) {
      fetchEnrollments(selectedEnrollDevice || undefined);
    }
  }, [activeTab, selectedEnrollDevice, token]);

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newDevice),
      });
      const data = await res.json();
      if (data.success) {
        setShowAddDevice(false);
        setNewDevice({ serialNumber: '', name: '', model: '', location: '', ipAddress: '', timezoneOffset: 0 });
        fetchDevices();
        fetchSyncStatus();
      } else {
        setError(data.message || 'Failed to add device');
      }
    } catch (err) {
      setError('Failed to add device');
    }
  };

  const handleOpenEditDevice = (device: BiometricDevice) => {
    setEditingDevice(device);
    setEditDevice({
      name: device.name,
      model: device.model || '',
      location: device.location || '',
      ipAddress: device.ipAddress || '',
      status: device.status,
      timezoneOffset: device.timezoneOffset ?? 0,
    });
    setShowEditDevice(true);
  };

  const handleEditDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDevice) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${editingDevice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editDevice),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditDevice(false);
        setEditingDevice(null);
        fetchDevices();
        fetchSyncStatus();
      } else {
        setError(data.message || 'Failed to update device');
      }
    } catch (err) {
      setError('Failed to update device');
    }
  };

  const handleDeleteDevice = async (deviceId: string) => {
    if (!confirm('Are you sure you want to delete this device?')) return;
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        fetchDevices();
        fetchSyncStatus();
      } else {
        setError(data.message || 'Failed to delete device');
      }
    } catch (err) {
      setError('Failed to delete device');
    }
  };

  const [syncing, setSyncing] = useState(false);

  const handleSyncTime = async (deviceId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${deviceId}/sync-time`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert('Sync time command queued. Device will update on next poll.');
      } else {
        setError(data.message || 'Failed to sync time');
      }
    } catch (err) {
      setError('Failed to sync time');
    }
  };

  const handleSyncTimeAll = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/sync-time-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert(`Sync time queued for ${data.data.length} device(s). Devices will update on next poll.`);
      } else {
        setError(data.message || 'Failed to sync time');
      }
    } catch (err) {
      setError('Failed to sync time to all devices');
    } finally {
      setSyncing(false);
    }
  };

  const handleSyncAllEnrollments = async () => {
    if (!confirm('This will re-push all enrolled users to their devices. Continue?')) return;
    setSyncing(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/sync-all-enrollments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert(`Synced ${data.data.length} enrollment(s) to devices. Devices will update on next poll.`);
      } else {
        setError(data.message || 'Failed to sync enrollments');
      }
    } catch (err) {
      setError('Failed to sync enrollments');
    } finally {
      setSyncing(false);
    }
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      error: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!hasRole('staff')) {
    return (
      <div className="p-6">
        <div className="bg-red-100 text-red-700 p-4 rounded">
          You do not have permission to access this page.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Biometric Devices</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSyncTimeAll}
            disabled={syncing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            title="Restart all devices to sync time"
          >
            {syncing ? 'Restarting...' : 'Restart All & Sync Time'}
          </button>
          <button
            onClick={handleSyncAllEnrollments}
            disabled={syncing}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50 text-sm"
          >
            {syncing ? 'Syncing...' : 'Sync All Enrollments'}
          </button>
          <button
            onClick={() => setShowAddDevice(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm"
          >
            + Add Device
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-700 p-3 rounded-lg">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Device Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {deviceStatus.map((device) => (
          <div key={device.id} className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-800">{device.name}</h3>
                <p className="text-sm text-gray-500">{device.serialNumber}</p>
              </div>
              <span
                className={`px-2 py-1 rounded-full text-xs ${
                  device.isOnline ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}
              >
                {device.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-500">Enrollments:</span>{' '}
                <span className="font-medium">{device.enrollmentCount}</span>
              </div>
              <div>
                <span className="text-gray-500">Today:</span>{' '}
                <span className="font-medium">{device.punchesToday} punches</span>
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-400">
              Last sync: {formatDateTime(device.lastSyncAt)}
            </div>
          </div>
        ))}
        {deviceStatus.length === 0 && (
          <div className="col-span-3 text-center py-8 text-gray-500">
            No devices registered. Add a device to get started.
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {(['devices', 'logs', 'enrollments'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 border-b-2 font-medium capitalize ${
                activeTab === tab
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Devices Tab */}
      {activeTab === 'devices' && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Serial Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Address</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GMT</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrollments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {devices.map((device) => (
                <tr key={device.id}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{device.name}</div>
                    {device.model && <div className="text-sm text-gray-500">{device.model}</div>}
                  </td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{device.serialNumber}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">{device.ipAddress || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{device.location || '-'}</td>
                  <td className="px-6 py-4 text-sm font-mono text-gray-500">
                    {(() => {
                      const gmt = 4 + device.timezoneOffset;
                      return gmt >= 0 ? `GMT+${gmt}` : `GMT${gmt}`;
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${getStatusBadge(device.status)}`}>
                      {device.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{device._count.enrollments}</td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <button
                      onClick={() => handleSyncTime(device.id)}
                      className="text-purple-600 hover:text-purple-800"
                      title="Restart device to sync time (device will reboot)"
                    >
                      Restart & Sync
                    </button>
                    <button
                      onClick={() => handleOpenEditDevice(device)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteDevice(device.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {devices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                    No devices registered
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center">
            <select
              value={selectedLogDevice}
              onChange={(e) => setSelectedLogDevice(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="">All Devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search student/teacher name..."
              value={logSearch}
              onChange={(e) => setLogSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 w-64"
            />
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device User ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {punchLogs.map((log) => (
                <tr key={log.id}>
                  <td className="px-6 py-4 text-sm">{formatDateTime(log.punchTime)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{log.device?.name || '-'}</td>
                  <td className="px-6 py-4 font-mono text-sm">{log.deviceUserId}</td>
                  <td className="px-6 py-4 text-sm">
                    {log.attendance?.student?.fullName || log.enrollment?.student?.fullName || log.enrollment?.teacher?.fullName || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        log.punchType === 'in'
                          ? 'bg-green-100 text-green-800'
                          : log.punchType === 'out'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {log.punchType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 capitalize">{log.verifyMethod}</td>
                  <td className="px-6 py-4">
                    {log.processed ? (
                      <span className="text-green-600">Processed</span>
                    ) : (
                      <span className="text-red-600" title={log.errorMessage || ''}>
                        Failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {punchLogs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    No punch logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Enrollments Tab */}
      {activeTab === 'enrollments' && (
        <div className="space-y-4">
          <div className="flex gap-4 items-center">
            <select
              value={selectedEnrollDevice}
              onChange={(e) => setSelectedEnrollDevice(e.target.value)}
              className="border rounded-lg px-3 py-2"
            >
              <option value="">All Devices</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Device User ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enrolled At</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td className="px-6 py-4 text-sm text-gray-500">{enrollment.device?.name || '-'}</td>
                    <td className="px-6 py-4 font-mono text-sm">{enrollment.deviceUserId}</td>
                    <td className="px-6 py-4 text-sm capitalize">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        enrollment.memberType === 'teacher' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {enrollment.memberType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {enrollment.student?.fullName || enrollment.teacher?.fullName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-mono text-gray-500">
                      {enrollment.student?.studentCode || enrollment.teacher?.teacherCode || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        enrollment.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {enrollment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDateTime(enrollment.enrolledAt)}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handlePushToDevice(enrollment)}
                        className="text-green-600 hover:text-green-800"
                        title="Push user to device"
                      >
                        Push
                      </button>
                      <button
                        onClick={() => handleDeleteFromDevice(enrollment)}
                        className="text-orange-600 hover:text-orange-800"
                        title="Delete user from device only"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => handleDeleteEnrollment(enrollment.id)}
                        className="text-red-600 hover:text-red-800"
                        title="Delete enrollment and remove from device"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {enrollments.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No enrollments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Device Modal */}
      {showAddDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Add Biometric Device</h2>
            <form onSubmit={handleAddDevice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Serial Number *
                </label>
                <input
                  type="text"
                  value={newDevice.serialNumber}
                  onChange={(e) => setNewDevice({ ...newDevice, serialNumber: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Device serial number"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Find this in device menu: Menu → System Info → Device Info
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name *
                </label>
                <input
                  type="text"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., Main Entrance"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={newDevice.model}
                  onChange={(e) => setNewDevice({ ...newDevice, model: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., ZKTeco K40"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={newDevice.location}
                  onChange={(e) => setNewDevice({ ...newDevice, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., Ground Floor Reception"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={newDevice.ipAddress}
                  onChange={(e) => setNewDevice({ ...newDevice, ipAddress: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Timezone
                </label>
                <select
                  value={newDevice.timezoneOffset}
                  onChange={(e) => setNewDevice({ ...newDevice, timezoneOffset: parseFloat(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="-4">GMT+0 (UTC)</option>
                  <option value="-3">GMT+1</option>
                  <option value="-2">GMT+2</option>
                  <option value="-1">GMT+3</option>
                  <option value="0">GMT+4 (UAE - Same as server)</option>
                  <option value="1">GMT+5 (Pakistan)</option>
                  <option value="1.5">GMT+5:30 (India)</option>
                  <option value="2">GMT+6 (Bangladesh)</option>
                  <option value="4">GMT+8 (Singapore/China)</option>
                  <option value="5">GMT+9 (Japan/Korea)</option>
                  <option value="6">GMT+10 (Sydney)</option>
                  <option value="-5">GMT-1</option>
                  <option value="-6">GMT-2</option>
                  <option value="-7">GMT-3</option>
                  <option value="-8">GMT-4 (Eastern US)</option>
                  <option value="-9">GMT-5 (Central US)</option>
                  <option value="-10">GMT-6 (Mountain US)</option>
                  <option value="-11">GMT-7 (Pacific US)</option>
                  <option value="-12">GMT-8</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Server is in GMT+4 (UAE). Select the device&apos;s local timezone.</p>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setShowAddDevice(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Add Device
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Device Modal */}
      {showEditDevice && editingDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Edit Device</h2>
            <form onSubmit={handleEditDevice} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Serial Number
                </label>
                <input
                  type="text"
                  value={editingDevice.serialNumber}
                  className="w-full border rounded-lg px-3 py-2 bg-gray-100"
                  disabled
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Name *
                </label>
                <input
                  type="text"
                  value={editDevice.name}
                  onChange={(e) => setEditDevice({ ...editDevice, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={editDevice.model}
                  onChange={(e) => setEditDevice({ ...editDevice, model: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={editDevice.location}
                  onChange={(e) => setEditDevice({ ...editDevice, location: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IP Address
                </label>
                <input
                  type="text"
                  value={editDevice.ipAddress}
                  onChange={(e) => setEditDevice({ ...editDevice, ipAddress: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="e.g., 192.168.1.100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Device Timezone
                </label>
                <select
                  value={editDevice.timezoneOffset}
                  onChange={(e) => setEditDevice({ ...editDevice, timezoneOffset: parseFloat(e.target.value) })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="-4">GMT+0 (UTC)</option>
                  <option value="-3">GMT+1</option>
                  <option value="-2">GMT+2</option>
                  <option value="-1">GMT+3</option>
                  <option value="0">GMT+4 (UAE - Same as server)</option>
                  <option value="1">GMT+5 (Pakistan)</option>
                  <option value="1.5">GMT+5:30 (India)</option>
                  <option value="2">GMT+6 (Bangladesh)</option>
                  <option value="4">GMT+8 (Singapore/China)</option>
                  <option value="5">GMT+9 (Japan/Korea)</option>
                  <option value="6">GMT+10 (Sydney)</option>
                  <option value="-5">GMT-1</option>
                  <option value="-6">GMT-2</option>
                  <option value="-7">GMT-3</option>
                  <option value="-8">GMT-4 (Eastern US)</option>
                  <option value="-9">GMT-5 (Central US)</option>
                  <option value="-10">GMT-6 (Mountain US)</option>
                  <option value="-11">GMT-7 (Pacific US)</option>
                  <option value="-12">GMT-8</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Server is in GMT+4 (UAE). Select the device&apos;s local timezone.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={editDevice.status}
                  onChange={(e) => setEditDevice({ ...editDevice, status: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditDevice(false);
                    setEditingDevice(null);
                  }}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Device Configuration Help */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">Device Configuration</h3>
        <p className="text-sm text-blue-700 mb-2">
          Configure your ZKTeco device to push data to this server:
        </p>
        <ol className="text-sm text-blue-700 list-decimal list-inside space-y-1">
          <li>Go to Menu → Communication → Server Settings</li>
          <li>Set Server Address: <code className="bg-blue-100 px-1 rounded">your-server-ip</code></li>
          <li>Set Server Port: <code className="bg-blue-100 px-1 rounded">3000</code></li>
          <li>Enable &quot;Upload Attendance&quot; and &quot;Realtime&quot;</li>
          <li>Set Push Interval: 1 minute</li>
        </ol>
        <p className="text-sm text-blue-700 mt-2">
          ADMS Endpoint: <code className="bg-blue-100 px-1 rounded">http://your-server:3000/iclock/cdata</code>
        </p>
      </div>
    </div>
  );
}
