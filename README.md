# Coaching Center Attendance Management System

A full-stack, multi-tenant attendance management platform for coaching centers. Features student check-in/check-out, biometric device integration, class scheduling, fee tracking, Telegram parent notifications, and a comprehensive admin panel with super admin capabilities.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Login Credentials](#login-credentials)
- [Multi-Tenant Architecture](#multi-tenant-architecture)
- [Admin Panel](#admin-panel)
- [Super Admin Panel](#super-admin-panel)
- [Kiosk App](#kiosk-app)
- [Biometric Integration](#biometric-integration)
- [Telegram Parent Notifications](#telegram-parent-notifications)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Environment Variables](#environment-variables)
- [Docker Deployment](#docker-deployment)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [Testing with cURL](#testing-with-curl)

---

## Features

### Core
- **Multi-Tenant Architecture** — Multiple coaching centers on a single platform, each with isolated data
- **Super Admin Dashboard** — Create and manage companies, view global statistics
- **JWT Authentication** — Secure token-based access with role-based permissions
- **Role-Based Access Control** — Super Admin, Admin, Manager, Staff, Viewer roles with hierarchy enforcement

### Student & Attendance
- **Student Management** — Register, edit, delete students with PIN-based authentication
- **Class-wise Subjects** — Subjects organized by class (9th, 10th, 11th, 12th) with unique codes
- **Multi-Subject Enrollment** — Students can enroll in multiple subjects of their class
- **Fee Tracking** — Track fees paid, due dates, pending amounts, and overdue alerts
- **Attendance Reports** — Real-time tracking with date, class, and subject filters
- **Export Reports** — Export attendance to PDF or Excel (CSV)
- **Auto-Checkout** — Automatic checkout at 11 PM daily

### Teachers & Scheduling
- **Teacher Management** — Manage teachers with subject and class assignments
- **Class Scheduling** — Weekly timetable and one-time session scheduling
- **Teacher-Subject Mapping** — Assign subjects and classes to teachers

### Kiosk
- **Self-Service Kiosk** — Touch-friendly check-in/check-out interface
- **PIN Authentication** — Secure 4-digit PIN entry with numeric keypad
- **Standalone App** — Completely separate from admin panel

### Integrations
- **Biometric Devices** — ZKTeco device support via ADMS protocol (fingerprint, card, face)
- **Telegram Notifications** — Parent notifications via Telegram bot with token-based linking
- **Redis Job Queue** — BullMQ for background job processing

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | NestJS + TypeScript |
| Frontend (Admin) | Next.js 14 + React + TypeScript |
| Frontend (Kiosk) | Next.js 14 + React + TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache/Queue | Redis + BullMQ |
| Styling | Tailwind CSS |
| Authentication | JWT (JSON Web Tokens) |
| Password Hashing | bcrypt (12 rounds) |
| Containerization | Docker + Docker Compose |

---

## System Architecture

```
+------------------+     +------------------+     +------------------+
|   Admin Panel    |     |   Backend API    |     |    Kiosk App     |
|   Port 3005      |---->|   Port 3000      |<----|    Port 3006     |
|   (Next.js)      |     |   (NestJS)       |     |    (Next.js)     |
+------------------+     +--------+---------+     +------------------+
                                  |
                    +-------------+-------------+
                    |             |             |
              +-----v----+ +-----v----+ +------v------+
              | PostgreSQL| |  Redis   | |  Biometric  |
              | Port 8090 | | Port 6379| |  Devices    |
              +-----------+ +----------+ | (ZKTeco)    |
                                         +-------------+
```

---

## Project Structure

```
Cochingcenter/
├── backend/                           # NestJS Backend API (Port 3000)
│   ├── src/
│   │   ├── main.ts                    # Entry point, CORS, body parsers
│   │   ├── app.module.ts              # Root module imports
│   │   ├── common/
│   │   │   └── prisma.service.ts      # Prisma database client
│   │   └── modules/
│   │       ├── auth/                  # JWT authentication & login
│   │       ├── admin/                 # Dashboard stats, branches, audit logs
│   │       ├── students/              # Student CRUD
│   │       ├── parents/               # Parent management & Telegram
│   │       ├── teachers/              # Teacher & schedule management
│   │       ├── attendance/            # Attendance reports & stats
│   │       ├── kiosk/                 # Check-in/check-out API
│   │       ├── biometric/             # Device management & ADMS protocol
│   │       ├── super-admin/           # Multi-tenant company management
│   │       ├── users/                 # User CRUD with role hierarchy
│   │       └── health/               # Health check endpoint
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema (multi-tenant)
│   │   └── seed.ts                    # Database seeding
│   └── .env                           # Environment configuration
│
├── frontend/
│   ├── admin-new/                     # Next.js Admin Panel (Port 3005)
│   │   ├── app/
│   │   │   ├── page.tsx               # Login page
│   │   │   ├── layout.tsx             # Root layout
│   │   │   ├── providers.tsx          # AuthProvider wrapper
│   │   │   ├── contexts/
│   │   │   │   └── AuthContext.tsx     # Auth state & role permissions
│   │   │   ├── dashboard/             # Admin dashboard pages
│   │   │   │   ├── page.tsx           # Main dashboard (students, attendance, teachers, fees)
│   │   │   │   ├── layout.tsx         # Auth-protected layout with sidebar
│   │   │   │   ├── users/page.tsx     # User management
│   │   │   │   └── biometric/page.tsx # Biometric device management
│   │   │   └── super-admin/
│   │   │       └── page.tsx           # Super admin company management
│   │   └── tailwind.config.js
│   │
│   ├── admin/                         # Legacy admin panel (Port 3002)
│   │
│   └── kiosk/                         # Next.js Kiosk App (Port 3006)
│       └── app/
│           └── page.tsx               # Student check-in/check-out
│
├── docker/
│   ├── docker-compose.yml             # Full stack Docker deployment
│   ├── Dockerfile.backend
│   └── Dockerfile.frontend
│
├── start-servers.bat                  # Windows startup script
└── README.md
```

---

## Prerequisites

| Service | Required | Port | Notes |
|---------|----------|------|-------|
| Node.js | v18+ | — | Runtime |
| PostgreSQL | Yes | 8090 | Database |
| Redis | Yes | 6379 | Job queue (BullMQ) |

---

## Quick Start

### Option 1: Windows Batch Script

```bash
D:\Claude\Cochingcenter\start-servers.bat
```

This starts both the backend (port 3000) and frontend (port 3005) automatically.

### Option 2: Manual Start

**Terminal 1 — Backend:**
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npx prisma db seed        # Seed test data
npm run start:dev          # http://localhost:3000
```

**Terminal 2 — Admin Panel:**
```bash
cd frontend/admin-new
npm install
npm run dev                # http://localhost:3005
```

**Terminal 3 — Kiosk (optional):**
```bash
cd frontend/kiosk
npm install
npm run dev                # http://localhost:3006
```

### Option 3: Docker

```bash
cd docker
docker-compose up -d
```

---

## Login Credentials

### Super Admin
| Field | Value |
|-------|-------|
| Company Code | *(leave empty)* |
| Email | superadmin@system.com |
| Password | SuperAdmin@123 |

### Company Admin
| Field | Value |
|-------|-------|
| Company Code | EXCELL |
| Email | admin@example.com |
| Password | Admin@123456 |

### Test Students (Kiosk)
| Student ID | PIN | Name | Class |
|------------|-----|------|-------|
| ST001 | 1234 | John Doe | 10th |
| ST002 | 2345 | Jane Smith | 10th |
| ST003 | 3456 | Bob Wilson | 9th |

---

## Multi-Tenant Architecture

The system supports multiple coaching centers (tenants) on a single deployment. Each tenant has completely isolated data.

### How It Works
1. **Tenant** = A coaching center / company with a unique code (e.g., `EXCELL`)
2. **Super Admin** has `tenantId: null` and can manage all companies
3. **Company Admin/Users** are scoped to their tenant via `tenantId`
4. All data (students, teachers, attendance, etc.) is filtered by `tenantId`

### Login Flow
1. User enters **Company Code** (or leaves empty for Super Admin)
2. Backend resolves tenant by code
3. Validates tenant is active
4. Finds user within the tenant scope
5. Returns JWT with `tenantId`, `companyCode`, `companyName`
6. Frontend routes: Super Admin → `/super-admin`, Company Admin → `/dashboard`

### Role Hierarchy

| Role | Level | Permissions |
|------|-------|-------------|
| super_admin | 100 | Full platform access, company management |
| admin | 80 | Full access within their company |
| manager | 60 | Students, teachers, attendance, accounts |
| staff | 40 | Students (read/create/update), attendance |
| viewer | 20 | Read-only access |

---

## Admin Panel

**URL:** http://localhost:3005/dashboard

### Dashboard
- Summary cards: Currently checked in, total students, today's check-ins
- Student management table with add/edit/delete
- Attendance records with check-in/out times
- Teacher management with subject assignments
- Class schedule calendar view
- Fee collection tracking

### Students Tab
- View all students in a table (ID, Name, Class, Subjects, Fees, Status)
- Add student with class-based subject selection
- Edit student details, subjects, fees
- Reset student PIN
- Automatic fee calculation based on selected subjects
- Fee summary: total fee, paid amount, balance, due date

### Subjects
- Grid display with code, name, class, and monthly fee
- Filter by class (9th, 10th, 11th, 12th)
- Add/edit/delete subjects

### Teachers Tab
- Teacher cards with code, name, phone, classes, subjects
- Add/edit/delete teachers
- Class and subject assignment
- Weekly timetable view (Mon–Sat)
- Schedule management: weekly recurring or one-time sessions

### Attendance Reports
- Date filter with Today/Yesterday quick buttons
- Class and subject filters
- Attendance table: student name, ID, class, check-in, check-out, status
- Export to Excel (CSV) or PDF
- Refresh button for real-time updates

### Users Management (`/dashboard/users`)
- User table: email, name, role, status
- Create/edit/delete users
- Role hierarchy enforcement (can only create lower roles)
- Password reset by admin
- Status badges (active/inactive)

### Biometric Management (`/dashboard/biometric`)
- **Devices tab**: Device cards with status, serial, enrollment count, daily punches
- **Logs tab**: Punch logs with time, device, user, punch type, verify method
- **Enrollments tab**: Enrollment list with push/remove actions
- Add/edit devices with serial, name, model, location, IP
- Device command queue (SET_USER, DELETE_USER)

---

## Super Admin Panel

**URL:** http://localhost:3005/super-admin

### Features
- **Global Statistics**: Total companies, active companies, total students, total users, today's attendance
- **Company Management**: Create, view, activate/deactivate companies
- **Company Creation**: Set company name, code, and initial admin user (name, email, password)
- **Company Details**: Student count, user count, status per company

### Company Creation Flow
1. Enter company name and unique code (min 3 characters)
2. Set initial admin account (full name, email, password)
3. System creates: Tenant → Default Branch → Admin User (in a transaction)

---

## Kiosk App

**URL:** http://localhost:3006

A standalone, touch-friendly interface for student check-in/check-out.

### Flow
1. **Select Mode** — Large CHECK IN or CHECK OUT button
2. **Enter Student ID** — Text input (e.g., ST001)
3. **Enter PIN** — 4-digit numeric keypad (masked display)
4. **Submit** — Process the request
5. **Result** — Green success screen with student name & timestamp, or red error screen

### Features
- No admin navigation — completely isolated
- Large touch-optimized buttons
- Color-coded: green (check-in), orange (check-out)
- Auto-reset after each transaction
- Secured via `x-kiosk-secret` header

---

## Biometric Integration

Supports ZKTeco attendance devices via the **ADMS (Automatic Data Master Server)** protocol.

### Supported Features
- Fingerprint, card, face, and password verification
- Real-time punch processing
- Automatic punch type determination (check-in vs check-out)
- Duplicate punch detection (60-second window)
- Device online status tracking (last sync within 5 minutes)
- Device command queue (push/delete users to device)

### ADMS Endpoints (no `/api` prefix)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/iclock/cdata` | GET | Device handshake |
| `/iclock/cdata` | POST | Receive punch data |
| `/iclock/getrequest` | GET | Send queued commands to device |
| `/iclock/devicecmd` | POST | Command execution response |
| `/iclock/fdata` | POST | Fingerprint template upload |

### Enrollment Process
1. Register device in admin panel (serial number, name, IP)
2. Enroll student/teacher with device user ID and PIN
3. System queues `SET_USER` command to device
4. Device picks up command on next sync
5. Student/teacher can now punch on the device

---

## Telegram Parent Notifications

### Setup
1. Create a Telegram Bot via [@BotFather](https://t.me/BotFather)
2. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in `.env`
3. Generate a link for a parent from the admin panel
4. Parent opens the link and starts the bot
5. System stores the parent's Telegram chat ID

### Features
- Token-based parent linking with 24-hour expiry
- Per-parent notification toggle (enable/disable)
- Message logging with retry tracking (queued → sent → failed)
- Link format: `https://t.me/{botUsername}?start={token}`

---

## API Reference

### Authentication

```http
POST /api/auth/login
```
```json
{
  "company_code": "EXCELL",
  "email": "admin@example.com",
  "password": "Admin@123456"
}
```
**Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGc...",
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "full_name": "System Administrator",
      "role": "admin",
      "is_super_admin": false
    },
    "company": {
      "id": "uuid",
      "code": "EXCELL",
      "name": "Excell Coaching Center"
    }
  }
}
```

```http
GET /api/auth/me
Authorization: Bearer <token>
```

### Students
```http
GET    /api/admin/students              # List students
POST   /api/admin/students              # Create student
GET    /api/admin/students/:id          # Get student
PUT    /api/admin/students/:id          # Update student
DELETE /api/admin/students/:id          # Delete student
POST   /api/admin/students/:id/reset-pin  # Reset PIN
```

### Teachers
```http
GET    /api/admin/teachers              # List teachers
POST   /api/admin/teachers              # Create teacher
GET    /api/admin/teachers/:id          # Get teacher
PUT    /api/admin/teachers/:id          # Update teacher
DELETE /api/admin/teachers/:id          # Delete teacher
```

### Schedules
```http
GET    /api/admin/schedules             # List schedules
POST   /api/admin/schedules             # Create schedule
PUT    /api/admin/schedules/:id         # Update schedule
DELETE /api/admin/schedules/:id         # Delete schedule
```

### Attendance
```http
GET /api/admin/attendance/current       # Currently checked-in students
GET /api/admin/attendance/report?date=YYYY-MM-DD  # Attendance report
GET /api/admin/attendance/daily-stats   # Daily statistics
```

### Parents
```http
GET  /api/admin/parents                           # List parents
GET  /api/admin/parents/:id                       # Get parent details
POST /api/admin/parents/:id/telegram/generate-link  # Generate Telegram link
POST /api/admin/parents/:id/telegram/disconnect     # Disconnect Telegram
POST /api/admin/parents/:id/notifications           # Toggle notifications
```

### Users
```http
GET    /api/admin/users                 # List users
GET    /api/admin/users/roles           # Get available roles
GET    /api/admin/users/:id             # Get user
POST   /api/admin/users                 # Create user
PUT    /api/admin/users/:id             # Update user
PATCH  /api/admin/users/:id/reset-password  # Reset password
DELETE /api/admin/users/:id             # Delete user (soft)
```

### Admin Dashboard
```http
GET /api/admin/dashboard               # Dashboard stats
GET /api/admin/branches                # List branches
GET /api/admin/audit-logs              # Audit log entries
GET /api/admin/telegram-stats          # Telegram notification stats
```

### Super Admin
```http
POST  /api/super-admin/companies               # Create company
GET   /api/super-admin/companies               # List companies
GET   /api/super-admin/companies/:id           # Company details
PUT   /api/super-admin/companies/:id           # Update company
PATCH /api/super-admin/companies/:id/status    # Toggle status
GET   /api/super-admin/stats                   # Global stats
POST  /api/super-admin/companies/:id/users     # Create company user
```

### Biometric
```http
GET    /api/admin/biometric/devices              # List devices
GET    /api/admin/biometric/devices/:id          # Device details
POST   /api/admin/biometric/devices              # Register device
PUT    /api/admin/biometric/devices/:id          # Update device
DELETE /api/admin/biometric/devices/:id          # Delete device
GET    /api/admin/biometric/enrollments          # List enrollments
POST   /api/admin/biometric/enroll               # Enroll user
DELETE /api/admin/biometric/enroll/:id           # Remove enrollment
GET    /api/admin/biometric/logs                 # Punch logs
GET    /api/admin/biometric/sync-status          # Device sync status
GET    /api/admin/biometric/attendance/report    # Biometric attendance report
POST   /api/admin/biometric/devices/:id/push-user    # Push user to device
POST   /api/admin/biometric/devices/:id/delete-user  # Delete user from device
GET    /api/admin/biometric/devices/:id/commands     # Command history
```

### Kiosk
```http
POST /api/kiosk/checkin     # Check in student
POST /api/kiosk/checkout    # Check out student
POST /api/kiosk/verify      # Verify student credentials
```
**Headers:** `x-kiosk-secret: <secret-key>`

### Health
```http
GET /api/health             # {"status":"ok","timestamp":"...","database":"connected"}
```

---

## Database Schema

### Tenant & Organization

**Tenant**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| name | String | Company name |
| code | String | Unique company code (e.g., EXCELL) |
| subdomain | String? | Optional subdomain |
| status | String | active / inactive |
| settings | JSON | Custom tenant settings |

**Branch**
| Column | Type | Description |
|--------|------|-------------|
| branch_id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| name | String | Branch name |
| address | String? | Branch address |
| phone | String? | Branch phone |
| timezone | String | Timezone (default: Asia/Kolkata) |
| status | String | active / inactive |

### Users & Authentication

**User**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID? | Null for super admin |
| email | String | Login email |
| password_hash | String | bcrypt hash |
| full_name | String | Display name |
| role | String | admin / manager / staff / viewer / super_admin |
| status | String | active / inactive / deleted |

**Parent**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| full_name | String | Parent name |
| phone | String? | Phone number |
| email | String? | Email address |
| telegram_chat_id | String? | Telegram chat ID |
| telegram_username | String? | Telegram username |
| notification_enabled | Boolean | Toggle notifications |

### Students & Academics

**Student**
| Column | Type | Description |
|--------|------|-------------|
| student_id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| student_code | String | Unique student ID (ST001) |
| attendance_id | String? | Biometric attendance ID |
| full_name | String | Student name |
| grade | String | Class (9th, 10th, 11th, 12th) |
| pin_hash | String | bcrypt PIN hash |
| status | String | active / inactive |
| metadata | JSON? | Extra data |

**Teacher**
| Column | Type | Description |
|--------|------|-------------|
| teacher_id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| teacher_code | String | Unique code (TCH001) |
| full_name | String | Teacher name |
| phone | String? | Phone number |
| subjects | String[] | Subject codes array |
| classes | String[] | Class grades array |
| status | String | active / inactive |

**ClassSchedule**
| Column | Type | Description |
|--------|------|-------------|
| schedule_id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| teacher_id | UUID | Teacher reference |
| subject_code | String | Subject code |
| class_grade | String | Class grade |
| day_of_week | String? | Monday–Saturday (recurring) |
| schedule_date | DateTime? | Specific date (one-time) |
| start_time | String | Start time (HH:mm) |
| end_time | String | End time (HH:mm) |
| is_recurring | Boolean | Weekly or one-time |
| status | String | active / inactive |

### Attendance

**AttendanceSession**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| student_id | UUID | Student reference |
| branch_id | UUID | Branch reference |
| checkin_time | DateTime | Check-in timestamp |
| checkout_time | DateTime? | Check-out timestamp |
| checkout_method | String | manual / biometric / auto_close |
| duration_minutes | Int? | Session duration |
| status | String | checked_in / checked_out |

### Biometric

**BiometricDevice**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID | Tenant reference |
| serial_number | String | Unique device serial |
| name | String | Device display name |
| model | String? | Device model |
| location | String? | Physical location |
| ip_address | String? | Device IP |
| status | String | active / inactive |
| last_sync_at | DateTime? | Last device sync |

**BiometricEnrollment**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| device_id | UUID | Device reference |
| device_user_id | String | User ID on device |
| student_id | UUID? | Student reference |
| teacher_id | UUID? | Teacher reference |
| status | String | active / inactive |

**BiometricPunchLog**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| device_id | UUID | Device reference |
| device_user_id | String | User ID on device |
| punch_time | DateTime | Punch timestamp |
| punch_type | String | in / out |
| verify_method | String | fingerprint / card / face / password |
| processed | Boolean | Attendance created? |
| raw_data | String? | Raw device data |

### Auditing

**AuditLog**
| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| tenant_id | UUID? | Tenant reference |
| actor_user_id | UUID | User who performed action |
| action | String | Action type |
| entity_type | String | Affected entity type |
| entity_id | String | Affected entity ID |
| before_data | JSON? | State before change |
| after_data | JSON? | State after change |
| ip_address | String? | Request IP |
| user_agent | String? | Request user agent |

---

## Environment Variables

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL="postgresql://attendance:attendance_dev@localhost:8090/attendance_db"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-jwt-secret-key-min-32-characters-long-change-in-production
JWT_EXPIRES_IN=1h

# Server
PORT=3000
NODE_ENV=development

# CORS
CORS_ORIGINS=http://localhost:3001,http://localhost:3002,http://localhost:3005

# Kiosk
KIOSK_SECRET_KEY=kiosk-secret-key-change-in-production

# Telegram (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_WEBHOOK_SECRET=

# Default Tenant
DEFAULT_TENANT_ID=550e8400-e29b-41d4-a716-446655440001
```

### Frontend (`frontend/admin-new/next.config.js`)
```env
API_URL=http://localhost:3000/api    # Set via next.config.js env block
```

---

## Docker Deployment

### Services

| Service | Container | Port | Image |
|---------|-----------|------|-------|
| PostgreSQL | attendance_db | 5432 | postgres:15-alpine |
| Redis | attendance_redis | 6379 | redis:7-alpine |
| Backend API | attendance_backend | 3000 | Custom (NestJS) |
| Admin Frontend | attendance_admin | 3002 | Custom (Next.js) |
| Kiosk Frontend | attendance_kiosk | 3001 | Custom (Next.js) |

### Commands
```bash
cd docker

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f backend

# Stop all
docker-compose down

# Reset database
docker-compose down -v
docker-compose up -d
```

### Health Checks
- PostgreSQL: `pg_isready`
- Redis: `redis-cli ping`
- Backend: `wget http://localhost:3000/api/health`

---

## Security

1. **JWT Authentication** — Token-based access with configurable expiration
2. **Role Hierarchy** — Users can only create roles lower than their own
3. **Multi-Tenant Isolation** — All queries scoped by `tenantId`
4. **Password Hashing** — bcrypt with 12 salt rounds for admin passwords
5. **PIN Hashing** — bcrypt for student PINs
6. **Kiosk Secret Key** — Separate API key for kiosk endpoints
7. **CORS** — Configured allowed origins
8. **Input Validation** — NestJS ValidationPipe with whitelist and transform
9. **Audit Logging** — All changes tracked with before/after data
10. **Soft Delete** — Users are soft-deleted (status = 'deleted'), not removed

---

## Troubleshooting

### Backend

| Problem | Solution |
|---------|----------|
| Cannot connect to database | Ensure PostgreSQL is running on port 8090 |
| Cannot connect to Redis | Ensure Redis is running on port 6379 |
| Port 3000 in use | `netstat -ano \| findstr :3000` then `taskkill /PID <pid> /F` |
| Module not found | Run `npm install` in backend folder |
| Prisma errors | Run `npx prisma generate` then `npx prisma db push` |
| Login returns 500 | Check DATABASE_URL and ensure database is seeded |
| CORS errors | Add frontend URL to `CORS_ORIGINS` in `.env` |

### Frontend

| Problem | Solution |
|---------|----------|
| Login page not opening | Ensure `npm run dev` is running, check port 3005 |
| "Failed to fetch" on login | Backend not running — start it on port 3000 |
| Slow first load | Normal for Next.js dev mode — subsequent loads are fast |
| Port conflict | Frontend defaults to port 3005 (set in package.json) |
| Subjects not showing | Clear localStorage and refresh |
| Export not working | Ensure attendance data is loaded first |

### Kiosk

| Problem | Solution |
|---------|----------|
| Check-in fails | Verify student ID and PIN are correct |
| Already checked in | Student must check out first |
| Connection error | Ensure backend is running on port 3000 |

### Biometric

| Problem | Solution |
|---------|----------|
| Device not connecting | Verify ADMS server URL in device settings: `http://<server-ip>:3000/iclock` |
| Device shows offline | Check device network, last sync is >5 minutes old |
| Punches not processing | Check enrollment exists for the device user ID |
| Duplicate punches | 60-second duplicate window is enforced automatically |

---

## Testing with cURL

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Login (Super Admin)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"superadmin@system.com","password":"SuperAdmin@123"}'
```

### Login (Company Admin)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"company_code":"EXCELL","email":"admin@example.com","password":"Admin@123456"}'
```

### Get Students
```bash
curl http://localhost:3000/api/admin/students \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Check In Student (Kiosk)
```bash
curl -X POST http://localhost:3000/api/kiosk/checkin \
  -H "Content-Type: application/json" \
  -H "x-kiosk-secret: kiosk-secret-key-change-in-production" \
  -d '{"student_code":"ST001","pin":"1234","branch_id":"660e8400-e29b-41d4-a716-446655440002"}'
```

### Check Out Student (Kiosk)
```bash
curl -X POST http://localhost:3000/api/kiosk/checkout \
  -H "Content-Type: application/json" \
  -H "x-kiosk-secret: kiosk-secret-key-change-in-production" \
  -d '{"student_code":"ST001","pin":"1234","branch_id":"660e8400-e29b-41d4-a716-446655440002"}'
```

### Get Attendance Report
```bash
curl "http://localhost:3000/api/admin/attendance/report?date=2026-01-26" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Get Global Stats (Super Admin)
```bash
curl http://localhost:3000/api/super-admin/stats \
  -H "Authorization: Bearer YOUR_SUPER_ADMIN_TOKEN"
```

---

## Data Storage

### Backend (PostgreSQL)
All persistent data: tenants, users, students, parents, teachers, schedules, attendance, biometric devices, enrollments, punch logs, audit logs.

### Frontend (localStorage)
| Key | Description |
|-----|-------------|
| `token` | JWT authentication token |
| `user` | Logged-in user info (JSON) |
| `company` | Current company info (JSON) |
| `subjects` | Cached subject list |
| `studentFeeData` | Cached student fee data |

---

## Default Subjects

### 9th Class
| Code | Subject | Monthly Fee |
|------|---------|-------------|
| MTH-9 | Mathematics | Rs. 500 |
| SCI-9 | Science | Rs. 500 |
| ENG-9 | English | Rs. 400 |
| SST-9 | Social Studies | Rs. 400 |

### 10th Class
| Code | Subject | Monthly Fee |
|------|---------|-------------|
| MTH-10 | Mathematics | Rs. 550 |
| SCI-10 | Science | Rs. 550 |
| ENG-10 | English | Rs. 450 |
| SST-10 | Social Studies | Rs. 450 |

### 11th Class
| Code | Subject | Monthly Fee |
|------|---------|-------------|
| PHY-11 | Physics | Rs. 600 |
| CHM-11 | Chemistry | Rs. 600 |
| MTH-11 | Mathematics | Rs. 600 |
| BIO-11 | Biology | Rs. 550 |
| CS-11 | Computer Science | Rs. 650 |

### 12th Class
| Code | Subject | Monthly Fee |
|------|---------|-------------|
| PHY-12 | Physics | Rs. 650 |
| CHM-12 | Chemistry | Rs. 650 |
| MTH-12 | Mathematics | Rs. 650 |
| BIO-12 | Biology | Rs. 600 |
| CS-12 | Computer Science | Rs. 700 |

---

## Discount Structure

| Payment Period | Discount | Example (Rs. 2000 base) |
|----------------|----------|------------------------|
| Monthly | 0% | Rs. 2,000 |
| Quarterly (3 months) | 5% | Rs. 5,700 |
| Half-Yearly (6 months) | 10% | Rs. 10,800 |
| Yearly (12 months) | 15% | Rs. 20,400 |
| Sibling (2nd child) | 10% | Additional discount |

---

## Auto Check-out

A scheduled job runs daily at **11:00 PM** to automatically check out students who forgot to check out:
- Sets `checkout_method` to `auto_close`
- Calculates `duration_minutes` from check-in time
- Logs the auto-checkout in the system

---

## License

This project is for educational purposes.
