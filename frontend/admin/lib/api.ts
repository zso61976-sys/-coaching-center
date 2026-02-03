import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export async function login(email: string, password: string) {
  const response = await api.post('/auth/login', { email, password });
  if (response.data.success && response.data.data.access_token) {
    localStorage.setItem('auth_token', response.data.data.access_token);
    localStorage.setItem('user', JSON.stringify(response.data.data.user));
  }
  return response.data;
}

export async function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('user');
}

export async function getDashboard() {
  const response = await api.get('/admin/dashboard');
  return response.data;
}

export async function getBranches() {
  const response = await api.get('/admin/branches');
  return response.data;
}

export async function getStudents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
}) {
  const response = await api.get('/admin/students', { params });
  return response.data;
}

export async function createStudent(data: {
  student_code: string;
  full_name: string;
  branch_id: string;
  pin: string;
  phone?: string;
  email?: string;
  grade?: string;
  parents?: Array<{
    full_name: string;
    phone: string;
    relationship: string;
    is_primary: boolean;
  }>;
}) {
  const response = await api.post('/admin/students', data);
  return response.data;
}

export async function resetStudentPin(studentId: string, newPin: string) {
  const response = await api.post(`/admin/students/${studentId}/reset-pin`, {
    new_pin: newPin,
  });
  return response.data;
}

export async function getAttendanceReport(params?: {
  from?: string;
  to?: string;
  branch_id?: string;
  student_id?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const response = await api.get('/admin/attendance/report', { params });
  return response.data;
}

export async function getCurrentlyCheckedIn(branchId?: string) {
  const response = await api.get('/admin/attendance/current', {
    params: branchId ? { branch_id: branchId } : undefined,
  });
  return response.data;
}

export async function getDailyStats(date?: string, branchId?: string) {
  const response = await api.get('/admin/attendance/daily-stats', {
    params: { date, branch_id: branchId },
  });
  return response.data;
}

export async function getParents(params?: {
  page?: number;
  limit?: number;
  search?: string;
}) {
  const response = await api.get('/admin/parents', { params });
  return response.data;
}

export async function generateTelegramLink(parentId: string) {
  const response = await api.post(`/admin/parents/${parentId}/telegram/generate-link`);
  return response.data;
}

export async function getTelegramStats() {
  const response = await api.get('/admin/telegram-stats');
  return response.data;
}

export default api;
