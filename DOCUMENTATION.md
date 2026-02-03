# Coaching Center Attendance Management System
## Complete Technical Documentation

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [System Architecture](#3-system-architecture)
4. [Database Models](#4-database-models)
5. [API Endpoints](#5-api-endpoints)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Biometric Device Integration](#7-biometric-device-integration)
8. [Telegram Bot Integration](#8-telegram-bot-integration)
9. [Kiosk Application](#9-kiosk-application)
10. [Frontend Structure](#10-frontend-structure)
11. [Configuration](#11-configuration)
12. [Running the Application](#12-running-the-application)
13. [File Structure](#13-file-structure)
14. [Recent Changes (Feb 1, 2026)](#14-recent-changes-feb-1-2026)

---

## 1. Project Overview

A full-stack, multi-tenant SaaS platform for managing attendance at coaching centers.

### Key Features
- Multi-tenant architecture with isolated data per coaching center
- Biometric device integration (ZKTeco devices via ADMS protocol)
- Telegram parent notifications for real-time attendance alerts
- JWT-based authentication with role-based access control
- Admin dashboards for reporting and management
- Self-service kiosk for student check-in/out
- Teacher and schedule management
- Comprehensive audit logging

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS + TypeScript |
| **Frontend (Admin)** | Next.js 14 + React + TypeScript |
| **Frontend (Kiosk)** | Next.js 14 + React + TypeScript |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **Message Queue** | BullMQ + Redis |
| **Authentication** | JWT (JSON Web Tokens) |
| **Password Hashing** | bcrypt (12 rounds) |
| **UI Framework** | Tailwind CSS |

---

## 3. System Architecture

```
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│   Admin Panel    │      │   Backend API    │      │   Kiosk App      │
│   Port 3005      │─────▶│   Port 3000      │◀─────│   Port 3006      │
│   (Next.js)      │      │   (NestJS)       │      │   (Next.js)      │
└──────────────────┘      └────────┬─────────┘      └──────────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
              ┌─────▼──────┐ ┌─────▼────┐ ┌───────▼───────┐
              │ PostgreSQL │ │  Redis   │ │   Biometric   │
              │ Port 8090  │ │ (Upstash)│ │   Devices     │
              └────────────┘ └──────────┘ │   (ZKTeco)    │
                                          └───────────────┘
```

---

## 4. Database Models

### Core Entities

#### Tenant (Company)
```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  code      String   @unique  // Company code for login
  subdomain String?
  status    String   @default("active")
  settings  Json?
}
```

#### Student
```prisma
model Student {
  id           String   @id @default(uuid())
  tenantId     String
  branchId     String
  studentCode  String   // Unique per tenant
  attendanceId String?  // Biometric device ID
  fullName     String
  phone        String?
  email        String?
  grade        String?
  pinHash      String   // Hashed 4-6 digit PIN
  status       String   @default("active")
}
```

#### Teacher
```prisma
model Teacher {
  id           String   @id @default(uuid())
  tenantId     String
  teacherCode  String   // Unique per tenant
  attendanceId String?  // Biometric device ID
  fullName     String
  phone        String?
  salary       Decimal?
  subjects     String[] // Array of subject codes
  classes      String[] // Array of class grades
  status       String   @default("active")
}
```

#### User (System Users)
```prisma
model User {
  id           String   @id @default(uuid())
  tenantId     String?  // NULL for super admin
  email        String
  passwordHash String
  fullName     String
  role         String   // super_admin, admin, manager, staff, viewer
  permissions  Json?    // Custom module permissions
  status       String   @default("active")
}
```

#### AttendanceSession
```prisma
model AttendanceSession {
  id             String    @id @default(uuid())
  tenantId       String
  branchId       String
  studentId      String
  checkinTime    DateTime
  checkoutTime   DateTime?
  checkoutMethod String?   // manual, auto, biometric
  status         String    // checked_in, checked_out
}
```

#### BiometricDevice
```prisma
model BiometricDevice {
  id             String    @id @default(uuid())
  tenantId       String
  serialNumber   String    @unique
  name           String
  model          String?
  location       String?
  ipAddress      String?
  status         String    @default("active")
  timezoneOffset Int       @default(0)
  lastSyncAt     DateTime?
}
```

#### Parent
```prisma
model Parent {
  id                  String    @id @default(uuid())
  tenantId            String
  fullName            String
  phone               String
  telegramChatId      String?   // Linked Telegram chat
  telegramConnectedAt DateTime?
  notificationEnabled Boolean   @default(true)
}
```

---

## 5. API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login with email/password |
| GET | `/api/auth/me` | Get current user info |

### Students
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/students` | List students |
| GET | `/api/admin/students/:id` | Get student details |
| POST | `/api/admin/students` | Create student |
| PUT | `/api/admin/students/:id` | Update student |
| DELETE | `/api/admin/students/:id` | Delete student |
| POST | `/api/admin/students/:id/reset-pin` | Reset student PIN |

### Teachers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/teachers` | List teachers |
| GET | `/api/admin/teachers/:id` | Get teacher details |
| POST | `/api/admin/teachers` | Create teacher |
| PUT | `/api/admin/teachers/:id` | Update teacher |
| DELETE | `/api/admin/teachers/:id` | Delete teacher |

### Schedules
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/schedules` | List schedules |
| POST | `/api/admin/schedules` | Create schedule |
| PUT | `/api/admin/schedules/:id` | Update schedule |
| DELETE | `/api/admin/schedules/:id` | Delete schedule |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List users |
| GET | `/api/admin/users/:id` | Get user details |
| POST | `/api/admin/users` | Create user |
| PUT | `/api/admin/users/:id` | Update user |
| DELETE | `/api/admin/users/:id` | Delete user |
| PATCH | `/api/admin/users/:id/reset-password` | Reset password |
| GET | `/api/admin/users/roles` | Get available roles |

### Parents
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/parents` | List parents |
| GET | `/api/admin/parents/:id` | Get parent details |
| POST | `/api/admin/parents/:id/telegram/generate-link` | Generate Telegram link |
| POST | `/api/admin/parents/:id/telegram/disconnect` | Disconnect Telegram |

### Attendance
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/attendance/report` | Get attendance records |
| GET | `/api/admin/attendance/punch-report` | Punch-based report |
| GET | `/api/admin/attendance/current` | Currently checked-in |
| GET | `/api/admin/attendance/daily-stats` | Daily statistics |

### Biometric Devices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/biometric/devices` | List devices |
| POST | `/api/admin/biometric/devices` | Register device |
| PUT | `/api/admin/biometric/devices/:id` | Update device |
| DELETE | `/api/admin/biometric/devices/:id` | Delete device |
| POST | `/api/admin/biometric/enroll` | Enroll student |
| GET | `/api/admin/biometric/enrollments` | List enrollments |
| DELETE | `/api/admin/biometric/enroll/:id` | Remove enrollment |
| GET | `/api/admin/biometric/logs` | Get punch logs |
| POST | `/api/admin/biometric/devices/:id/push-user` | Push user to device |
| POST | `/api/admin/biometric/devices/:id/delete-user` | Delete from device |
| POST | `/api/admin/biometric/sync-time-all` | Sync all devices |

### Kiosk (Secret Key Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/kiosk/checkin` | Student check-in |
| POST | `/api/kiosk/checkout` | Student check-out |
| POST | `/api/kiosk/verify` | Verify student |

### ADMS Protocol (Biometric Devices)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/iclock/cdata` | Device handshake |
| POST | `/iclock/cdata` | Punch data upload |
| GET | `/iclock/getrequest` | Fetch commands |
| POST | `/iclock/devicecmd` | Command result |

---

## 6. Authentication & Authorization

### Role Hierarchy
| Role | Level | Description |
|------|-------|-------------|
| super_admin | 100 | System-wide admin, manage all companies |
| admin | 80 | Company admin, full company access |
| manager | 60 | Operational management |
| staff | 40 | Basic operations |
| viewer | 20 | Read-only access |

### Role Permissions
```typescript
const ROLE_PERMISSIONS = {
  super_admin: ['*'], // All permissions
  admin: [
    'students:read', 'students:create', 'students:update', 'students:delete',
    'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete',
    'attendance:read', 'attendance:create',
    'accounts:read', 'accounts:manage',
    'users:read', 'users:manage',
  ],
  manager: [
    'students:read', 'students:create', 'students:update', 'students:delete',
    'teachers:read', 'teachers:create', 'teachers:update', 'teachers:delete',
    'attendance:read', 'attendance:create',
    'accounts:read', 'accounts:manage',
  ],
  staff: [
    'students:read', 'students:create', 'students:update',
    'teachers:read',
    'attendance:read', 'attendance:create',
  ],
  viewer: [
    'students:read',
    'teachers:read',
    'attendance:read',
    'accounts:read',
  ],
};
```

### JWT Token Payload
```typescript
{
  sub: userId,
  email: email,
  role: 'admin' | 'staff' | 'viewer' | 'super_admin',
  tenantId: tenantId | null,
  companyCode: code,
  companyName: name
}
```

---

## 7. Biometric Device Integration

### ZKTeco ADMS Protocol

**Device Communication Flow:**
1. Device initiates handshake at `/iclock/cdata` (GET)
2. Backend responds with server time, timezone, settings
3. Device sends punch data via POST `/iclock/cdata`
4. Device polls for commands via GET `/iclock/getrequest`
5. Device reports command execution via POST `/iclock/devicecmd`

### Punch Data Format
```
PIN\tTime\tStatus\tVerifyMethod
```
- **PIN**: Device user ID (attendance_id)
- **Time**: 2026-02-01 09:00:00
- **Status**: 0 (check-in), 1 (check-out)
- **VerifyMethod**: 1 (Fingerprint), 2 (Card), 11 (Face)

### Device Commands
- **set_user**: Add user to device
- **delete_user**: Remove user from device
- **sync_time**: Synchronize device time

---

## 8. Telegram Bot Integration

### Parent Notification Flow
1. Admin generates one-time Telegram link for parent
2. Parent clicks link and sends `/start TOKEN` to bot
3. Bot validates token and links parent's ChatID
4. On student check-in/out, notification is queued
5. BullMQ worker sends message via Telegram API

### Message Types
- **Check-in Alert**: Student arrived notification
- **Check-out Alert**: Student left notification with duration
- **Auto Check-out**: System auto-closed session at 11 PM

### Bot Commands
- `/start TOKEN` - Link parent account
- `/status` - Show connection status
- `/help` - Show help message

---

## 9. Kiosk Application

### Features
- Touch-friendly interface with large buttons
- PIN authentication (4-6 digit)
- Self-service check-in/check-out
- Session duration display
- Clear error feedback

### Security
- Secret key validation via `x-kiosk-secret` header
- PIN hashing with bcrypt
- IP tracking for audit

---

## 10. Frontend Structure

### Admin Panel (Port 3005)
```
frontend/admin-new/app/
├── page.tsx              # Login page
├── layout.tsx            # Root layout
├── contexts/
│   └── AuthContext.tsx   # JWT token management
├── dashboard/
│   ├── page.tsx          # Main dashboard
│   ├── layout.tsx        # Dashboard layout
│   ├── biometric/
│   │   └── page.tsx      # Biometric devices
│   └── users/
│       └── page.tsx      # User management
└── super-admin/
    └── page.tsx          # Super admin panel
```

### Key Components
- **AuthContext**: JWT token storage and role checking
- **hasRole()**: Check minimum role level
- **hasPermission()**: Check specific permission
- **hasModuleAccess()**: Check module access

---

## 11. Configuration

### Backend Environment Variables (.env)
```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:8090/attendance_db"

# Redis (Upstash)
REDIS_HOST=learning-stork-58444.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-characters
JWT_EXPIRES_IN=1h

# Kiosk
KIOSK_SECRET_KEY=kiosk-secret-key

# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_BOT_USERNAME=YourBotUsername
TELEGRAM_WEBHOOK_SECRET=your-webhook-secret

# Server
PORT=3000
NODE_ENV=development
CORS_ORIGINS=http://localhost:3005,http://localhost:3006
```

---

## 12. Running the Application

### Prerequisites
- Node.js 18+
- PostgreSQL (running on port 8090)
- Redis (or Upstash)

### Start Backend
```bash
cd backend
npm install
npm run start:dev
```
Backend runs on: http://localhost:3000

### Start Frontend (Admin)
```bash
cd frontend/admin-new
npm install
npm run dev
```
Frontend runs on: http://localhost:3005

### Default Credentials
| Type | Company Code | Email | Password |
|------|--------------|-------|----------|
| Super Admin | (empty) | superadmin@system.com | SuperAdmin@123 |
| Company Admin | EXCELL | admin@example.com | Admin@123456 |

---

## 13. File Structure

```
Cochingcenter/
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── common/
│   │   │   ├── decorators/
│   │   │   │   ├── roles.decorator.ts
│   │   │   │   └── permissions.decorator.ts
│   │   │   ├── guards/
│   │   │   │   ├── roles.guard.ts
│   │   │   │   └── tenant.guard.ts
│   │   │   └── prisma.service.ts
│   │   └── modules/
│   │       ├── auth/
│   │       ├── students/
│   │       ├── teachers/
│   │       ├── parents/
│   │       ├── attendance/
│   │       ├── biometric/
│   │       ├── telegram/
│   │       ├── users/
│   │       ├── kiosk/
│   │       ├── admin/
│   │       └── super-admin/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── admin-new/          # Active admin panel
│   │   ├── app/
│   │   │   ├── page.tsx
│   │   │   ├── dashboard/
│   │   │   ├── contexts/
│   │   │   └── super-admin/
│   │   └── package.json
│   │
│   ├── admin/              # Legacy admin panel
│   └── kiosk/              # Kiosk application
│
├── DOCUMENTATION.md        # This file
└── CHANGELOG_2026-02-01.md # Recent changes
```

---

## 14. Recent Changes (Feb 1, 2026)

### Bug Fixes

#### 1. Staff Biometric Access - FIXED
- **Issue**: Staff couldn't access biometric page
- **Cause**: Page checked `hasRole('admin')` instead of `hasRole('staff')`
- **Fix**: Changed role check in `biometric/page.tsx:442`

#### 2. Teacher Creation Fetch Error - FIXED
- **Issue**: Adding teacher caused fetch error
- **Cause**: `CreateTeacherDto` missing `salary` field
- **Fix**: Added `salary?: number` to DTO and service call

#### 3. Teacher Update Salary Error - FIXED
- **Issue**: Updating teacher salary failed
- **Cause**: `UpdateTeacherDto` missing `salary` field
- **Fix**: Added `salary?: number` to DTO and service call

### New Features

#### Reset Password for Staff Users
- Added "Change Password" button in user edit modal
- Password input with 8-character minimum
- Calls `/api/admin/users/:id/reset-password` endpoint
- Success/error feedback

---

## Support

For issues or questions, check:
- Backend logs: Terminal running `npm run start:dev`
- Frontend console: Browser developer tools
- Database: PostgreSQL logs

---

*Documentation generated: February 1, 2026*
