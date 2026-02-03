import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const KIOSK_SECRET = process.env.KIOSK_SECRET || '';
const BRANCH_ID = process.env.BRANCH_ID || '660e8400-e29b-41d4-a716-446655440002';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Kiosk-Secret': KIOSK_SECRET,
  },
});

export interface CheckInResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    attendance_id: string;
    student: {
      student_id: string;
      full_name: string;
      student_code: string;
    };
    checkin_time: string;
    branch_name: string;
  };
}

export interface CheckOutResponse {
  success: boolean;
  message?: string;
  error?: string;
  data?: {
    attendance_id: string;
    student: {
      student_id: string;
      full_name: string;
      student_code: string;
    };
    checkin_time: string;
    checkout_time: string;
    duration_minutes: number;
    branch_name: string;
  };
}

export async function checkIn(studentCode: string, pin: string): Promise<CheckInResponse> {
  try {
    const response = await api.post('/kiosk/checkin', {
      student_code: studentCode,
      pin: pin,
      branch_id: BRANCH_ID,
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.data) {
      return error.response.data;
    }
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Unable to connect. Please try again.',
    };
  }
}

export async function checkOut(studentCode: string, pin: string): Promise<CheckOutResponse> {
  try {
    const response = await api.post('/kiosk/checkout', {
      student_code: studentCode,
      pin: pin,
      branch_id: BRANCH_ID,
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.data) {
      return error.response.data;
    }
    return {
      success: false,
      error: 'NETWORK_ERROR',
      message: 'Unable to connect. Please try again.',
    };
  }
}
