'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const API_URL = typeof window !== 'undefined'
  ? `http://${window.location.hostname}:3000/api`
  : 'http://localhost:3000/api';

interface Parent {
  parent_id: string;
  full_name: string;
  phone: string;
  relationship: string;
  is_primary: boolean;
  telegram_connected: boolean;
  telegram_chat_id?: string;
}

interface Student {
  id: string;
  studentId: string;
  name: string;
  grade: string;
  biometricId: string;
  isActive: boolean;
  createdAt: string;
  subjects: string[];
  feesPaid: number;
  totalFees: number;
  feeDueDate: string;
  discount: number;
  finalAmount: number;
  parents?: Parent[];
  enrolledDeviceIds?: string[];
}

interface StudentFeeData {
  [studentId: string]: {
    subjects: string[];
    feesPaid: number;
    feeDueDate: string;
    discount: number;
    finalAmount: number;
  };
}

interface Subject {
  id: string;
  code: string;
  name: string;
  fee: number;
  grade: string;
}

interface AttendanceRecord {
  id: string;
  studentName: string;
  studentCode: string;
  studentGrade: string;
  checkInTime: string;
  checkOutTime?: string;
  duration?: string;
}

interface Teacher {
  id: string;
  teacherCode: string;
  name: string;
  phone: string;
  salary: number | null;
  biometricId: string;
  subjects: string[];
  classes: string[];
  isActive: boolean;
  enrolledDeviceIds?: string[];
}

interface ClassSchedule {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherCode: string;
  subjectCode: string;
  classGrade: string;
  dayOfWeek?: string;
  scheduleDate?: string;
  startTime: string;
  endTime: string;
  isRecurring: boolean;
}

// Available grades/classes
const grades = ['9th', '10th', '11th', '12th'];

// Teacher color palette for schedule
const teacherColors = [
  { bg: 'bg-blue-100', text: 'text-blue-800', hover: 'hover:bg-blue-200', border: 'border-blue-300' },
  { bg: 'bg-purple-100', text: 'text-purple-800', hover: 'hover:bg-purple-200', border: 'border-purple-300' },
  { bg: 'bg-pink-100', text: 'text-pink-800', hover: 'hover:bg-pink-200', border: 'border-pink-300' },
  { bg: 'bg-orange-100', text: 'text-orange-800', hover: 'hover:bg-orange-200', border: 'border-orange-300' },
  { bg: 'bg-teal-100', text: 'text-teal-800', hover: 'hover:bg-teal-200', border: 'border-teal-300' },
  { bg: 'bg-indigo-100', text: 'text-indigo-800', hover: 'hover:bg-indigo-200', border: 'border-indigo-300' },
  { bg: 'bg-rose-100', text: 'text-rose-800', hover: 'hover:bg-rose-200', border: 'border-rose-300' },
  { bg: 'bg-cyan-100', text: 'text-cyan-800', hover: 'hover:bg-cyan-200', border: 'border-cyan-300' },
  { bg: 'bg-amber-100', text: 'text-amber-800', hover: 'hover:bg-amber-200', border: 'border-amber-300' },
  { bg: 'bg-lime-100', text: 'text-lime-800', hover: 'hover:bg-lime-200', border: 'border-lime-300' },
];

// Fee collection interface
interface FeeCollection {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  date: string;
  month: string;
  receiptNo: string;
  paymentMode: string;
}

// Expense interface
interface Expense {
  id: string;
  category: 'salary' | 'rent' | 'utilities' | 'other';
  description: string;
  amount: number;
  date: string;
  teacherId?: string;
  teacherName?: string;
}

// Monthly summary interface
interface MonthlySummary {
  month: string;
  totalFees: number;
  totalSalaries: number;
  totalRent: number;
  totalUtilities: number;
  totalOther: number;
  netProfit: number;
}

// Biometric device interface
interface BiometricDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  location: string;
  status: string;
}

// Default subjects for the coaching center with class and code
const defaultSubjects: Subject[] = [
  // 9th Class Subjects
  { id: '1', code: 'MTH-9', name: 'Mathematics', fee: 500, grade: '9th' },
  { id: '2', code: 'SCI-9', name: 'Science', fee: 500, grade: '9th' },
  { id: '3', code: 'ENG-9', name: 'English', fee: 400, grade: '9th' },
  { id: '4', code: 'SST-9', name: 'Social Studies', fee: 400, grade: '9th' },
  // 10th Class Subjects
  { id: '5', code: 'MTH-10', name: 'Mathematics', fee: 550, grade: '10th' },
  { id: '6', code: 'SCI-10', name: 'Science', fee: 550, grade: '10th' },
  { id: '7', code: 'ENG-10', name: 'English', fee: 450, grade: '10th' },
  { id: '8', code: 'SST-10', name: 'Social Studies', fee: 450, grade: '10th' },
  // 11th Class Subjects
  { id: '9', code: 'PHY-11', name: 'Physics', fee: 600, grade: '11th' },
  { id: '10', code: 'CHM-11', name: 'Chemistry', fee: 600, grade: '11th' },
  { id: '11', code: 'MTH-11', name: 'Mathematics', fee: 600, grade: '11th' },
  { id: '12', code: 'BIO-11', name: 'Biology', fee: 550, grade: '11th' },
  { id: '13', code: 'CS-11', name: 'Computer Science', fee: 650, grade: '11th' },
  // 12th Class Subjects
  { id: '14', code: 'PHY-12', name: 'Physics', fee: 650, grade: '12th' },
  { id: '15', code: 'CHM-12', name: 'Chemistry', fee: 650, grade: '12th' },
  { id: '16', code: 'MTH-12', name: 'Mathematics', fee: 650, grade: '12th' },
  { id: '17', code: 'BIO-12', name: 'Biology', fee: 600, grade: '12th' },
  { id: '18', code: 'CS-12', name: 'Computer Science', fee: 700, grade: '12th' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { hasModuleAccess, hasRole } = useAuth();
  const [activeTab, setActiveTab] = useState<'students' | 'subjects' | 'teachers' | 'accounts' | 'reports'>('students');
  const [students, setStudents] = useState<Student[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>(defaultSubjects);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStudentForm, setShowStudentForm] = useState(false);
  const [showSubjectForm, setShowSubjectForm] = useState(false);
  const [formData, setFormData] = useState({
    studentId: '',
    name: '',
    grade: '',
    biometricId: '',
    selectedSubjects: [] as string[],
    selectedDevices: [] as string[],
    feesPaid: 0,
    feeDueDate: '',
    discount: 0,
    finalAmount: 0,
    parentName: '',
    parentPhone: '',
    parentTelegramChatId: '',
  });
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [subjectForm, setSubjectForm] = useState({ code: '', name: '', fee: '', grade: '' });
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [studentFeeData, setStudentFeeData] = useState<StudentFeeData>({});
  const [filterGrade, setFilterGrade] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterStudentId, setFilterStudentId] = useState('');
  const [filterTeacherId, setFilterTeacherId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Teacher state
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [showTeacherForm, setShowTeacherForm] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherForm, setTeacherForm] = useState({
    teacherCode: '',
    name: '',
    phone: '',
    salary: '',
    biometricId: '',
    subjects: [] as string[],
    classes: [] as string[],
    selectedDevices: [] as string[],
  });
  const [scheduleForm, setScheduleForm] = useState({
    teacherId: '',
    subjectCode: '',
    classGrade: '',
    dayOfWeek: '',
    scheduleDate: '',
    startTime: '',
    endTime: '',
    isRecurring: true,
  });
  const [scheduleView, setScheduleView] = useState<'weekly' | 'all'>('weekly');
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Accounts state
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [accountsView, setAccountsView] = useState<'fees' | 'expenses' | 'summary'>('fees');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [feeForm, setFeeForm] = useState({
    studentId: '',
    amount: 0,
    month: new Date().toISOString().slice(0, 7),
    paymentMode: 'cash',
  });
  const [expenseForm, setExpenseForm] = useState({
    category: 'other' as 'salary' | 'rent' | 'utilities' | 'other',
    description: '',
    amount: 0,
    date: new Date().toISOString().split('T')[0],
    teacherId: '',
  });

  // Helper function to get teacher color
  const getTeacherColor = (teacherId: string) => {
    const teacherIndex = teachers.findIndex(t => t.id === teacherId);
    return teacherColors[teacherIndex % teacherColors.length] || teacherColors[0];
  };

  // Generate receipt number
  const generateReceiptNo = () => {
    const date = new Date();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `RCP${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${random}`;
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/');
      return;
    }
    fetchStudents();
    fetchAttendance();
    fetchTeachers();
    fetchSchedules();
    fetchDevices();

    // Load subjects from localStorage
    const savedSubjects = localStorage.getItem('subjects');
    if (savedSubjects) {
      setSubjects(JSON.parse(savedSubjects));
    }

    // Load student fee data from localStorage
    const savedFeeData = localStorage.getItem('studentFeeData');
    if (savedFeeData) {
      setStudentFeeData(JSON.parse(savedFeeData));
    }

    // Load accounts data from localStorage
    const savedFeeCollections = localStorage.getItem('feeCollections');
    if (savedFeeCollections) {
      setFeeCollections(JSON.parse(savedFeeCollections));
    }
    const savedExpenses = localStorage.getItem('expenses');
    if (savedExpenses) {
      setExpenses(JSON.parse(savedExpenses));
    }
  }, [router]);

  const getToken = () => localStorage.getItem('token');

  const fetchStudents = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/students`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const studentsList = data?.data?.students || [];

        // Get saved fee data from localStorage
        const savedFeeData = localStorage.getItem('studentFeeData');
        const feeData: StudentFeeData = savedFeeData ? JSON.parse(savedFeeData) : {};

        setStudents(studentsList.map((s: any) => {
          const studentCode = s.student_code;
          const studentFee = feeData[studentCode] || { subjects: [], feesPaid: 0, feeDueDate: '', discount: 0, finalAmount: 0 };
          return {
            id: s.student_id,
            studentId: studentCode,
            name: s.full_name,
            grade: s.grade,
            biometricId: s.biometric_id || '',
            isActive: s.status === 'active',
            createdAt: s.created_at || new Date().toISOString(),
            subjects: studentFee.subjects,
            feesPaid: studentFee.feesPaid,
            totalFees: 0,
            feeDueDate: studentFee.feeDueDate,
            discount: studentFee.discount || 0,
            finalAmount: studentFee.finalAmount || 0,
            parents: s.parents || [],
            enrolledDeviceIds: s.enrolled_device_ids || [],
          };
        }));
      }
    } catch (err) {
      console.error('Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  const fetchAttendance = async (startDate?: string, endDate?: string) => {
    try {
      const start = startDate || reportStartDate;
      const end = endDate || reportEndDate;
      const res = await fetch(`${API_URL}/admin/attendance/punch-report?from=${start}&to=${end}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const records = data?.data?.records || data?.data || [];
        setAttendance(records.map((r: any) => ({
          id: r.attendance_id || r.id,
          studentName: r.student?.full_name || r.student_name || r.full_name,
          studentCode: r.student?.student_code || r.student_code,
          studentGrade: r.student?.grade || '',
          checkInTime: r.checkin_time || r.check_in_time,
          checkOutTime: r.checkout_time || r.check_out_time,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch attendance');
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/biometric/devices`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const devicesList = data?.data || [];
        setDevices(devicesList.map((d: any) => ({
          id: d.id,
          serialNumber: d.serialNumber,
          name: d.name,
          model: d.model || '',
          location: d.location || '',
          status: d.status,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch devices');
    }
  };

  // Teacher functions
  const fetchTeachers = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/teachers`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const teachersList = data?.data?.teachers || [];
        setTeachers(teachersList.map((t: any) => ({
          id: t.teacher_id,
          teacherCode: t.teacher_code,
          name: t.full_name,
          phone: t.phone || '',
          salary: t.salary || null,
          biometricId: t.attendance_id || '',
          subjects: t.subjects || [],
          classes: t.classes || [],
          isActive: t.status === 'active',
          enrolledDeviceIds: t.enrolled_device_ids || [],
        })));
      }
    } catch (err) {
      console.error('Failed to fetch teachers');
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await fetch(`${API_URL}/admin/schedules`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        const schedulesList = data?.data?.schedules || [];
        setSchedules(schedulesList.map((s: any) => ({
          id: s.schedule_id,
          teacherId: s.teacher_id,
          teacherName: s.teacher_name,
          teacherCode: s.teacher_code,
          subjectCode: s.subject_code,
          classGrade: s.class_grade,
          dayOfWeek: s.day_of_week,
          scheduleDate: s.schedule_date,
          startTime: s.start_time,
          endTime: s.end_time,
          isRecurring: s.is_recurring,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch schedules');
    }
  };

  const handleTeacherSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!teacherForm.teacherCode || !teacherForm.name) {
      setError('Teacher code and name are required');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/teachers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          teacher_code: teacherForm.teacherCode.toUpperCase(),
          full_name: teacherForm.name,
          phone: teacherForm.phone,
          salary: teacherForm.salary ? parseFloat(teacherForm.salary) : undefined,
          attendance_id: teacherForm.biometricId || undefined,
          subjects: teacherForm.subjects,
          classes: teacherForm.classes,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create teacher');

      setSuccess('Teacher created successfully');
      setTeacherForm({ teacherCode: '', name: '', phone: '', salary: '', biometricId: '', subjects: [], classes: [], selectedDevices: [] });
      setShowTeacherForm(false);
      fetchTeachers();
    } catch (err: any) {
      setError(err.message || 'Failed to create teacher');
    }
  };

  const handleUpdateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/admin/teachers/${editingTeacher.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          full_name: teacherForm.name,
          phone: teacherForm.phone,
          salary: teacherForm.salary ? parseFloat(teacherForm.salary) : undefined,
          subjects: teacherForm.subjects,
          classes: teacherForm.classes,
          device_ids: teacherForm.selectedDevices.length > 0 ? teacherForm.selectedDevices : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update teacher');

      setSuccess('Teacher updated successfully');
      setTeacherForm({ teacherCode: '', name: '', phone: '', salary: '', biometricId: '', subjects: [], classes: [], selectedDevices: [] });
      setEditingTeacher(null);
      setShowTeacherForm(false);
      fetchTeachers();
    } catch (err: any) {
      setError(err.message || 'Failed to update teacher');
    }
  };

  const handleDeleteTeacher = async (id: string) => {
    if (!confirm('Are you sure you want to delete this teacher?')) return;

    try {
      const res = await fetch(`${API_URL}/admin/teachers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to delete teacher');

      setSuccess('Teacher deleted successfully');
      fetchTeachers();
      fetchSchedules();
    } catch (err: any) {
      setError(err.message || 'Failed to delete teacher');
    }
  };

  const handleEditTeacher = (teacher: Teacher) => {
    setEditingTeacher(teacher);
    setTeacherForm({
      teacherCode: teacher.teacherCode,
      name: teacher.name,
      phone: teacher.phone,
      salary: teacher.salary ? String(teacher.salary) : '',
      biometricId: teacher.biometricId,
      subjects: teacher.subjects,
      classes: teacher.classes,
      selectedDevices: teacher.enrolledDeviceIds || [],
    });
    setShowTeacherForm(true);
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!scheduleForm.teacherId || !scheduleForm.subjectCode || !scheduleForm.classGrade || !scheduleForm.startTime || !scheduleForm.endTime) {
      setError('Please fill in all required fields');
      return;
    }

    if (scheduleForm.isRecurring && !scheduleForm.dayOfWeek) {
      setError('Day of week is required for recurring schedules');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          teacher_id: scheduleForm.teacherId,
          subject_code: scheduleForm.subjectCode,
          class_grade: scheduleForm.classGrade,
          day_of_week: scheduleForm.dayOfWeek || null,
          schedule_date: scheduleForm.scheduleDate || null,
          start_time: scheduleForm.startTime,
          end_time: scheduleForm.endTime,
          is_recurring: scheduleForm.isRecurring,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create schedule');

      setSuccess('Schedule created successfully');
      setScheduleForm({
        teacherId: '',
        subjectCode: '',
        classGrade: '',
        dayOfWeek: '',
        scheduleDate: '',
        startTime: '',
        endTime: '',
        isRecurring: true,
      });
      setShowScheduleForm(false);
      fetchSchedules();
    } catch (err: any) {
      setError(err.message || 'Failed to create schedule');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this schedule?')) return;

    try {
      const res = await fetch(`${API_URL}/admin/schedules/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error('Failed to delete schedule');

      setSuccess('Schedule deleted successfully');
      fetchSchedules();
    } catch (err: any) {
      setError(err.message || 'Failed to delete schedule');
    }
  };

  const handleTeacherClassToggle = (cls: string) => {
    setTeacherForm(prev => ({
      ...prev,
      classes: prev.classes.includes(cls)
        ? prev.classes.filter(c => c !== cls)
        : [...prev.classes, cls]
    }));
  };

  const handleTeacherSubjectToggle = (subjectCode: string) => {
    setTeacherForm(prev => ({
      ...prev,
      subjects: prev.subjects.includes(subjectCode)
        ? prev.subjects.filter(s => s !== subjectCode)
        : [...prev.subjects, subjectCode]
    }));
  };

  // Fee Collection handlers
  const handleFeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const student = students.find(s => s.id === feeForm.studentId);
    if (!student) {
      setError('Please select a student');
      return;
    }

    const newFee: FeeCollection = {
      id: Date.now().toString(),
      studentId: student.studentId,
      studentName: student.name,
      amount: feeForm.amount,
      date: new Date().toISOString(),
      month: feeForm.month,
      receiptNo: generateReceiptNo(),
      paymentMode: feeForm.paymentMode,
    };

    const updatedFees = [...feeCollections, newFee];
    setFeeCollections(updatedFees);
    localStorage.setItem('feeCollections', JSON.stringify(updatedFees));
    setFeeForm({ studentId: '', amount: 0, month: new Date().toISOString().slice(0, 7), paymentMode: 'cash' });
    setShowFeeForm(false);
    setSuccess(`Fee collected! Receipt No: ${newFee.receiptNo}`);
  };

  // Print receipt
  const printReceipt = (fee: FeeCollection) => {
    const student = students.find(s => s.studentId === fee.studentId);
    const studentSubjects = student?.subjects || [];
    const totalMonthlyFee = studentSubjects.reduce((sum, subCode) => {
      const subject = subjects.find(s => s.code === subCode || s.id === subCode);
      return sum + (subject?.fee || 0);
    }, 0);
    const totalPaidThisMonth = feeCollections
      .filter(f => f.studentId === fee.studentId && f.month === fee.month)
      .reduce((sum, f) => sum + f.amount, 0);
    const dueAmount = totalMonthlyFee - totalPaidThisMonth;

    const subjectsList = studentSubjects.map(subCode => {
      const subject = subjects.find(s => s.code === subCode || s.id === subCode);
      return `${subject?.name || subCode} - Rs. ${subject?.fee || 0}`;
    }).join('<br>');

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Fee Receipt - ${fee.receiptNo}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 450px; margin: 0 auto; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 24px; }
          .header p { margin: 5px 0; color: #666; }
          .receipt-no { background: #f0f0f0; padding: 10px; text-align: center; font-weight: bold; margin-bottom: 20px; }
          .details { margin-bottom: 20px; }
          .details table { width: 100%; border-collapse: collapse; }
          .details td { padding: 8px 0; border-bottom: 1px dashed #ccc; vertical-align: top; }
          .details td:last-child { text-align: right; font-weight: bold; }
          .amount { font-size: 24px; text-align: center; padding: 20px; background: #e8f5e9; border-radius: 10px; }
          .due { text-align: center; padding: 15px; background: ${dueAmount > 0 ? '#ffebee' : '#e8f5e9'}; border-radius: 10px; margin-top: 10px; }
          .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
          .signature { margin-top: 40px; text-align: right; }
          @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Coaching Center</h1>
          <p>Fee Receipt</p>
        </div>
        <div class="receipt-no">Receipt No: ${fee.receiptNo}</div>
        <div class="details">
          <table>
            <tr><td>Date:</td><td>${new Date(fee.date).toLocaleDateString()}</td></tr>
            <tr><td>Student ID:</td><td>${fee.studentId}</td></tr>
            <tr><td>Student Name:</td><td>${fee.studentName}</td></tr>
            <tr><td>Class:</td><td>${student?.grade || '-'}</td></tr>
            <tr><td>Fee Month:</td><td>${new Date(fee.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</td></tr>
            <tr><td>Subjects:</td><td style="font-size: 12px;">${subjectsList || '-'}</td></tr>
            <tr><td>Total Fee:</td><td>Rs. ${totalMonthlyFee.toLocaleString()}</td></tr>
            <tr><td>Payment Mode:</td><td>${fee.paymentMode.toUpperCase()}</td></tr>
          </table>
        </div>
        <div class="amount">
          <div style="font-size: 14px; color: #666;">Amount Paid (This Receipt)</div>
          <div style="font-size: 32px; font-weight: bold; color: #2e7d32;">Rs. ${fee.amount.toLocaleString()}</div>
        </div>
        <div class="due">
          <div style="font-size: 14px; color: #666;">Balance Due</div>
          <div style="font-size: 24px; font-weight: bold; color: ${dueAmount > 0 ? '#c62828' : '#2e7d32'};">
            ${dueAmount > 0 ? 'Rs. ' + dueAmount.toLocaleString() : 'FULLY PAID'}
          </div>
        </div>
        <div class="signature">
          <p>_______________________</p>
          <p>Authorized Signature</p>
        </div>
        <div class="footer">
          <p>Thank you for your payment!</p>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
      </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Expense handlers
  const handleExpenseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const teacher = expenseForm.category === 'salary' ? teachers.find(t => t.id === expenseForm.teacherId) : null;

    const newExpense: Expense = {
      id: Date.now().toString(),
      category: expenseForm.category,
      description: expenseForm.description || (expenseForm.category === 'salary' ? `Salary for ${teacher?.name}` : expenseForm.category),
      amount: expenseForm.amount,
      date: expenseForm.date,
      teacherId: teacher?.id,
      teacherName: teacher?.name,
    };

    const updatedExpenses = [...expenses, newExpense];
    setExpenses(updatedExpenses);
    localStorage.setItem('expenses', JSON.stringify(updatedExpenses));
    setExpenseForm({ category: 'other', description: '', amount: 0, date: new Date().toISOString().split('T')[0], teacherId: '' });
    setShowExpenseForm(false);
    setSuccess('Expense added successfully');
  };

  const handleDeleteExpense = (id: string) => {
    if (!confirm('Delete this expense?')) return;
    const updatedExpenses = expenses.filter(e => e.id !== id);
    setExpenses(updatedExpenses);
    localStorage.setItem('expenses', JSON.stringify(updatedExpenses));
    setSuccess('Expense deleted');
  };

  // Calculate monthly summary
  const calculateMonthlySummary = (month: string): MonthlySummary => {
    const monthFees = feeCollections.filter(f => f.month === month);
    const monthExpenses = expenses.filter(e => e.date.startsWith(month));

    const totalFees = monthFees.reduce((sum, f) => sum + f.amount, 0);
    const totalSalaries = monthExpenses.filter(e => e.category === 'salary').reduce((sum, e) => sum + e.amount, 0);
    const totalRent = monthExpenses.filter(e => e.category === 'rent').reduce((sum, e) => sum + e.amount, 0);
    const totalUtilities = monthExpenses.filter(e => e.category === 'utilities').reduce((sum, e) => sum + e.amount, 0);
    const totalOther = monthExpenses.filter(e => e.category === 'other').reduce((sum, e) => sum + e.amount, 0);
    const totalExpenses = totalSalaries + totalRent + totalUtilities + totalOther;

    return {
      month,
      totalFees,
      totalSalaries,
      totalRent,
      totalUtilities,
      totalOther,
      netProfit: totalFees - totalExpenses,
    };
  };

  // Get last 6 months for chart
  const getLast6Months = () => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      months.push(date.toISOString().slice(0, 7));
    }
    return months;
  };

  const handleSubjectToggle = (subjectId: string) => {
    setFormData(prev => ({
      ...prev,
      selectedSubjects: prev.selectedSubjects.includes(subjectId)
        ? prev.selectedSubjects.filter(id => id !== subjectId)
        : [...prev.selectedSubjects, subjectId]
    }));
  };

  const calculateTotalFees = () => {
    return formData.selectedSubjects.reduce((total, subjectId) => {
      const subject = subjects.find(s => s.id === subjectId);
      return total + (subject?.fee || 0);
    }, 0);
  };

  const calculateActualAmount = () => {
    const total = calculateTotalFees();
    const discountAmount = Math.round(total * formData.discount / 100);
    const calculated = total - discountAmount;
    // If admin has set a final amount override, use that
    return formData.finalAmount > 0 ? formData.finalAmount : calculated;
  };

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.selectedSubjects.length === 0) {
      setError('Please select at least one subject');
      return;
    }

    try {
      const res = await fetch(`${API_URL}/admin/students`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          student_code: formData.studentId,
          full_name: formData.name,
          grade: formData.grade,
          biometric_id: formData.biometricId || undefined,
          branch_id: '660e8400-e29b-41d4-a716-446655440002',
          parents: formData.parentName && formData.parentPhone ? [{
            full_name: formData.parentName,
            phone: formData.parentPhone,
            relationship: 'guardian',
            is_primary: true,
            telegram_chat_id: formData.parentTelegramChatId || undefined,
          }] : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Failed to create student');
      }

      const selectedSubjectNames = formData.selectedSubjects.map(id =>
        subjects.find(s => s.id === id)?.name
      ).filter(Boolean);

      // Save student fee data to localStorage for new student
      const savedFeeData = localStorage.getItem('studentFeeData');
      const feeData: StudentFeeData = savedFeeData ? JSON.parse(savedFeeData) : {};
      feeData[formData.studentId] = {
        subjects: formData.selectedSubjects,
        feesPaid: 0,
        feeDueDate: '',
        discount: formData.discount,
        finalAmount: formData.finalAmount,
      };
      localStorage.setItem('studentFeeData', JSON.stringify(feeData));
      setStudentFeeData(feeData);

      setSuccess(`Student created! ID: ${formData.studentId}, Subjects: ${selectedSubjectNames.join(', ')}, Total Fee: Rs. ${calculateTotalFees()}`);
      setFormData({ studentId: '', name: '', grade: '', biometricId: '', selectedSubjects: [] as string[], selectedDevices: [] as string[], feesPaid: 0, feeDueDate: '', discount: 0, finalAmount: 0, parentName: '', parentPhone: '', parentTelegramChatId: '' });
      setShowStudentForm(false);
      fetchStudents();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubjectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectForm.code || !subjectForm.name || !subjectForm.fee || !subjectForm.grade) return;

    const newSubject: Subject = {
      id: Date.now().toString(),
      code: subjectForm.code.toUpperCase(),
      name: subjectForm.name,
      fee: parseInt(subjectForm.fee),
      grade: subjectForm.grade,
    };

    const updatedSubjects = [...subjects, newSubject];
    setSubjects(updatedSubjects);
    localStorage.setItem('subjects', JSON.stringify(updatedSubjects));
    setSubjectForm({ code: '', name: '', fee: '', grade: '' });
    setShowSubjectForm(false);
    setSuccess(`Subject "${newSubject.code} - ${newSubject.name}" added for ${newSubject.grade} class`);
  };

  const handleDeleteSubject = (id: string) => {
    const updatedSubjects = subjects.filter(s => s.id !== id);
    setSubjects(updatedSubjects);
    localStorage.setItem('subjects', JSON.stringify(updatedSubjects));
  };

  const handleEditSubject = (subject: Subject) => {
    setEditingSubject(subject);
    setSubjectForm({ code: subject.code, name: subject.name, fee: subject.fee.toString(), grade: subject.grade });
    setShowSubjectForm(true);
  };

  const handleUpdateSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !subjectForm.code || !subjectForm.name || !subjectForm.fee || !subjectForm.grade) return;

    const updatedSubjects = subjects.map(s =>
      s.id === editingSubject.id
        ? { ...s, code: subjectForm.code.toUpperCase(), name: subjectForm.name, fee: parseInt(subjectForm.fee), grade: subjectForm.grade }
        : s
    );
    setSubjects(updatedSubjects);
    localStorage.setItem('subjects', JSON.stringify(updatedSubjects));
    setSubjectForm({ code: '', name: '', fee: '', grade: '' });
    setEditingSubject(null);
    setShowSubjectForm(false);
    setSuccess(`Subject "${subjectForm.code} - ${subjectForm.name}" updated successfully`);
  };

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student);

    // Load student fee data from localStorage
    const savedFeeData = localStorage.getItem('studentFeeData');
    const feeData: StudentFeeData = savedFeeData ? JSON.parse(savedFeeData) : {};
    const studentFee = feeData[student.studentId] || { subjects: [], feesPaid: 0, feeDueDate: '', discount: 0, finalAmount: 0 };

    // Get primary parent info if exists
    const primaryParent = student.parents?.find(p => p.is_primary) || student.parents?.[0];

    setFormData({
      studentId: student.studentId,
      name: student.name,
      grade: student.grade,
      biometricId: student.biometricId || '',
      selectedSubjects: studentFee.subjects,
      selectedDevices: student.enrolledDeviceIds || [],
      feesPaid: studentFee.feesPaid,
      feeDueDate: studentFee.feeDueDate,
      discount: studentFee.discount || 0,
      finalAmount: studentFee.finalAmount || 0,
      parentName: primaryParent?.full_name || '',
      parentPhone: primaryParent?.phone || '',
      parentTelegramChatId: primaryParent?.telegram_chat_id || '',
    });
    setShowStudentForm(true);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(`${API_URL}/admin/students/${editingStudent.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          full_name: formData.name,
          grade: formData.grade,
          status: 'active',
          device_ids: formData.selectedDevices.length > 0 ? formData.selectedDevices : undefined,
          parents: formData.parentName && formData.parentPhone ? [{
            fullName: formData.parentName,
            phone: formData.parentPhone,
            relationship: 'guardian',
            isPrimary: true,
            telegramChatId: formData.parentTelegramChatId || undefined,
          }] : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || 'Failed to update student');
      }

      // Save student fee data to localStorage
      const savedFeeData = localStorage.getItem('studentFeeData');
      const feeData: StudentFeeData = savedFeeData ? JSON.parse(savedFeeData) : {};
      feeData[formData.studentId] = {
        subjects: formData.selectedSubjects,
        feesPaid: formData.feesPaid,
        feeDueDate: formData.feeDueDate,
        discount: formData.discount,
        finalAmount: formData.finalAmount,
      };
      localStorage.setItem('studentFeeData', JSON.stringify(feeData));
      setStudentFeeData(feeData);

      const selectedSubjectNames = formData.selectedSubjects.map(id =>
        subjects.find(s => s.id === id)?.name
      ).filter(Boolean);

      setSuccess(`Student "${formData.name}" updated. Subjects: ${selectedSubjectNames.join(', ') || 'None'}, Fees Paid: Rs. ${formData.feesPaid}`);
      setFormData({ studentId: '', name: '', grade: '', biometricId: '', selectedSubjects: [] as string[], selectedDevices: [] as string[], feesPaid: 0, feeDueDate: '', discount: 0, finalAmount: 0, parentName: '', parentPhone: '', parentTelegramChatId: '' });
      setEditingStudent(null);
      setShowStudentForm(false);
      fetchStudents();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`Are you sure you want to delete student "${student.name}"? This will also remove their biometric enrollments.`)) return;
    try {
      const res = await fetch(`${API_URL}/admin/students/${student.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to delete student');
      setSuccess('Student deleted successfully');
      fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Failed to delete student');
    }
  };

  const handleGenerateTelegramLink = async (parentId: string, studentName: string) => {
    try {
      const res = await fetch(`${API_URL}/admin/parents/${parentId}/telegram/generate-link`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to generate Telegram link');
      const response = await res.json();

      // Copy link to clipboard - backend returns data.data.telegram_link
      const link = response.data?.telegram_link || response.telegram_link || response.link;
      if (link) {
        await navigator.clipboard.writeText(link);
        setSuccess(`Telegram link copied! Send this to ${studentName}'s parent to connect.`);
      } else {
        throw new Error('No link in response');
      }
      fetchStudents();
    } catch (err: any) {
      setError(err.message || 'Failed to generate link');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/');
  };

  // Helper to format date with day name
  const formatDateWithDay = (dateStr: string) => {
    const date = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${date.toLocaleDateString()} (${days[date.getDay()]})`;
  };

  // Get filtered attendance based on all active filters
  const getFilteredAttendance = () => {
    return attendance.filter(record => {
      const student = students.find(s => s.studentId === record.studentCode);
      if (filterGrade && student?.grade !== filterGrade) return false;
      if (filterSubject && !student?.subjects.includes(filterSubject)) return false;
      if (filterStudentId && record.studentCode !== filterStudentId) return false;
      if (filterTeacherId) {
        // Filter by teacher: show students who are in classes/subjects taught by this teacher
        const teacher = teachers.find(t => t.id === filterTeacherId);
        if (teacher) {
          const studentGrade = student?.grade || record.studentGrade;
          if (!teacher.classes.includes(studentGrade)) return false;
        }
      }
      return true;
    });
  };

  // Export attendance to Excel (CSV format)
  const exportToExcel = () => {
    const filteredAttendance = getFilteredAttendance();

    if (filteredAttendance.length === 0) {
      setError('No data to export');
      return;
    }

    const headers = ['Date', 'Day', 'Student Name', 'Student ID', 'Class', 'Check In', 'Check Out', 'Status'];
    const rows = filteredAttendance.map(record => {
      const student = students.find(s => s.studentId === record.studentCode);
      const checkInDate = record.checkInTime ? new Date(record.checkInTime) : null;
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      return [
        checkInDate ? checkInDate.toLocaleDateString() : '-',
        checkInDate ? days[checkInDate.getDay()] : '-',
        record.studentName,
        record.studentCode,
        student?.grade || '-',
        record.checkInTime ? new Date(record.checkInTime).toLocaleString() : '-',
        record.checkOutTime ? new Date(record.checkOutTime).toLocaleString() : '-',
        record.checkOutTime ? 'Checked Out' : 'Missing Checkout'
      ];
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `attendance_${reportStartDate}_to_${reportEndDate}.csv`;
    link.click();
    setSuccess('Attendance exported to Excel (CSV) successfully');
  };

  // Export attendance to PDF
  const exportToPDF = () => {
    const filteredAttendance = getFilteredAttendance();

    if (filteredAttendance.length === 0) {
      setError('No data to export');
      return;
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const filterStudent = filterStudentId ? students.find(s => s.studentId === filterStudentId) : null;
    const filterTeacher = filterTeacherId ? teachers.find(t => t.id === filterTeacherId) : null;

    // Create printable HTML content
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Attendance Report - ${formatDateWithDay(reportStartDate)} to ${formatDateWithDay(reportEndDate)}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
          h2 { color: #666; margin-top: 5px; font-size: 14px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f5f5f5; font-weight: bold; }
          tr:nth-child(even) { background-color: #fafafa; }
          .present { color: green; font-weight: bold; }
          .checked-out { color: #666; }
          .summary { margin-top: 20px; padding: 15px; background: #f0f0f0; border-radius: 5px; }
          .filters { margin-top: 10px; padding: 10px; background: #e8f4fd; border-radius: 5px; font-size: 13px; }
          .footer { margin-top: 30px; text-align: center; color: #999; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Coaching Center - Attendance Report</h1>
        <h2>Date: ${formatDateWithDay(reportStartDate)} to ${formatDateWithDay(reportEndDate)}</h2>

        <div class="filters">
          <strong>Filters Applied:</strong>
          ${filterGrade ? ` Class: ${filterGrade} |` : ''}
          ${filterSubject ? ` Subject: ${subjects.find(s => s.id === filterSubject)?.name || ''} |` : ''}
          ${filterStudent ? ` Student: ${filterStudent.name} (${filterStudent.studentId}) |` : ''}
          ${filterTeacher ? ` Teacher: ${filterTeacher.name} (${filterTeacher.teacherCode}) |` : ''}
          ${!filterGrade && !filterSubject && !filterStudentId && !filterTeacherId ? ' None (All Records)' : ''}
        </div>

        <div class="summary">
          <strong>Total Records:</strong> ${filteredAttendance.length} |
          <strong>Checked Out:</strong> ${filteredAttendance.filter(a => a.checkOutTime).length} |
          <strong>Missing Checkout:</strong> ${filteredAttendance.filter(a => !a.checkOutTime).length}
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Day</th>
              <th>Student Name</th>
              <th>Student ID</th>
              <th>Class</th>
              <th>Check In</th>
              <th>Check Out</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredAttendance.map((record, index) => {
              const student = students.find(s => s.studentId === record.studentCode);
              const checkInDate = record.checkInTime ? new Date(record.checkInTime) : null;
              return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${checkInDate ? checkInDate.toLocaleDateString() : '-'}</td>
                  <td>${checkInDate ? days[checkInDate.getDay()] : '-'}</td>
                  <td>${record.studentName}</td>
                  <td>${record.studentCode}</td>
                  <td>${student?.grade || '-'}</td>
                  <td>${record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}</td>
                  <td>${record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-'}</td>
                  <td class="${record.checkOutTime ? 'checked-out' : 'present'}">${record.checkOutTime ? 'Checked Out' : 'Missing Checkout'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="footer">
          Generated on ${new Date().toLocaleString()} | Coaching Center Attendance System
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
    setSuccess('PDF print dialog opened');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-gray-800">Coaching Center Admin</h1>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b">
          {[
            { id: 'students', label: 'Students', module: 'students' },
            { id: 'subjects', label: 'Subjects', module: 'students' },
            { id: 'teachers', label: 'Teachers', module: 'teachers' },
            { id: 'accounts', label: 'Accounts', module: 'accounts' },
            { id: 'reports', label: 'Attendance Reports', module: 'reports' },
          ].filter(tab => hasModuleAccess(tab.module)).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-green-600 border-b-2 border-green-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-4">
        {error && (
          <div className="bg-red-100 text-red-700 p-4 rounded-lg mb-4">{error}</div>
        )}
        {success && (
          <div className="bg-green-100 text-green-700 p-4 rounded-lg mb-4">{success}</div>
        )}

        {/* Students Tab */}
        {activeTab === 'students' && (
          <div>
            <div className="mb-6">
              <button
                onClick={() => {
                  setShowStudentForm(!showStudentForm);
                  if (showStudentForm) {
                    setEditingStudent(null);
                    setFormData({ studentId: '', name: '', grade: '', biometricId: '', selectedSubjects: [] as string[], selectedDevices: [] as string[], feesPaid: 0, feeDueDate: '', discount: 0, finalAmount: 0, parentName: '', parentPhone: '', parentTelegramChatId: '' });
                  }
                }}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                {showStudentForm ? 'Cancel' : '+ Add New Student'}
              </button>
            </div>

            {showStudentForm && (
              <div className="bg-white p-6 rounded-xl shadow mb-6">
                <h2 className="text-lg font-bold mb-4">{editingStudent ? 'Edit Student' : 'Register New Student'}</h2>
                <form onSubmit={editingStudent ? handleUpdateStudent : handleStudentSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                      <input
                        type="text"
                        value={formData.studentId}
                        onChange={(e) => setFormData({ ...formData, studentId: e.target.value })}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 ${editingStudent ? 'bg-gray-100' : ''}`}
                        placeholder="e.g., ST004"
                        required
                        disabled={!!editingStudent}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="Student name"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Class</label>
                      <select
                        value={formData.grade}
                        onChange={(e) => setFormData({ ...formData, grade: e.target.value, selectedSubjects: [] })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        <option value="">Select Class</option>
                        {grades.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Biometric ID {!editingStudent && '(Auto-generated if empty)'}
                      </label>
                      <input
                        type="text"
                        value={formData.biometricId}
                        onChange={(e) => setFormData({ ...formData, biometricId: e.target.value.replace(/\D/g, '') })}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 ${editingStudent ? 'bg-gray-100' : ''}`}
                        placeholder={editingStudent ? 'Cannot change' : 'e.g., 1001 (auto-generated if empty)'}
                        disabled={!!editingStudent}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        This ID is used for biometric device enrollment
                      </p>
                    </div>
                  </div>

                  {/* Parent Information */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent/Guardian Name
                      </label>
                      <input
                        type="text"
                        value={formData.parentName}
                        onChange={(e) => setFormData({ ...formData, parentName: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="Parent's full name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Parent Phone (for Telegram)
                      </label>
                      <input
                        type="tel"
                        value={formData.parentPhone}
                        onChange={(e) => setFormData({ ...formData, parentPhone: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="e.g., +971501234567"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Telegram Chat ID
                      </label>
                      <input
                        type="text"
                        value={formData.parentTelegramChatId}
                        onChange={(e) => setFormData({ ...formData, parentTelegramChatId: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="e.g., 1423055684"
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Get from @userinfobot in Telegram. Parent will receive notifications instantly.
                      </p>
                    </div>
                  </div>

                  {/* Subject Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Subjects {formData.grade && `for ${formData.grade} Class`}
                    </label>
                    {!formData.grade ? (
                      <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-700">
                        Please select a class first to see available subjects
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {subjects
                          .filter(subject => subject.grade === formData.grade)
                          .map(subject => (
                          <label
                            key={subject.id}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                              formData.selectedSubjects.includes(subject.id)
                                ? 'bg-green-50 border-green-500'
                                : 'bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedSubjects.includes(subject.id)}
                              onChange={() => handleSubjectToggle(subject.id)}
                              className="mr-3"
                            />
                            <div>
                              <div className="text-xs text-blue-600 font-bold">{subject.code}</div>
                              <div className="font-medium">{subject.name}</div>
                              <div className="text-sm text-gray-500">Rs. {subject.fee}/month</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Device Selection */}
                  {devices.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingStudent ? 'Enroll on Additional Devices' : 'Select Devices to Enroll On'}
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {devices.filter(d => d.status === 'active').map(device => (
                          <label
                            key={device.id}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer transition-colors ${
                              formData.selectedDevices.includes(device.id)
                                ? 'bg-purple-50 border-purple-500'
                                : 'bg-white border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={formData.selectedDevices.includes(device.id)}
                              onChange={() => {
                                const newDevices = formData.selectedDevices.includes(device.id)
                                  ? formData.selectedDevices.filter(d => d !== device.id)
                                  : [...formData.selectedDevices, device.id];
                                setFormData({ ...formData, selectedDevices: newDevices });
                              }}
                              className="mr-3"
                            />
                            <div>
                              <div className="font-medium">{device.name}</div>
                              <div className="text-xs text-gray-500">{device.location} - {device.serialNumber}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                      {formData.selectedDevices.length === 0 && (
                        <p className="text-sm text-yellow-600 mt-2">
                          No devices selected - user will be enrolled on all active devices
                        </p>
                      )}
                    </div>
                  )}

                  {/* Total Fees & Discount */}
                  {formData.selectedSubjects.length > 0 && (
                    <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <div className="text-lg font-bold text-blue-800">
                            Total Monthly Fee: Rs. {calculateTotalFees()}
                          </div>
                          <div className="text-sm text-blue-600">
                            {formData.selectedSubjects.length} subject(s) selected
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3 pt-3 border-t border-blue-200">
                        <div>
                          <label className="block text-sm font-medium text-blue-700 mb-1">Discount (%)</label>
                          <input
                            type="number"
                            value={formData.discount}
                            onChange={(e) => {
                              const discount = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                              setFormData({ ...formData, discount, finalAmount: 0 });
                            }}
                            className="w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            placeholder="0"
                            min="0"
                            max="100"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-blue-700 mb-1">
                            Final Amount Due (Rs.)
                            {!hasRole('admin') && <span className="text-xs text-gray-500 ml-1">(Admin only)</span>}
                          </label>
                          <input
                            type="number"
                            value={calculateActualAmount()}
                            onChange={(e) => setFormData({ ...formData, finalAmount: parseInt(e.target.value) || 0 })}
                            className={`w-full px-4 py-2 border rounded-lg font-bold text-lg ${
                              hasRole('admin')
                                ? 'border-blue-300 focus:ring-2 focus:ring-blue-500 bg-white'
                                : 'border-gray-200 bg-gray-100 text-gray-700 cursor-not-allowed'
                            }`}
                            readOnly={!hasRole('admin')}
                            min="0"
                          />
                          {formData.discount > 0 && (
                            <p className="text-xs text-blue-600 mt-1">
                              Discount: Rs. {Math.round(calculateTotalFees() * formData.discount / 100)} ({formData.discount}% off)
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Fee Payment Details - only for editing */}
                  {editingStudent && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fees Paid (Rs.)</label>
                        <input
                          type="number"
                          value={formData.feesPaid}
                          onChange={(e) => setFormData({ ...formData, feesPaid: parseInt(e.target.value) || 0 })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                          placeholder="Enter amount paid"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fee Due Date</label>
                        <input
                          type="date"
                          value={formData.feeDueDate}
                          onChange={(e) => setFormData({ ...formData, feeDueDate: e.target.value })}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        />
                      </div>
                    </div>
                  )}

                  {/* Fee Summary for editing */}
                  {editingStudent && formData.selectedSubjects.length > 0 && (
                    <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        <div>
                          <div className="text-sm text-yellow-700">Total Monthly Fee</div>
                          <div className="text-xl font-bold text-yellow-800">Rs. {calculateTotalFees()}</div>
                        </div>
                        {formData.discount > 0 && (
                          <div>
                            <div className="text-sm text-yellow-700">Discount</div>
                            <div className="text-xl font-bold text-orange-600">{formData.discount}%</div>
                          </div>
                        )}
                        <div>
                          <div className="text-sm text-yellow-700">Amount Due</div>
                          <div className="text-xl font-bold text-blue-700">Rs. {calculateActualAmount()}</div>
                        </div>
                        <div>
                          <div className="text-sm text-yellow-700">Fees Paid</div>
                          <div className="text-xl font-bold text-green-600">Rs. {formData.feesPaid}</div>
                        </div>
                        <div>
                          <div className="text-sm text-yellow-700">Balance Due</div>
                          <div className={`text-xl font-bold ${calculateActualAmount() - formData.feesPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
                            Rs. {calculateActualAmount() - formData.feesPaid}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-yellow-700">Due Date</div>
                          <div className="text-xl font-bold text-yellow-800">
                            {formData.feeDueDate ? new Date(formData.feeDueDate).toLocaleDateString() : 'Not set'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                  >
                    {editingStudent ? 'Update Student' : 'Create Student'}
                  </button>
                </form>
              </div>
            )}

            {/* Students Table */}
            <div className="bg-white rounded-xl shadow">
              <div className="p-6 border-b">
                <h2 className="text-lg font-bold">Students ({students.length})</h2>
              </div>
              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : students.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No students registered yet. Click "Add New Student" to register.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Biometric ID</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subjects</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fees Paid</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Telegram</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {students.map((student) => {
                        const studentSubjectNames = student.subjects.map(id =>
                          subjects.find(s => s.id === id)?.name
                        ).filter(Boolean);
                        const studentTotalFee = student.subjects.reduce((total, subjectId) => {
                          const subject = subjects.find(s => s.id === subjectId);
                          return total + (subject?.fee || 0);
                        }, 0);
                        const studentDiscount = student.discount || 0;
                        const discountAmount = Math.round(studentTotalFee * studentDiscount / 100);
                        const studentActualAmount = student.finalAmount > 0 ? student.finalAmount : studentTotalFee - discountAmount;
                        const isDueDatePassed = student.feeDueDate && new Date(student.feeDueDate) < new Date();

                        return (
                          <tr key={student.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 font-medium">{student.studentId}</td>
                            <td className="px-4 py-4">{student.name}</td>
                            <td className="px-4 py-4">{student.grade}</td>
                            <td className="px-4 py-4">
                              <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                {student.biometricId || '-'}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {studentSubjectNames.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {studentSubjectNames.slice(0, 2).map((name, i) => (
                                    <span key={i} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                      {name}
                                    </span>
                                  ))}
                                  {studentSubjectNames.length > 2 && (
                                    <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                                      +{studentSubjectNames.length - 2} more
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-sm">No subjects</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="text-sm">
                                <div className="font-medium text-green-600">Rs. {student.feesPaid}</div>
                                {studentTotalFee > 0 && (
                                  <div className="text-xs text-gray-500">
                                    of Rs. {studentActualAmount}
                                    {studentDiscount > 0 && (
                                      <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 rounded text-xs">
                                        {studentDiscount}% off
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              {student.feeDueDate ? (
                                <span className={`text-sm ${isDueDatePassed ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                  {new Date(student.feeDueDate).toLocaleDateString()}
                                  {isDueDatePassed && <span className="block text-xs">Overdue</span>}
                                </span>
                              ) : (
                                <span className="text-gray-400 text-sm">Not set</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className={`px-2 py-1 text-xs rounded-full ${student.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {student.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              {student.parents && student.parents.length > 0 ? (
                                <div className="space-y-1">
                                  {student.parents.map((parent, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                      {parent.telegram_connected ? (
                                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">
                                          Connected
                                        </span>
                                      ) : (
                                        <button
                                          onClick={() => handleGenerateTelegramLink(parent.parent_id, student.name)}
                                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                        >
                                          Get Link
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-gray-400 text-xs">No parent</span>
                              )}
                            </td>
                            <td className="px-4 py-4 space-x-2">
                              <button
                                onClick={() => handleEditStudent(student)}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteStudent(student)}
                                className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subjects Tab */}
        {activeTab === 'subjects' && (
          <div>
            <div className="mb-6">
              <button
                onClick={() => {
                  setShowSubjectForm(!showSubjectForm);
                  if (showSubjectForm) {
                    setEditingSubject(null);
                    setSubjectForm({ code: '', name: '', fee: '', grade: '' });
                  }
                }}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
              >
                {showSubjectForm ? 'Cancel' : '+ Add New Subject'}
              </button>
            </div>

            {showSubjectForm && (
              <div className="bg-white p-6 rounded-xl shadow mb-6">
                <h2 className="text-lg font-bold mb-4">{editingSubject ? 'Edit Subject' : 'Add New Subject'}</h2>
                <form onSubmit={editingSubject ? handleUpdateSubject : handleSubjectSubmit}>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject Code</label>
                      <input
                        type="text"
                        value={subjectForm.code}
                        onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value.toUpperCase() })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="e.g., MTH-10"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject Name</label>
                      <input
                        type="text"
                        value={subjectForm.name}
                        onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="e.g., Mathematics"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Class/Grade</label>
                      <select
                        value={subjectForm.grade}
                        onChange={(e) => setSubjectForm({ ...subjectForm, grade: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        required
                      >
                        <option value="">Select Class</option>
                        {grades.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Fee (Rs.)</label>
                      <input
                        type="number"
                        value={subjectForm.fee}
                        onChange={(e) => setSubjectForm({ ...subjectForm, fee: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="500"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700"
                  >
                    {editingSubject ? 'Update Subject' : 'Add Subject'}
                  </button>
                </form>
              </div>
            )}

            {/* Filter by Class */}
            <div className="mb-4 flex gap-2 flex-wrap">
              <button
                onClick={() => setFilterGrade('')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${filterGrade === '' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                All Classes
              </button>
              {grades.map(g => (
                <button
                  key={g}
                  onClick={() => setFilterGrade(g)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${filterGrade === g ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* Subjects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subjects
                .filter(subject => !filterGrade || subject.grade === filterGrade)
                .map(subject => (
                <div key={subject.id} className="bg-white p-6 rounded-xl shadow">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">{subject.code}</span>
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded">{subject.grade}</span>
                      </div>
                      <h3 className="text-lg font-bold text-gray-800">{subject.name}</h3>
                      <p className="text-2xl font-bold text-green-600 mt-2">Rs. {subject.fee}</p>
                      <p className="text-sm text-gray-500">per month</p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleEditSubject(subject)}
                        className="text-blue-500 hover:text-blue-700 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subject.id)}
                        className="text-red-500 hover:text-red-700 text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Teachers Tab */}
        {activeTab === 'teachers' && (
          <div>
            {/* Teacher Management */}
            <div className="bg-white rounded-xl shadow mb-6">
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">Teachers</h2>
                <button
                  onClick={() => {
                    setShowTeacherForm(!showTeacherForm);
                    if (showTeacherForm) {
                      setEditingTeacher(null);
                      setTeacherForm({ teacherCode: '', name: '', phone: '', salary: '', biometricId: '', subjects: [], classes: [], selectedDevices: [] });
                    }
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {showTeacherForm ? 'Cancel' : '+ Add Teacher'}
                </button>
              </div>

              {/* Teacher Form */}
              {showTeacherForm && (
                <form onSubmit={editingTeacher ? handleUpdateTeacher : handleTeacherSubmit} className="p-6 border-b bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teacher Code *</label>
                      <input
                        type="text"
                        value={teacherForm.teacherCode}
                        onChange={(e) => setTeacherForm({ ...teacherForm, teacherCode: e.target.value.toUpperCase() })}
                        placeholder="TCH001"
                        className="w-full px-3 py-2 border rounded-lg"
                        disabled={!!editingTeacher}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input
                        type="text"
                        value={teacherForm.name}
                        onChange={(e) => setTeacherForm({ ...teacherForm, name: e.target.value })}
                        placeholder="Mr. Sharma"
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={teacherForm.phone}
                        onChange={(e) => setTeacherForm({ ...teacherForm, phone: e.target.value })}
                        placeholder="9876543210"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Salary</label>
                      <input
                        type="number"
                        value={teacherForm.salary}
                        onChange={(e) => setTeacherForm({ ...teacherForm, salary: e.target.value })}
                        placeholder="Monthly salary"
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Biometric ID</label>
                      <input
                        type="text"
                        value={teacherForm.biometricId}
                        onChange={(e) => setTeacherForm({ ...teacherForm, biometricId: e.target.value })}
                        placeholder="Auto-generated if empty"
                        className="w-full px-3 py-2 border rounded-lg"
                        disabled={!!editingTeacher}
                      />
                    </div>
                  </div>

                  {/* Classes Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Classes</label>
                    <div className="flex flex-wrap gap-2">
                      {grades.map(cls => (
                        <button
                          key={cls}
                          type="button"
                          onClick={() => handleTeacherClassToggle(cls)}
                          className={`px-4 py-2 rounded-lg border ${
                            teacherForm.classes.includes(cls)
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {cls}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subjects Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Subjects</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {subjects
                        .filter(s => teacherForm.classes.length === 0 || teacherForm.classes.includes(s.grade))
                        .map(subject => (
                          <label key={subject.id} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={teacherForm.subjects.includes(subject.code)}
                              onChange={() => handleTeacherSubjectToggle(subject.code)}
                              className="w-4 h-4 text-green-600"
                            />
                            <span className="text-sm">{subject.code} - {subject.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>

                  {/* Device Selection for Teachers */}
                  {devices.length > 0 && (
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {editingTeacher ? 'Enroll on Additional Devices' : 'Select Devices to Enroll On'}
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {devices.filter(d => d.status === 'active').map(device => (
                          <label key={device.id} className="flex items-center gap-2 p-2 border rounded-lg hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={teacherForm.selectedDevices.includes(device.id)}
                              onChange={() => {
                                const newDevices = teacherForm.selectedDevices.includes(device.id)
                                  ? teacherForm.selectedDevices.filter(d => d !== device.id)
                                  : [...teacherForm.selectedDevices, device.id];
                                setTeacherForm({ ...teacherForm, selectedDevices: newDevices });
                              }}
                              className="w-4 h-4 text-purple-600"
                            />
                            <div>
                              <span className="text-sm font-medium">{device.name}</span>
                              <span className="text-xs text-gray-500 ml-1">({device.location})</span>
                            </div>
                          </label>
                        ))}
                      </div>
                      {teacherForm.selectedDevices.length === 0 && (
                        <p className="text-sm text-yellow-600 mt-2">
                          No devices selected - teacher will be enrolled on all active devices
                        </p>
                      )}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    {editingTeacher ? 'Update Teacher' : 'Add Teacher'}
                  </button>
                </form>
              )}

              {/* Teachers Grid */}
              <div className="p-6">
                {teachers.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">No teachers added yet.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teachers.map(teacher => (
                      <div key={teacher.id} className="border rounded-xl p-4 hover:shadow-lg transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-bold rounded">{teacher.teacherCode}</span>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditTeacher(teacher)}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTeacher(teacher.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                        <h3 className="text-lg font-bold text-gray-800">{teacher.name}</h3>
                        {teacher.phone && <p className="text-gray-600 text-sm">{teacher.phone}</p>}
                        {teacher.biometricId && (
                          <p className="text-sm mt-1">
                            <span className="text-gray-500">Biometric ID:</span>{' '}
                            <span className="font-mono font-bold text-orange-600">{teacher.biometricId}</span>
                          </p>
                        )}
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 mb-1">Classes:</p>
                          <div className="flex flex-wrap gap-1">
                            {teacher.classes.map(cls => (
                              <span key={cls} className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">{cls}</span>
                            ))}
                          </div>
                        </div>
                        <div className="mt-2">
                          <p className="text-xs text-gray-500 mb-1">Subjects:</p>
                          <div className="flex flex-wrap gap-1">
                            {teacher.subjects.map(sub => (
                              <span key={sub} className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">{sub}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Class Schedule */}
            <div className="bg-white rounded-xl shadow">
              <div className="p-6 border-b flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold">Class Schedule</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScheduleView('weekly')}
                      className={`px-3 py-1 rounded ${scheduleView === 'weekly' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}
                    >
                      Weekly
                    </button>
                    <button
                      onClick={() => setScheduleView('all')}
                      className={`px-3 py-1 rounded ${scheduleView === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100'}`}
                    >
                      All Sessions
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setShowScheduleForm(!showScheduleForm)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  {showScheduleForm ? 'Cancel' : '+ Add Schedule'}
                </button>
              </div>

              {/* Schedule Form */}
              {showScheduleForm && (
                <form onSubmit={handleScheduleSubmit} className="p-6 border-b bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Teacher *</label>
                      <select
                        value={scheduleForm.teacherId}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, teacherId: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      >
                        <option value="">Select Teacher</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.teacherCode})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Class *</label>
                      <select
                        value={scheduleForm.classGrade}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, classGrade: e.target.value, subjectCode: '' })}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      >
                        <option value="">Select Class</option>
                        {grades.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Subject *</label>
                      <select
                        value={scheduleForm.subjectCode}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, subjectCode: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      >
                        <option value="">Select Subject</option>
                        {subjects
                          .filter(s => !scheduleForm.classGrade || s.grade === scheduleForm.classGrade)
                          .map(s => (
                            <option key={s.id} value={s.code}>{s.code} - {s.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Type</label>
                      <select
                        value={scheduleForm.isRecurring ? 'weekly' : 'once'}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, isRecurring: e.target.value === 'weekly' })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="weekly">Weekly (Recurring)</option>
                        <option value="once">One-time Session</option>
                      </select>
                    </div>
                    {scheduleForm.isRecurring ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Day *</label>
                        <select
                          value={scheduleForm.dayOfWeek}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        >
                          <option value="">Select Day</option>
                          {daysOfWeek.map(day => (
                            <option key={day} value={day}>{day}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                        <input
                          type="date"
                          value={scheduleForm.scheduleDate}
                          onChange={(e) => setScheduleForm({ ...scheduleForm, scheduleDate: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                      <input
                        type="time"
                        value={scheduleForm.startTime}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                      <input
                        type="time"
                        value={scheduleForm.endTime}
                        onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Add Schedule
                  </button>
                </form>
              )}

              {/* Weekly Timetable View */}
              {scheduleView === 'weekly' && (
                <div className="p-6 overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="border p-3 bg-gray-100 text-left">Time</th>
                        {daysOfWeek.map(day => (
                          <th key={day} className="border p-3 bg-gray-100 text-center min-w-[120px]">{day}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const timeSlots = Array.from(new Set(schedules.filter(s => s.isRecurring).map(s => `${s.startTime}-${s.endTime}`))).sort();
                        if (timeSlots.length === 0) {
                          return (
                            <tr>
                              <td colSpan={7} className="border p-8 text-center text-gray-500">
                                No weekly schedules added yet.
                              </td>
                            </tr>
                          );
                        }
                        return timeSlots.map(slot => (
                          <tr key={slot}>
                            <td className="border p-3 font-medium bg-gray-50">{slot}</td>
                            {daysOfWeek.map(day => {
                              const daySchedules = schedules.filter(
                                s => s.isRecurring && s.dayOfWeek === day && `${s.startTime}-${s.endTime}` === slot
                              );
                              return (
                                <td key={day} className="border p-2">
                                  {daySchedules.map(sch => {
                                    const color = getTeacherColor(sch.teacherId);
                                    return (
                                      <div
                                        key={sch.id}
                                        className={`p-2 ${color.bg} ${color.hover} rounded mb-1 text-xs cursor-pointer border ${color.border}`}
                                        onClick={() => handleDeleteSchedule(sch.id)}
                                        title="Click to delete"
                                      >
                                        <div className={`font-bold ${color.text}`}>{sch.subjectCode}</div>
                                        <div className={color.text}>{sch.classGrade}</div>
                                        <div className="text-gray-600">{sch.teacherName}</div>
                                      </div>
                                    );
                                  })}
                                </td>
                              );
                            })}
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
              )}

              {/* All Sessions View */}
              {scheduleView === 'all' && (
                <div className="p-6">
                  {schedules.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">No schedules added yet.</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {schedules.map(sch => (
                        <div key={sch.id} className="border rounded-lg p-4 hover:shadow-md">
                          <div className="flex justify-between items-start mb-2">
                            <span className={`px-2 py-1 text-xs rounded ${sch.isRecurring ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                              {sch.isRecurring ? 'Weekly' : 'One-time'}
                            </span>
                            <button
                              onClick={() => handleDeleteSchedule(sch.id)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Delete
                            </button>
                          </div>
                          <div className="font-bold text-lg">{sch.subjectCode}</div>
                          <div className="text-gray-600">{subjects.find(s => s.code === sch.subjectCode)?.name}</div>
                          <div className="mt-2 text-sm">
                            <div><span className="text-gray-500">Class:</span> {sch.classGrade}</div>
                            <div><span className="text-gray-500">Teacher:</span> {sch.teacherName}</div>
                            <div><span className="text-gray-500">Time:</span> {sch.startTime} - {sch.endTime}</div>
                            {sch.isRecurring && <div><span className="text-gray-500">Day:</span> {sch.dayOfWeek}</div>}
                            {!sch.isRecurring && sch.scheduleDate && (
                              <div><span className="text-gray-500">Date:</span> {new Date(sch.scheduleDate).toLocaleDateString()}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accounts Tab */}
        {activeTab === 'accounts' && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-2 mb-6">
              {[
                { id: 'fees', label: 'Fee Collection' },
                { id: 'expenses', label: 'Expenses' },
                { id: 'summary', label: 'Profit Summary' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setAccountsView(tab.id as any)}
                  className={`px-4 py-2 rounded-lg font-medium ${
                    accountsView === tab.id
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Fee Collection View */}
            {accountsView === 'fees' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Fee Collection</h2>
                  <button
                    onClick={() => setShowFeeForm(!showFeeForm)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    {showFeeForm ? 'Cancel' : '+ Collect Fee'}
                  </button>
                </div>

                {showFeeForm && (
                  <form onSubmit={handleFeeSubmit} className="bg-white p-6 rounded-xl shadow mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Student *</label>
                        <select
                          value={feeForm.studentId}
                          onChange={(e) => setFeeForm({ ...feeForm, studentId: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        >
                          <option value="">Select Student</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.studentId} - {s.name} ({s.grade})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">For Month *</label>
                        <input
                          type="month"
                          value={feeForm.month}
                          onChange={(e) => setFeeForm({ ...feeForm, month: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs.) *</label>
                        <input
                          type="number"
                          value={feeForm.amount || ''}
                          onChange={(e) => setFeeForm({ ...feeForm, amount: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="Enter amount"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Payment Mode</label>
                        <select
                          value={feeForm.paymentMode}
                          onChange={(e) => setFeeForm({ ...feeForm, paymentMode: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                        >
                          <option value="cash">Cash</option>
                          <option value="upi">UPI</option>
                          <option value="bank">Bank Transfer</option>
                          <option value="card">Card</option>
                        </select>
                      </div>
                    </div>

                    {/* Student Fee Details */}
                    {feeForm.studentId && (() => {
                      const student = students.find(s => s.id === feeForm.studentId);
                      if (!student) return null;

                      const studentSubjects = student.subjects || [];
                      const totalMonthlyFee = studentSubjects.reduce((sum, subCode) => {
                        const subject = subjects.find(s => s.code === subCode || s.id === subCode);
                        return sum + (subject?.fee || 0);
                      }, 0);

                      // Calculate paid amount for this month
                      const paidThisMonth = feeCollections
                        .filter(f => f.studentId === student.studentId && f.month === feeForm.month)
                        .reduce((sum, f) => sum + f.amount, 0);

                      const dueAmount = totalMonthlyFee - paidThisMonth;

                      return (
                        <div className="mt-4 p-4 bg-gray-50 rounded-lg border">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h4 className="font-medium text-gray-700 mb-2">Student Details</h4>
                              <div className="text-sm space-y-1">
                                <div><span className="text-gray-500">Name:</span> <span className="font-medium">{student.name}</span></div>
                                <div><span className="text-gray-500">Class:</span> <span className="font-medium">{student.grade}</span></div>
                                <div><span className="text-gray-500">Subjects:</span></div>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {studentSubjects.length > 0 ? studentSubjects.map((subCode, idx) => {
                                    const subject = subjects.find(s => s.code === subCode || s.id === subCode);
                                    return (
                                      <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                                        {subject?.name || subCode} (Rs.{subject?.fee || 0})
                                      </span>
                                    );
                                  }) : <span className="text-gray-400 text-xs">No subjects assigned</span>}
                                </div>
                              </div>
                            </div>
                            <div>
                              <h4 className="font-medium text-gray-700 mb-2">Fee Summary for {new Date(feeForm.month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h4>
                              <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Total Monthly Fee:</span>
                                  <span className="font-bold">Rs. {totalMonthlyFee.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-gray-500">Already Paid:</span>
                                  <span className="font-medium text-green-600">Rs. {paidThisMonth.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm border-t pt-2">
                                  <span className="text-gray-700 font-medium">Due Amount:</span>
                                  <span className={`font-bold text-lg ${dueAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    Rs. {dueAmount.toLocaleString()}
                                  </span>
                                </div>
                                {dueAmount > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => setFeeForm({ ...feeForm, amount: dueAmount })}
                                    className="w-full mt-2 px-3 py-1 bg-blue-100 text-blue-700 rounded text-sm hover:bg-blue-200"
                                  >
                                    Pay Full Due (Rs. {dueAmount.toLocaleString()})
                                  </button>
                                )}
                                {dueAmount <= 0 && paidThisMonth > 0 && (
                                  <div className="text-green-600 text-sm font-medium text-center mt-2">
                                    ✓ Fully paid for this month
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {feeForm.amount > 0 && feeForm.amount < dueAmount && (
                            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                              Partial payment: Rs. {(dueAmount - feeForm.amount).toLocaleString()} will remain due after this payment
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <button type="submit" className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                      Collect Fee & Generate Receipt
                    </button>
                  </form>
                )}

                {/* Fee Collections Table */}
                <div className="bg-white rounded-xl shadow">
                  <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold">Recent Collections</h3>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3 py-1 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Receipt No</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">For Month</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Fee</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Paid</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {feeCollections
                          .filter(f => f.month === selectedMonth)
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map(fee => {
                            const student = students.find(s => s.studentId === fee.studentId);
                            const studentSubjects = student?.subjects || [];
                            const totalMonthlyFee = studentSubjects.reduce((sum, subCode) => {
                              const subject = subjects.find(s => s.code === subCode || s.id === subCode);
                              return sum + (subject?.fee || 0);
                            }, 0);
                            const totalPaidThisMonth = feeCollections
                              .filter(f2 => f2.studentId === fee.studentId && f2.month === fee.month)
                              .reduce((sum, f2) => sum + f2.amount, 0);
                            const dueAmount = totalMonthlyFee - totalPaidThisMonth;

                            return (
                              <tr key={fee.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 font-mono text-sm">{fee.receiptNo}</td>
                                <td className="px-4 py-3 text-sm">{new Date(fee.date).toLocaleDateString()}</td>
                                <td className="px-4 py-3">
                                  <div className="font-medium">{fee.studentName}</div>
                                  <div className="text-xs text-gray-500">{fee.studentId}</div>
                                </td>
                                <td className="px-4 py-3 text-sm">{new Date(fee.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                                <td className="px-4 py-3 text-sm">Rs. {totalMonthlyFee.toLocaleString()}</td>
                                <td className="px-4 py-3 font-bold text-green-600">Rs. {totalPaidThisMonth.toLocaleString()}</td>
                                <td className="px-4 py-3">
                                  {dueAmount > 0 ? (
                                    <span className="font-bold text-red-600">Rs. {dueAmount.toLocaleString()}</span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Paid</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded uppercase">{fee.paymentMode}</span>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    onClick={() => printReceipt(fee)}
                                    className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                                  >
                                    Print
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                    {feeCollections.filter(f => f.month === selectedMonth).length === 0 && (
                      <div className="p-8 text-center text-gray-500">No fee collections for this month</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Expenses View */}
            {accountsView === 'expenses' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold">Expenses</h2>
                  <button
                    onClick={() => setShowExpenseForm(!showExpenseForm)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    {showExpenseForm ? 'Cancel' : '+ Add Expense'}
                  </button>
                </div>

                {showExpenseForm && (
                  <form onSubmit={handleExpenseSubmit} className="bg-white p-6 rounded-xl shadow mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                        <select
                          value={expenseForm.category}
                          onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as any, teacherId: '' })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        >
                          <option value="salary">Teacher Salary</option>
                          <option value="rent">Building Rent</option>
                          <option value="utilities">Utilities (Electricity, Water)</option>
                          <option value="other">Other Expense</option>
                        </select>
                      </div>
                      {expenseForm.category === 'salary' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Teacher *</label>
                          <select
                            value={expenseForm.teacherId}
                            onChange={(e) => setExpenseForm({ ...expenseForm, teacherId: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                            required
                          >
                            <option value="">Select Teacher</option>
                            {teachers.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.teacherCode})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {expenseForm.category !== 'salary' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                          <input
                            type="text"
                            value={expenseForm.description}
                            onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="Enter description"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Amount (Rs.) *</label>
                        <input
                          type="number"
                          value={expenseForm.amount || ''}
                          onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseInt(e.target.value) || 0 })}
                          className="w-full px-3 py-2 border rounded-lg"
                          placeholder="Enter amount"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                        <input
                          type="date"
                          value={expenseForm.date}
                          onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                          className="w-full px-3 py-2 border rounded-lg"
                          required
                        />
                      </div>
                    </div>
                    <button type="submit" className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">
                      Add Expense
                    </button>
                  </form>
                )}

                {/* Expenses by Category */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  {[
                    { cat: 'salary', label: 'Teacher Salaries', icon: '👨‍🏫', color: 'blue' },
                    { cat: 'rent', label: 'Building Rent', icon: '🏢', color: 'purple' },
                    { cat: 'utilities', label: 'Utilities', icon: '💡', color: 'yellow' },
                    { cat: 'other', label: 'Other', icon: '📦', color: 'gray' },
                  ].map(item => {
                    const total = expenses
                      .filter(e => e.category === item.cat && e.date.startsWith(selectedMonth))
                      .reduce((sum, e) => sum + e.amount, 0);
                    return (
                      <div key={item.cat} className="bg-white p-4 rounded-xl shadow">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">{item.icon}</span>
                          <span className="font-medium text-gray-600">{item.label}</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">Rs. {total.toLocaleString()}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Expenses Table */}
                <div className="bg-white rounded-xl shadow">
                  <div className="p-4 border-b flex justify-between items-center">
                    <h3 className="font-bold">Expense Records</h3>
                    <input
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="px-3 py-1 border rounded-lg text-sm"
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {expenses
                          .filter(e => e.date.startsWith(selectedMonth))
                          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                          .map(exp => (
                            <tr key={exp.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm">{new Date(exp.date).toLocaleDateString()}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs rounded capitalize ${
                                  exp.category === 'salary' ? 'bg-blue-100 text-blue-700' :
                                  exp.category === 'rent' ? 'bg-purple-100 text-purple-700' :
                                  exp.category === 'utilities' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {exp.category}
                                </span>
                              </td>
                              <td className="px-4 py-3">{exp.description}</td>
                              <td className="px-4 py-3 font-bold text-red-600">Rs. {exp.amount.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleDeleteExpense(exp.id)}
                                  className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {expenses.filter(e => e.date.startsWith(selectedMonth)).length === 0 && (
                      <div className="p-8 text-center text-gray-500">No expenses for this month</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Profit Summary View */}
            {accountsView === 'summary' && (
              <div>
                <h2 className="text-xl font-bold mb-4">Profit & Loss Summary</h2>

                {/* Current Month Summary */}
                {(() => {
                  const summary = calculateMonthlySummary(selectedMonth);
                  const totalExpenses = summary.totalSalaries + summary.totalRent + summary.totalUtilities + summary.totalOther;
                  return (
                    <div className="bg-white p-6 rounded-xl shadow mb-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold">
                          {new Date(selectedMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </h3>
                        <input
                          type="month"
                          value={selectedMonth}
                          onChange={(e) => setSelectedMonth(e.target.value)}
                          className="px-3 py-1 border rounded-lg"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Income */}
                        <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                          <h4 className="font-medium text-green-800 mb-3">Income</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Student Fees</span>
                              <span className="font-bold text-green-600">Rs. {summary.totalFees.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="border-t border-green-300 mt-3 pt-3">
                            <div className="flex justify-between">
                              <span className="font-bold text-green-800">Total Income</span>
                              <span className="font-bold text-green-600 text-xl">Rs. {summary.totalFees.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Expenses */}
                        <div className="bg-red-50 p-4 rounded-xl border border-red-200">
                          <h4 className="font-medium text-red-800 mb-3">Expenses</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Teacher Salaries</span>
                              <span className="font-medium">Rs. {summary.totalSalaries.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Building Rent</span>
                              <span className="font-medium">Rs. {summary.totalRent.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Utilities</span>
                              <span className="font-medium">Rs. {summary.totalUtilities.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Other</span>
                              <span className="font-medium">Rs. {summary.totalOther.toLocaleString()}</span>
                            </div>
                          </div>
                          <div className="border-t border-red-300 mt-3 pt-3">
                            <div className="flex justify-between">
                              <span className="font-bold text-red-800">Total Expenses</span>
                              <span className="font-bold text-red-600 text-xl">Rs. {totalExpenses.toLocaleString()}</span>
                            </div>
                          </div>
                        </div>

                        {/* Net Profit */}
                        <div className={`p-4 rounded-xl border ${summary.netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                          <h4 className={`font-medium mb-3 ${summary.netProfit >= 0 ? 'text-blue-800' : 'text-orange-800'}`}>
                            {summary.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
                          </h4>
                          <div className="flex flex-col items-center justify-center h-32">
                            <span className={`text-4xl font-bold ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                              Rs. {Math.abs(summary.netProfit).toLocaleString()}
                            </span>
                            <span className={`mt-2 text-sm ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                              {summary.netProfit >= 0 ? 'Profit' : 'Loss'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 6-Month Chart */}
                <div className="bg-white p-6 rounded-xl shadow">
                  <h3 className="text-lg font-bold mb-4">Last 6 Months Trend</h3>
                  <div className="overflow-x-auto">
                    <div className="min-w-[600px]">
                      {/* Chart Header */}
                      <div className="flex justify-between mb-2 text-xs text-gray-500">
                        {getLast6Months().map(month => (
                          <div key={month} className="w-1/6 text-center">
                            {new Date(month + '-01').toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                        ))}
                      </div>

                      {/* Bar Chart */}
                      <div className="flex justify-between items-end h-48 gap-2 mb-4">
                        {getLast6Months().map(month => {
                          const summary = calculateMonthlySummary(month);
                          const maxVal = Math.max(
                            ...getLast6Months().map(m => {
                              const s = calculateMonthlySummary(m);
                              return Math.max(s.totalFees, s.totalSalaries + s.totalRent + s.totalUtilities + s.totalOther);
                            }),
                            1
                          );
                          const totalExp = summary.totalSalaries + summary.totalRent + summary.totalUtilities + summary.totalOther;
                          const feeHeight = (summary.totalFees / maxVal) * 100;
                          const expHeight = (totalExp / maxVal) * 100;
                          return (
                            <div key={month} className="w-1/6 flex gap-1 justify-center items-end h-full">
                              <div
                                className="w-8 bg-green-500 rounded-t transition-all"
                                style={{ height: `${feeHeight}%`, minHeight: summary.totalFees > 0 ? '4px' : '0' }}
                                title={`Income: Rs. ${summary.totalFees.toLocaleString()}`}
                              />
                              <div
                                className="w-8 bg-red-500 rounded-t transition-all"
                                style={{ height: `${expHeight}%`, minHeight: totalExp > 0 ? '4px' : '0' }}
                                title={`Expenses: Rs. ${totalExp.toLocaleString()}`}
                              />
                            </div>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div className="flex justify-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-green-500 rounded"></div>
                          <span>Income</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 bg-red-500 rounded"></div>
                          <span>Expenses</span>
                        </div>
                      </div>

                      {/* Monthly Figures Table */}
                      <div className="mt-6 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="py-2 text-left">Month</th>
                              <th className="py-2 text-right text-green-600">Income</th>
                              <th className="py-2 text-right text-red-600">Expenses</th>
                              <th className="py-2 text-right text-blue-600">Net Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getLast6Months().map(month => {
                              const summary = calculateMonthlySummary(month);
                              const totalExp = summary.totalSalaries + summary.totalRent + summary.totalUtilities + summary.totalOther;
                              return (
                                <tr key={month} className="border-b hover:bg-gray-50">
                                  <td className="py-2">{new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                                  <td className="py-2 text-right text-green-600 font-medium">Rs. {summary.totalFees.toLocaleString()}</td>
                                  <td className="py-2 text-right text-red-600 font-medium">Rs. {totalExp.toLocaleString()}</td>
                                  <td className={`py-2 text-right font-bold ${summary.netProfit >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                                    {summary.netProfit >= 0 ? '' : '-'}Rs. {Math.abs(summary.netProfit).toLocaleString()}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            {/* Date Range Filter */}
            <div className="bg-white p-4 rounded-xl shadow mb-6">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 items-end">
                  <button
                    onClick={() => fetchAttendance(reportStartDate, reportEndDate)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Generate Report
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0];
                      setReportStartDate(today);
                      setReportEndDate(today);
                      fetchAttendance(today, today);
                    }}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 text-sm font-medium"
                  >
                    Today
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const weekStart = new Date(today);
                      weekStart.setDate(today.getDate() - today.getDay());
                      const start = weekStart.toISOString().split('T')[0];
                      const end = today.toISOString().split('T')[0];
                      setReportStartDate(start);
                      setReportEndDate(end);
                      fetchAttendance(start, end);
                    }}
                    className="px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 text-sm font-medium"
                  >
                    This Week
                  </button>
                  <button
                    onClick={() => {
                      const today = new Date();
                      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                      const start = monthStart.toISOString().split('T')[0];
                      const end = today.toISOString().split('T')[0];
                      setReportStartDate(start);
                      setReportEndDate(end);
                      fetchAttendance(start, end);
                    }}
                    className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 text-sm font-medium"
                  >
                    This Month
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Class</label>
                  <select
                    value={filterGrade}
                    onChange={(e) => setFilterGrade(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Classes</option>
                    {grades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Subject</label>
                  <select
                    value={filterSubject}
                    onChange={(e) => setFilterSubject(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Subjects</option>
                    {subjects
                      .filter(s => !filterGrade || s.grade === filterGrade)
                      .map(s => (
                      <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Student</label>
                  <select
                    value={filterStudentId}
                    onChange={(e) => setFilterStudentId(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Students</option>
                    {students
                      .filter(s => !filterGrade || s.grade === filterGrade)
                      .map(s => (
                      <option key={s.studentId} value={s.studentId}>{s.studentId} - {s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Teacher</label>
                  <select
                    value={filterTeacherId}
                    onChange={(e) => setFilterTeacherId(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Teachers</option>
                    {teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.teacherCode} - {t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="text-sm font-medium text-gray-500">Missing Checkout</h3>
                <p className="text-3xl font-bold text-yellow-600 mt-2">{attendance.filter(a => !a.checkOutTime).length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="text-sm font-medium text-gray-500">Total Students</h3>
                <p className="text-3xl font-bold text-blue-600 mt-2">{students.length}</p>
              </div>
              <div className="bg-white p-6 rounded-xl shadow">
                <h3 className="text-sm font-medium text-gray-500">Check-ins ({formatDateWithDay(reportStartDate)} - {formatDateWithDay(reportEndDate)})</h3>
                <p className="text-3xl font-bold text-purple-600 mt-2">{attendance.length}</p>
              </div>
            </div>

            {/* Attendance Table */}
            <div className="bg-white rounded-xl shadow">
              <div className="p-6 border-b flex justify-between items-center">
                <h2 className="text-lg font-bold">
                  Attendance Report ({formatDateWithDay(reportStartDate)} - {formatDateWithDay(reportEndDate)})
                  {filterGrade && ` - ${filterGrade} Class`}
                  {filterSubject && ` - ${subjects.find(s => s.id === filterSubject)?.name || ''}`}
                  {filterStudentId && ` - ${students.find(s => s.studentId === filterStudentId)?.name || ''}`}
                  {filterTeacherId && ` - Teacher: ${teachers.find(t => t.id === filterTeacherId)?.name || ''}`}
                </h2>
                <div className="flex gap-2">
                  <button
                    onClick={exportToExcel}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Export Excel
                  </button>
                  <button
                    onClick={exportToPDF}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                  >
                    Export PDF
                  </button>
                  <button
                    onClick={() => fetchAttendance()}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Refresh
                  </button>
                </div>
              </div>
              {(() => {
                const filteredAttendance = getFilteredAttendance();
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

                return filteredAttendance.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No attendance records for the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Day</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Class</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check In</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Check Out</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {filteredAttendance.map((record) => {
                          const student = students.find(s => s.studentId === record.studentCode);
                          const checkInDate = record.checkInTime ? new Date(record.checkInTime) : null;
                          return (
                            <tr key={record.id} className="hover:bg-gray-50">
                              <td className="px-4 py-4 text-sm">
                                {checkInDate ? checkInDate.toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-4 text-sm">
                                <span className="px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded">
                                  {checkInDate ? days[checkInDate.getDay()] : '-'}
                                </span>
                              </td>
                              <td className="px-4 py-4 font-medium">{record.studentName}</td>
                              <td className="px-4 py-4">{record.studentCode}</td>
                              <td className="px-4 py-4">
                                <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded">
                                  {student?.grade || '-'}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                {record.checkInTime ? new Date(record.checkInTime).toLocaleTimeString() : '-'}
                              </td>
                              <td className="px-4 py-4">
                                {record.checkOutTime ? new Date(record.checkOutTime).toLocaleTimeString() : '-'}
                              </td>
                              <td className="px-4 py-4">
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  record.checkOutTime
                                    ? 'bg-gray-100 text-gray-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {record.checkOutTime ? 'Checked Out' : 'Missing Checkout'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
