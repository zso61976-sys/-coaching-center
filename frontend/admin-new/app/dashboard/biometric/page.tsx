'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL
  : typeof window !== 'undefined'
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

interface DeviceUser {
  pin: string;
  name: string | null;
  code: string | null;
  type: string;
  enrolled: boolean;
  enrollmentId: string | null;
  lastSeen: string | null;
  fpCount: number;
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
    timezoneOffset: 4,
  });

  const [editDevice, setEditDevice] = useState({
    name: '',
    model: '',
    location: '',
    ipAddress: '',
    status: '',
    timezoneOffset: 4,
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
        // Fetch fingerprint counts for all enrolled PINs
        const pins = Array.from(new Set(data.data.map((e: Enrollment) => e.deviceUserId))) as string[];
        if (pins.length > 0) {
          fetchFingerprintCounts(pins);
        }
      }
    } catch (err) {
      setError('Failed to fetch enrollments');
    }
  };

  const fetchFingerprintCounts = async (pins: string[]) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/fingerprint/batch-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ pins }),
      });
      const data = await res.json();
      if (data.success) {
        setFpCounts(data.data);
      }
    } catch (err) {
      // silently ignore
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
  const [fpCounts, setFpCounts] = useState<Record<string, number>>({});

  // Device Users modal state
  const [showDeviceUsers, setShowDeviceUsers] = useState(false);
  const [deviceUsersDevice, setDeviceUsersDevice] = useState<BiometricDevice | null>(null);
  const [deviceUsers, setDeviceUsers] = useState<DeviceUser[]>([]);
  const [deviceUsersLoading, setDeviceUsersLoading] = useState(false);
  const [selectedPins, setSelectedPins] = useState<Set<string>>(new Set());
  const [downloadingFp, setDownloadingFp] = useState(false);

  // Add profile from device user
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [addProfilePin, setAddProfilePin] = useState('');
  const [addProfileDeviceId, setAddProfileDeviceId] = useState('');
  const [addProfileDeviceName, setAddProfileDeviceName] = useState('');
  const [addProfileType, setAddProfileType] = useState<'student' | 'teacher'>('student');
  const [addProfileForm, setAddProfileForm] = useState({
    name: '', code: '', grade: '', phone: '',
    selectedSubjects: [] as string[],
    discount: 0, feeDueDate: '',
    salary: '',
    teacherSubjects: [] as string[],
    teacherClasses: [] as string[],
  });
  const [addProfileSaving, setAddProfileSaving] = useState(false);

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

  // Download fingerprint templates from a device
  const handleDownloadFingerprint = async (deviceId: string, pin: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/fingerprint/download/${deviceId}/${pin}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        alert('Download fingerprint command queued. Device will upload templates on next sync (wait ~30 seconds then refresh).');
        // Refresh FP counts after a short delay to check if device responded quickly
        setTimeout(() => {
          const pins = Array.from(new Set(enrollments.map(e => e.deviceUserId)));
          if (pins.length > 0) fetchFingerprintCounts(pins);
        }, 5000);
      } else {
        setError(data.message || 'Failed to download fingerprint');
      }
    } catch (err) {
      setError('Failed to download fingerprint');
    }
  };

  // Sync fingerprint templates to all enrolled devices
  const handleSyncFingerprint = async (pin: string) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/fingerprint/sync/${pin}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.synced > 0) {
          alert(`Fingerprint sync queued for ${data.data.synced} device(s). Devices will update on next poll.`);
        } else {
          alert(data.data.message || 'No fingerprint templates found. First download from a device where the user has enrolled their fingerprint.');
        }
      } else {
        setError(data.message || 'Failed to sync fingerprint');
      }
    } catch (err) {
      setError('Failed to sync fingerprint');
    }
  };

  const handleViewDeviceUsers = async (device: BiometricDevice) => {
    setDeviceUsersDevice(device);
    setDeviceUsers([]);
    setSelectedPins(new Set());
    setShowDeviceUsers(true);
    setDeviceUsersLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${device.id}/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setDeviceUsers(data.data);
      }
    } catch {
      setError('Failed to load device users');
    } finally {
      setDeviceUsersLoading(false);
    }
  };

  const handleTogglePin = (pin: string) => {
    setSelectedPins(prev => {
      const next = new Set(prev);
      if (next.has(pin)) next.delete(pin);
      else next.add(pin);
      return next;
    });
  };

  const handleSelectAllPins = () => {
    if (selectedPins.size === deviceUsers.length) {
      setSelectedPins(new Set());
    } else {
      setSelectedPins(new Set(deviceUsers.map(u => u.pin)));
    }
  };

  const handleDownloadSelectedFp = async () => {
    if (!deviceUsersDevice || selectedPins.size === 0) return;
    setDownloadingFp(true);
    try {
      const res = await fetch(`${API_URL}/api/admin/biometric/devices/${deviceUsersDevice.id}/download-fp-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pins: Array.from(selectedPins) }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`Fingerprint download queued for ${selectedPins.size} user(s). Wait ~30 seconds then refresh to see FP counts update.`);
        setSelectedPins(new Set());
        // Refresh FP counts
        setTimeout(() => {
          const pins = deviceUsers.map(u => u.pin);
          if (pins.length > 0) fetchFingerprintCounts(pins);
          // Reload device users to get updated FP counts
          handleViewDeviceUsers(deviceUsersDevice);
        }, 15000);
      } else {
        setError(data.message || 'Failed to queue download');
      }
    } catch {
      setError('Failed to queue fingerprint download');
    } finally {
      setDownloadingFp(false);
    }
  };

  const allSubjects = [
    { id: '1', code: 'MTH-9', name: 'Mathematics', fee: 500, grade: '9th' },
    { id: '2', code: 'SCI-9', name: 'Science', fee: 500, grade: '9th' },
    { id: '3', code: 'ENG-9', name: 'English', fee: 400, grade: '9th' },
    { id: '4', code: 'SST-9', name: 'Social Studies', fee: 400, grade: '9th' },
    { id: '5', code: 'MTH-10', name: 'Mathematics', fee: 550, grade: '10th' },
    { id: '6', code: 'SCI-10', name: 'Science', fee: 550, grade: '10th' },
    { id: '7', code: 'ENG-10', name: 'English', fee: 450, grade: '10th' },
    { id: '8', code: 'SST-10', name: 'Social Studies', fee: 450, grade: '10th' },
    { id: '9', code: 'PHY-11', name: 'Physics', fee: 600, grade: '11th' },
    { id: '10', code: 'CHM-11', name: 'Chemistry', fee: 600, grade: '11th' },
    { id: '11', code: 'MTH-11', name: 'Mathematics', fee: 600, grade: '11th' },
    { id: '12', code: 'BIO-11', name: 'Biology', fee: 550, grade: '11th' },
    { id: '13', code: 'CS-11', name: 'Computer Science', fee: 650, grade: '11th' },
    { id: '14', code: 'PHY-12', name: 'Physics', fee: 650, grade: '12th' },
    { id: '15', code: 'CHM-12', name: 'Chemistry', fee: 650, grade: '12th' },
    { id: '16', code: 'MTH-12', name: 'Mathematics', fee: 650, grade: '12th' },
    { id: '17', code: 'BIO-12', name: 'Biology', fee: 600, grade: '12th' },
    { id: '18', code: 'CS-12', name: 'Computer Science', fee: 700, grade: '12th' },
  ];

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addProfileForm.name.trim() || !addProfileForm.code.trim()) return;
    setAddProfileSaving(true);
    try {
      let res: Response;
      if (addProfileType === 'teacher') {
        res = await fetch(`${API_URL}/api/admin/teachers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            teacher_code: addProfileForm.code.toUpperCase(),
            full_name: addProfileForm.name,
            phone: addProfileForm.phone || undefined,
            salary: addProfileForm.salary ? parseFloat(addProfileForm.salary) : undefined,
            attendance_id: addProfilePin,
            subjects: addProfileForm.teacherSubjects,
            classes: addProfileForm.teacherClasses,
            device_ids: [addProfileDeviceId],
          }),
        });
      } else {
        res = await fetch(`${API_URL}/api/admin/students`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            student_code: addProfileForm.code,
            full_name: addProfileForm.name,
            grade: addProfileForm.grade || undefined,
            biometric_id: addProfilePin,
            branch_id: '660e8400-e29b-41d4-a716-446655440002',
            device_ids: [addProfileDeviceId],
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Failed to create profile');
      setShowAddProfile(false);
      setAddProfilePin('');
      fetchDevices();
      fetchSyncStatus();
      alert(`${addProfileType === 'teacher' ? 'Teacher' : 'Student'} profile created and enrolled on ${addProfileDeviceName}! You can edit further details from the main dashboard.`);
    } catch (err: any) {
      setError(err.message || 'Failed to create profile');
    } finally {
      setAddProfileSaving(false);
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
                      const gmt = device.timezoneOffset;
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
                      onClick={() => handleViewDeviceUsers(device)}
                      className="text-green-600 hover:text-green-800 font-medium"
                      title="View all users on this device and download their fingerprints"
                    >
                      View Users
                    </button>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">FP</th>
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
                    <td className="px-6 py-4 text-sm">
                      {fpCounts[enrollment.deviceUserId] ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                            <path fillRule="evenodd" d="M12 1.5a.75.75 0 01.75.75V4.5a.75.75 0 01-1.5 0V2.25A.75.75 0 0112 1.5zM5.636 4.136a.75.75 0 011.06 0l1.592 1.591a.75.75 0 01-1.061 1.06l-1.591-1.59a.75.75 0 010-1.061zm12.728 0a.75.75 0 010 1.06l-1.591 1.592a.75.75 0 11-1.06-1.061l1.59-1.591a.75.75 0 011.061 0zm-6.816 4.496a.75.75 0 01.82.311l5.228 7.917a.75.75 0 01-.777 1.148l-2.097-.43 1.045 3.9a.75.75 0 01-1.45.388l-1.044-3.899-1.601 1.42a.75.75 0 01-1.247-.606l.569-9.47a.75.75 0 01.554-.679z" clipRule="evenodd" />
                          </svg>
                          {fpCounts[enrollment.deviceUserId]}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">None</span>
                      )}
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
                        onClick={() => handleDownloadFingerprint(enrollment.device.id, enrollment.deviceUserId)}
                        className="text-blue-600 hover:text-blue-800"
                        title="Download fingerprint from this device to server"
                      >
                        Get FP
                      </button>
                      <button
                        onClick={() => handleSyncFingerprint(enrollment.deviceUserId)}
                        className="text-purple-600 hover:text-purple-800"
                        title="Sync stored fingerprints to all other devices"
                      >
                        Sync FP
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
                    <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
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
                  <option value="-8">GMT-8 (Pacific US)</option>
                  <option value="-7">GMT-7 (Mountain US)</option>
                  <option value="-6">GMT-6 (Central US)</option>
                  <option value="-5">GMT-5 (Eastern US)</option>
                  <option value="-4">GMT-4</option>
                  <option value="-3">GMT-3</option>
                  <option value="-2">GMT-2</option>
                  <option value="-1">GMT-1</option>
                  <option value="0">GMT+0 (UTC)</option>
                  <option value="1">GMT+1</option>
                  <option value="2">GMT+2</option>
                  <option value="3">GMT+3</option>
                  <option value="4">GMT+4 (UAE/Dubai)</option>
                  <option value="5">GMT+5 (Pakistan)</option>
                  <option value="5.5">GMT+5:30 (India)</option>
                  <option value="6">GMT+6 (Bangladesh)</option>
                  <option value="7">GMT+7 (Thailand)</option>
                  <option value="8">GMT+8 (Singapore/China)</option>
                  <option value="9">GMT+9 (Japan/Korea)</option>
                  <option value="10">GMT+10 (Sydney)</option>
                  <option value="12">GMT+12 (New Zealand)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Select the device&apos;s local timezone.</p>
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
                  <option value="-8">GMT-8 (Pacific US)</option>
                  <option value="-7">GMT-7 (Mountain US)</option>
                  <option value="-6">GMT-6 (Central US)</option>
                  <option value="-5">GMT-5 (Eastern US)</option>
                  <option value="-4">GMT-4</option>
                  <option value="-3">GMT-3</option>
                  <option value="-2">GMT-2</option>
                  <option value="-1">GMT-1</option>
                  <option value="0">GMT+0 (UTC)</option>
                  <option value="1">GMT+1</option>
                  <option value="2">GMT+2</option>
                  <option value="3">GMT+3</option>
                  <option value="4">GMT+4 (UAE/Dubai)</option>
                  <option value="5">GMT+5 (Pakistan)</option>
                  <option value="5.5">GMT+5:30 (India)</option>
                  <option value="6">GMT+6 (Bangladesh)</option>
                  <option value="7">GMT+7 (Thailand)</option>
                  <option value="8">GMT+8 (Singapore/China)</option>
                  <option value="9">GMT+9 (Japan/Korea)</option>
                  <option value="10">GMT+10 (Sydney)</option>
                  <option value="12">GMT+12 (New Zealand)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Select the device&apos;s local timezone.</p>
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

      {/* Device Users Modal */}
      {showDeviceUsers && deviceUsersDevice && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Users on Device: {deviceUsersDevice.name}</h2>
                <p className="text-sm text-gray-500">Select users and download their fingerprints into the application</p>
              </div>
              <button
                onClick={() => { setShowDeviceUsers(false); setDeviceUsersDevice(null); setDeviceUsers([]); setSelectedPins(new Set()); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {deviceUsersLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
                <span className="ml-3 text-gray-500">Loading users from device...</span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPins.size === deviceUsers.length && deviceUsers.length > 0}
                        onChange={handleSelectAllPins}
                        className="rounded"
                      />
                      Select All ({deviceUsers.length} users)
                    </label>
                    {selectedPins.size > 0 && (
                      <span className="text-sm text-green-600 font-medium">{selectedPins.size} selected</span>
                    )}
                  </div>
                  <button
                    onClick={handleDownloadSelectedFp}
                    disabled={selectedPins.size === 0 || downloadingFp}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {downloadingFp ? 'Queuing...' : `Download FP for Selected (${selectedPins.size})`}
                  </button>
                </div>

                <div className="overflow-auto flex-1 border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FP Stored</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Seen</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">In System</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {deviceUsers.map((user) => (
                        <tr
                          key={user.pin}
                          className={`cursor-pointer hover:bg-gray-50 ${selectedPins.has(user.pin) ? 'bg-green-50' : ''}`}
                          onClick={() => handleTogglePin(user.pin)}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedPins.has(user.pin)}
                              onChange={() => handleTogglePin(user.pin)}
                              onClick={e => e.stopPropagation()}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 font-mono font-medium text-gray-900">{user.pin}</td>
                          <td className="px-4 py-3 text-gray-700">{user.name || <span className="text-gray-400 italic">Unknown</span>}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              user.type === 'student' ? 'bg-blue-100 text-blue-800' :
                              user.type === 'teacher' ? 'bg-purple-100 text-purple-800' :
                              'bg-gray-100 text-gray-600'
                            }`}>
                              {user.type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {user.fpCount > 0 ? (
                              <span className="text-green-600 font-medium">{user.fpCount} finger(s)</span>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{user.lastSeen ? formatDateTime(user.lastSeen) : '-'}</td>
                          <td className="px-4 py-3">
                            {user.enrolled ? (
                              <span className="text-green-600 text-xs font-medium">Yes</span>
                            ) : (
                              <span className="text-orange-500 text-xs font-medium">No</span>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            {!user.enrolled && (
                              <button
                                onClick={() => {
                                  if (!deviceUsersDevice) return;
                                  setAddProfilePin(user.pin);
                                  setAddProfileDeviceId(deviceUsersDevice.id);
                                  setAddProfileDeviceName(deviceUsersDevice.name);
                                  setAddProfileType('student');
                                  setAddProfileForm({ name: '', code: `S${user.pin}`, grade: '', phone: '', selectedSubjects: [], discount: 0, feeDueDate: '', salary: '', teacherSubjects: [], teacherClasses: [] });
                                  setShowDeviceUsers(false);
                                  setShowAddProfile(true);
                                }}
                                className="text-xs bg-orange-500 text-white px-2 py-1 rounded hover:bg-orange-600 whitespace-nowrap"
                              >
                                + Add to App
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {deviceUsers.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                            No users found on this device yet. Users appear here once they punch in or are enrolled.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-400 mt-3">
                  Tip: Select users whose fingerprints you want to save to the server, then click &quot;Download FP for Selected&quot;. The device will send the templates within 30 seconds.
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add Profile Modal — opens after Device Users modal is closed */}
      {showAddProfile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl">
            <div className="flex justify-between items-center p-5 border-b">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Add New Profile</h2>
                <p className="text-sm text-gray-500">
                  Device: <span className="font-medium">{addProfileDeviceName}</span> &nbsp;|&nbsp;
                  PIN: <span className="font-mono font-semibold">{addProfilePin}</span>
                </p>
              </div>
              <button onClick={() => setShowAddProfile(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>

            <form onSubmit={handleAddProfile} className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setAddProfileType('student'); setAddProfileForm(f => ({ ...f, code: `S${addProfilePin}` })); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${addProfileType === 'student' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    Student
                  </button>
                  <button type="button" onClick={() => { setAddProfileType('teacher'); setAddProfileForm(f => ({ ...f, code: `T${addProfilePin}` })); }}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border ${addProfileType === 'teacher' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                    Teacher
                  </button>
                </div>
              </div>

              {/* Name + Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                  <input type="text" required value={addProfileForm.name}
                    onChange={e => setAddProfileForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter full name" className="w-full border rounded-lg px-3 py-2 text-sm" autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{addProfileType === 'student' ? 'Student' : 'Teacher'} Code *</label>
                  <input type="text" required value={addProfileForm.code}
                    onChange={e => setAddProfileForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm font-mono" />
                </div>
              </div>

              {/* Phone + Grade/Salary */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                  <input type="text" value={addProfileForm.phone}
                    onChange={e => setAddProfileForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="03001234567" className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                {addProfileType === 'student' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Class / Grade</label>
                    <select value={addProfileForm.grade}
                      onChange={e => setAddProfileForm(f => ({ ...f, grade: e.target.value, selectedSubjects: [] }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select grade</option>
                      {['9th', '10th', '11th', '12th'].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Salary (Rs.)</label>
                    <input type="number" value={addProfileForm.salary}
                      onChange={e => setAddProfileForm(f => ({ ...f, salary: e.target.value }))}
                      placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                )}
              </div>

              {/* Subjects — student: filtered by grade; teacher: free multi-select */}
              {addProfileType === 'student' && addProfileForm.grade && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Subjects ({addProfileForm.grade})</label>
                  <div className="grid grid-cols-2 gap-2">
                    {allSubjects.filter(s => s.grade === addProfileForm.grade).map(s => (
                      <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox"
                          checked={addProfileForm.selectedSubjects.includes(s.id)}
                          onChange={() => setAddProfileForm(f => ({
                            ...f,
                            selectedSubjects: f.selectedSubjects.includes(s.id)
                              ? f.selectedSubjects.filter(x => x !== s.id)
                              : [...f.selectedSubjects, s.id],
                          }))} />
                        <span>{s.name}</span>
                        <span className="text-gray-400 text-xs">Rs.{s.fee}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {addProfileType === 'teacher' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Classes</label>
                  <div className="flex flex-wrap gap-2">
                    {['9th', '10th', '11th', '12th'].map(cls => (
                      <label key={cls} className="flex items-center gap-1 text-sm cursor-pointer">
                        <input type="checkbox"
                          checked={addProfileForm.teacherClasses.includes(cls)}
                          onChange={() => setAddProfileForm(f => ({
                            ...f,
                            teacherClasses: f.teacherClasses.includes(cls)
                              ? f.teacherClasses.filter(x => x !== cls)
                              : [...f.teacherClasses, cls],
                          }))} />
                        {cls}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Fee Due Date (student only) */}
              {addProfileType === 'student' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fee Due Date</label>
                    <input type="date" value={addProfileForm.feeDueDate}
                      onChange={e => setAddProfileForm(f => ({ ...f, feeDueDate: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Discount (Rs.)</label>
                    <input type="number" value={addProfileForm.discount}
                      onChange={e => setAddProfileForm(f => ({ ...f, discount: parseInt(e.target.value) || 0 }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
              )}

              {/* Device info (read-only) */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <span className="text-gray-500">Device:</span> <span className="font-medium">{addProfileDeviceName}</span>
                <span className="mx-2 text-gray-300">|</span>
                <span className="text-gray-500">Biometric PIN:</span> <span className="font-mono font-semibold">{addProfilePin}</span>
                <p className="text-xs text-gray-400 mt-1">Profile will be enrolled on this device automatically.</p>
              </div>

              {error && <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">{error}<button type="button" onClick={() => setError('')} className="ml-2 font-bold">×</button></div>}

              <div className="flex gap-3 justify-end pt-1 pb-1">
                <button type="button" onClick={() => setShowAddProfile(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50 text-sm">Cancel</button>
                <button type="submit" disabled={addProfileSaving}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium">
                  {addProfileSaving ? 'Saving...' : `Save ${addProfileType === 'student' ? 'Student' : 'Teacher'}`}
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
