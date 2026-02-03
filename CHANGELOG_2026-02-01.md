# Changelog - February 1, 2026

## Bug Fixes & Enhancements

### 1. Staff Biometric Access Issue - FIXED
**Problem:** Staff users could not access the biometric page.

**Root Cause:** The biometric page (`frontend/admin-new/app/dashboard/biometric/page.tsx`) was checking for `hasRole('admin')` which requires role level 80. Staff role has level 40, so they were blocked.

**Solution:** Changed the role check from `hasRole('admin')` to `hasRole('staff')` at line 442.

**File Changed:**
- `frontend/admin-new/app/dashboard/biometric/page.tsx`

---

### 2. Teacher Creation Fetch Error - FIXED
**Problem:** When adding a new teacher, users got a "fetch error".

**Root Cause:** The `CreateTeacherDto` in the backend was missing the `salary` field. The frontend was sending salary data, but with `forbidNonWhitelisted: true` in the ValidationPipe, NestJS rejected the request with a 400 Bad Request error.

**Solution:** Added `salary?: number` field to the `CreateTeacherDto` and passed it to the service.

**Files Changed:**
- `backend/src/modules/teachers/teachers.controller.ts`
  - Added `@IsOptional() salary?: number` to `CreateTeacherDto`
  - Added `salary: dto.salary` to the `createTeacher` service call

---

### 3. Teacher Update Salary Error - FIXED
**Problem:** When editing a teacher profile to update salary, users got "property salary not exist" error.

**Root Cause:** The `UpdateTeacherDto` was also missing the `salary` field.

**Solution:** Added `salary?: number` field to the `UpdateTeacherDto` and passed it to the service.

**Files Changed:**
- `backend/src/modules/teachers/teachers.controller.ts`
  - Added `@IsOptional() salary?: number` to `UpdateTeacherDto`
  - Added `salary: dto.salary` to the `updateTeacher` service call

---

### 4. Staff Password Reset Feature - NEW
**Problem:** Admins could not reset passwords for staff users when editing their profiles.

**Solution:** Added a "Reset Password" feature to the User Management edit modal.

**Features:**
- "Change Password" button appears in the edit user modal
- Clicking it reveals a password input field
- Password must be at least 8 characters
- Calls the existing `/api/admin/users/:id/reset-password` endpoint

**Files Changed:**
- `frontend/admin-new/app/dashboard/users/page.tsx`
  - Added `showResetPassword` and `newPassword` state variables
  - Added `handleResetPassword` function
  - Added Reset Password UI section in the edit modal

---

## Role Hierarchy Reference

| Role | Level | Permissions |
|------|-------|-------------|
| super_admin | 100 | All permissions |
| admin | 80 | Full organization management |
| manager | 60 | Student/Teacher/Attendance management |
| staff | 40 | Read students, create/update students, read teachers, create attendance |
| viewer | 20 | Read-only access |

---

## API Endpoints Reference

### Teachers
- `POST /api/admin/teachers` - Create teacher (now accepts `salary`)
- `GET /api/admin/teachers` - List teachers
- `GET /api/admin/teachers/:id` - Get teacher by ID
- `PUT /api/admin/teachers/:id` - Update teacher (now accepts `salary`)
- `DELETE /api/admin/teachers/:id` - Delete teacher

### Users
- `GET /api/admin/users` - List users
- `POST /api/admin/users` - Create user
- `PUT /api/admin/users/:id` - Update user
- `PATCH /api/admin/users/:id/reset-password` - Reset user password
- `DELETE /api/admin/users/:id` - Delete user

### Biometric
- `GET /api/admin/biometric/devices` - List devices
- `POST /api/admin/biometric/devices` - Register device
- `GET /api/admin/biometric/logs` - Get punch logs
- `GET /api/admin/biometric/enrollments` - Get enrollments

---

## Running the Application

### Backend (Port 3000)
```bash
cd backend
npm run start:dev
```

### Frontend (Port 3005)
```bash
cd frontend/admin-new
npm run dev
```

### Access URLs
- Frontend: http://localhost:3005
- Backend API: http://localhost:3000/api

### Default Credentials
- **Company Admin:** EXCELL / admin@example.com / Admin@123456
- **Super Admin:** (empty) / superadmin@system.com / SuperAdmin@123

---

## Database
- PostgreSQL running on port 8090
- Connection string in `.env`: `DATABASE_URL="postgresql://attendance:attendance_dev@localhost:8090/attendance_db"`
