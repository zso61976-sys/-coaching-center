# Multi-Tenant SaaS Implementation Documentation

## Overview

This document describes the multi-tenant (multi-company) architecture implemented for the Coaching Center Attendance System. The system allows a Super Admin to create and manage multiple coaching centers, each with their own isolated data, users, and settings.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [User Roles & Permissions](#user-roles--permissions)
3. [Authentication Flow](#authentication-flow)
4. [API Endpoints](#api-endpoints)
5. [Database Schema](#database-schema)
6. [Frontend Structure](#frontend-structure)
7. [Setup & Deployment](#setup--deployment)
8. [Default Credentials](#default-credentials)

---

## Architecture Overview

### Multi-Tenancy Model

The system uses a **shared database with tenant isolation** approach:
- All tenants share the same database
- Each record is associated with a `tenantId`
- Data isolation is enforced at the application level
- Super Admin has access to all tenants

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Tenant** | A coaching center/company with isolated data |
| **Company Code** | Unique identifier for login (e.g., "EXCELL") |
| **Super Admin** | System-wide administrator (no tenant) |
| **Company Admin** | Administrator within a specific tenant |

---

## User Roles & Permissions

### Role Hierarchy

```
super_admin (100) → Full system access
    ↓
admin (80) → Full company access
    ↓
manager (60) → Operational access
    ↓
staff (40) → Limited access
    ↓
viewer (20) → Read-only access
```

### Permission Matrix

| Permission | Super Admin | Admin | Manager | Staff | Viewer |
|------------|:-----------:|:-----:|:-------:|:-----:|:------:|
| Manage Companies | ✓ | - | - | - | - |
| Manage Users | ✓ | ✓ | - | - | - |
| Students CRUD | ✓ | ✓ | ✓ | ✓ | Read |
| Teachers CRUD | ✓ | ✓ | ✓ | ✓ | Read |
| Attendance | ✓ | ✓ | ✓ | ✓ | Read |
| Accounts/Finance | ✓ | ✓ | ✓ | - | Read |
| Reports | ✓ | ✓ | ✓ | Read | Read |

### Permission Definitions

```typescript
// backend/src/common/decorators/permissions.decorator.ts

enum Permission {
  // Student permissions
  STUDENTS_READ = 'students:read',
  STUDENTS_CREATE = 'students:create',
  STUDENTS_UPDATE = 'students:update',
  STUDENTS_DELETE = 'students:delete',

  // Teacher permissions
  TEACHERS_READ = 'teachers:read',
  TEACHERS_CREATE = 'teachers:create',
  TEACHERS_UPDATE = 'teachers:update',
  TEACHERS_DELETE = 'teachers:delete',

  // Attendance permissions
  ATTENDANCE_READ = 'attendance:read',
  ATTENDANCE_CREATE = 'attendance:create',

  // Finance permissions
  ACCOUNTS_READ = 'accounts:read',
  ACCOUNTS_MANAGE = 'accounts:manage',

  // User management
  USERS_READ = 'users:read',
  USERS_MANAGE = 'users:manage',

  // Tenant management (super admin only)
  TENANTS_READ = 'tenants:read',
  TENANTS_MANAGE = 'tenants:manage',
}
```

---

## Authentication Flow

### Login Process

```
┌─────────────────────────────────────────────────────────────┐
│                      LOGIN FORM                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Company Code: [EXCELL________] (optional)           │    │
│  │ Email:        [admin@example.com___]                │    │
│  │ Password:     [••••••••••••••]                      │    │
│  │                                                     │    │
│  │              [      LOGIN      ]                    │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Company Code Empty?    │
              └─────────────────────────┘
                    │           │
                   Yes          No
                    │           │
                    ▼           ▼
         ┌──────────────┐  ┌──────────────────┐
         │ Find Super   │  │ Find Tenant by   │
         │ Admin User   │  │ Company Code     │
         └──────────────┘  └──────────────────┘
                    │           │
                    ▼           ▼
              ┌─────────────────────────┐
              │   Validate Password     │
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Generate JWT Token    │
              │   (includes tenantId)   │
              └─────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │   Redirect to Dashboard │
              │   - Super Admin → /super-admin
              │   - Others → /dashboard │
              └─────────────────────────┘
```

### JWT Token Payload

```typescript
interface JwtPayload {
  sub: string;        // User ID
  email: string;      // User email
  role: string;       // User role (super_admin, admin, etc.)
  tenantId: string | null;  // Tenant ID (null for super admin)
  companyCode?: string;     // Company code
  companyName?: string;     // Company name
}
```

### API Request Flow

```
Request → JWT Validation → Role Guard → Tenant Guard → Controller
              │                │              │
              │                │              └── Ensures tenantId exists
              │                │                  (except for super_admin)
              │                │
              │                └── Checks user role against
              │                    required roles
              │
              └── Validates token, loads user,
                  checks user/tenant status
```

---

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|:-------------:|
| POST | `/api/auth/login` | Login with company code | No |
| GET | `/api/auth/me` | Get current user info | Yes |

**Login Request:**
```json
{
  "company_code": "EXCELL",
  "email": "admin@example.com",
  "password": "Admin@123456"
}
```

**Login Response:**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "admin@example.com",
      "full_name": "Company Administrator",
      "role": "admin",
      "is_super_admin": false
    },
    "company": {
      "id": "uuid",
      "code": "EXCELL",
      "name": "Excellence Coaching Center"
    }
  }
}
```

### Super Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/super-admin/stats` | Global statistics |
| GET | `/api/super-admin/companies` | List all companies |
| POST | `/api/super-admin/companies` | Create new company |
| GET | `/api/super-admin/companies/:id` | Get company details |
| PUT | `/api/super-admin/companies/:id` | Update company |
| PATCH | `/api/super-admin/companies/:id/status` | Toggle company status |
| POST | `/api/super-admin/companies/:id/users` | Create user in company |

**Create Company Request:**
```json
{
  "name": "New Coaching Center",
  "code": "NEWCC",
  "adminEmail": "admin@newcc.com",
  "adminPassword": "SecurePass123",
  "adminFullName": "John Doe"
}
```

**Create Company Response:**
```json
{
  "success": true,
  "data": {
    "company": {
      "id": "uuid",
      "name": "New Coaching Center",
      "code": "NEWCC"
    },
    "admin": {
      "id": "uuid",
      "email": "admin@newcc.com",
      "fullName": "John Doe"
    }
  }
}
```

### User Management Endpoints (Company Admin)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/users` | List company users |
| GET | `/api/admin/users/roles` | Get available roles |
| GET | `/api/admin/users/:id` | Get user details |
| POST | `/api/admin/users` | Create new user |
| PUT | `/api/admin/users/:id` | Update user |
| PATCH | `/api/admin/users/:id/reset-password` | Reset user password |
| DELETE | `/api/admin/users/:id` | Delete user |

**Create User Request:**
```json
{
  "email": "staff@company.com",
  "password": "StaffPass123",
  "fullName": "Staff Member",
  "role": "staff"
}
```

---

## Database Schema

### Tenant Model

```prisma
model Tenant {
  id        String   @id @default(uuid())
  name      String
  code      String   @unique  // Company code for login
  subdomain String?  @unique
  status    String   @default("active")
  settings  Json     @default("{}")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  branches   Branch[]
  users      User[]
  students   Student[]
  parents    Parent[]
  teachers   Teacher[]

  @@index([code])
}
```

### User Model

```prisma
model User {
  id           String   @id @default(uuid())
  tenantId     String?  // Null for super_admin
  email        String
  passwordHash String
  fullName     String
  role         String   @default("viewer")
  status       String   @default("active")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Relations
  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, email])
  @@index([tenantId])
  @@index([email])
}
```

### Data Isolation

All tenant-specific models include a `tenantId` field:

```prisma
model Student {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  // ... other fields
}

model Teacher {
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id])
  // ... other fields
}
```

---

## Frontend Structure

### Directory Structure

```
frontend/admin-new/app/
├── contexts/
│   └── AuthContext.tsx      # Authentication state management
├── providers.tsx            # Client-side providers wrapper
├── layout.tsx               # Root layout with providers
├── page.tsx                 # Login page
├── super-admin/
│   ├── layout.tsx           # Super admin layout
│   └── page.tsx             # Company management dashboard
└── dashboard/
    ├── layout.tsx           # Company dashboard layout
    ├── page.tsx             # Main dashboard
    └── users/
        └── page.tsx         # User management page
```

### AuthContext Usage

```tsx
// Using the auth context in components
import { useAuth } from '../contexts/AuthContext';

function MyComponent() {
  const {
    user,           // Current user object
    company,        // Current company object
    token,          // JWT token
    isAuthenticated,// Boolean
    isSuperAdmin,   // Boolean
    hasRole,        // Function: (minRole: string) => boolean
    hasPermission,  // Function: (permission: string) => boolean
    logout,         // Function to logout
  } = useAuth();

  // Check role
  if (hasRole('admin')) {
    // Show admin features
  }

  // Check permission
  if (hasPermission('students:create')) {
    // Show create button
  }
}
```

### Route Protection

**Super Admin Routes:**
```tsx
// super-admin/layout.tsx
useEffect(() => {
  if (!isLoading && !isSuperAdmin) {
    router.push('/dashboard');
  }
}, [isLoading, isSuperAdmin]);
```

**Company Dashboard Routes:**
```tsx
// dashboard/layout.tsx
useEffect(() => {
  if (!isLoading && isSuperAdmin) {
    router.push('/super-admin');
  }
}, [isLoading, isSuperAdmin]);
```

---

## Setup & Deployment

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database URL and JWT_SECRET

# Run database migrations
npx prisma migrate dev

# Seed the database
npx prisma db seed

# Start development server
npm run start:dev
```

### Frontend Setup

```bash
cd frontend/admin-new

# Install dependencies
npm install

# Start development server
npm run dev
```

### Environment Variables

**Backend (.env):**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/attendance"
JWT_SECRET="your-secure-jwt-secret-key"
JWT_EXPIRES_IN="7d"
```

### Database Seed

The seed script creates:
1. Super Admin user (no tenant)
2. Default company "Excellence Coaching Center" (code: EXCELL)
3. Company admin user
4. Sample students

```bash
npx prisma db seed
```

---

## Default Credentials

### Super Admin
| Field | Value |
|-------|-------|
| Company Code | (leave empty) or SUPERADMIN |
| Email | superadmin@system.com |
| Password | SuperAdmin@123 |

### Company Admin
| Field | Value |
|-------|-------|
| Company Code | EXCELL |
| Email | admin@example.com |
| Password | Admin@123456 |

### Sample Students
| Code | PIN |
|------|-----|
| ST001 | 1234 |
| ST002 | 2345 |
| ST003 | 3456 |

---

## Security Considerations

### Password Hashing
- All passwords are hashed using bcrypt with 12 rounds
- Passwords are never stored in plain text

### JWT Security
- Tokens expire after 7 days (configurable)
- Token validation checks user and tenant status
- Invalid/expired tokens return 401 Unauthorized

### Role-Based Access Control
- Guards enforce role requirements at controller level
- Frontend UI adapts based on user permissions
- API endpoints validate permissions server-side

### Tenant Isolation
- All queries filter by tenantId
- Users cannot access data from other tenants
- Super admin bypasses tenant restrictions

---

## API Error Responses

### Common Error Codes

| Status | Error | Description |
|--------|-------|-------------|
| 400 | Bad Request | Invalid input data |
| 401 | Unauthorized | Invalid credentials or token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Duplicate resource (e.g., email exists) |

### Error Response Format

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "error": "Unauthorized"
}
```

---

## File Reference

### Backend Files

| File | Purpose |
|------|---------|
| `src/modules/auth/auth.service.ts` | Login logic with company code |
| `src/modules/auth/auth.controller.ts` | Auth endpoints |
| `src/modules/auth/jwt.strategy.ts` | JWT validation |
| `src/modules/super-admin/super-admin.module.ts` | Super admin module |
| `src/modules/super-admin/super-admin.controller.ts` | Company management endpoints |
| `src/modules/super-admin/super-admin.service.ts` | Company CRUD operations |
| `src/modules/users/users.module.ts` | Users module |
| `src/modules/users/users.controller.ts` | User management endpoints |
| `src/modules/users/users.service.ts` | User CRUD operations |
| `src/common/guards/roles.guard.ts` | Role-based access guard |
| `src/common/guards/tenant.guard.ts` | Tenant context guard |
| `src/common/decorators/roles.decorator.ts` | @Roles() decorator |
| `src/common/decorators/permissions.decorator.ts` | Permission definitions |
| `prisma/schema.prisma` | Database schema |
| `prisma/seed.ts` | Database seeding |

### Frontend Files

| File | Purpose |
|------|---------|
| `app/page.tsx` | Login page with company code |
| `app/layout.tsx` | Root layout |
| `app/providers.tsx` | Client providers |
| `app/contexts/AuthContext.tsx` | Auth state management |
| `app/super-admin/layout.tsx` | Super admin layout |
| `app/super-admin/page.tsx` | Company management |
| `app/dashboard/layout.tsx` | Dashboard layout |
| `app/dashboard/users/page.tsx` | User management |

---

## Troubleshooting

### Common Issues

**1. "Company not found" error**
- Verify the company code is correct (case-insensitive)
- Check if the company status is "active"

**2. "Invalid credentials" error**
- Verify email and password
- For super admin, leave company code empty
- Check if user status is "active"

**3. "Company account is inactive" error**
- Super admin needs to activate the company
- Go to /super-admin and toggle company status

**4. "Tenant context required" error**
- Non-super-admin users must have a tenantId
- This error indicates a user was created without a tenant

### Debug Commands

```bash
# Check database connection
npx prisma db pull

# View database records
npx prisma studio

# Reset database
npx prisma migrate reset

# Regenerate Prisma client
npx prisma generate
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01-16 | Initial multi-tenant implementation |

---

## Support

For issues or questions, please contact the development team or create an issue in the project repository.
