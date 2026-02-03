import { SetMetadata } from '@nestjs/common';

export enum Permission {
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

  // Finance/Accounts permissions
  ACCOUNTS_READ = 'accounts:read',
  ACCOUNTS_MANAGE = 'accounts:manage',

  // User management permissions
  USERS_READ = 'users:read',
  USERS_MANAGE = 'users:manage',

  // Company/Tenant permissions (super admin only)
  TENANTS_READ = 'tenants:read',
  TENANTS_MANAGE = 'tenants:manage',
}

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

// Role to permissions mapping
export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  super_admin: Object.values(Permission), // All permissions
  admin: [
    Permission.STUDENTS_READ, Permission.STUDENTS_CREATE, Permission.STUDENTS_UPDATE, Permission.STUDENTS_DELETE,
    Permission.TEACHERS_READ, Permission.TEACHERS_CREATE, Permission.TEACHERS_UPDATE, Permission.TEACHERS_DELETE,
    Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CREATE,
    Permission.ACCOUNTS_READ, Permission.ACCOUNTS_MANAGE,
    Permission.USERS_READ, Permission.USERS_MANAGE,
  ],
  manager: [
    Permission.STUDENTS_READ, Permission.STUDENTS_CREATE, Permission.STUDENTS_UPDATE, Permission.STUDENTS_DELETE,
    Permission.TEACHERS_READ, Permission.TEACHERS_CREATE, Permission.TEACHERS_UPDATE, Permission.TEACHERS_DELETE,
    Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CREATE,
    Permission.ACCOUNTS_READ, Permission.ACCOUNTS_MANAGE,
  ],
  staff: [
    Permission.STUDENTS_READ, Permission.STUDENTS_CREATE, Permission.STUDENTS_UPDATE,
    Permission.TEACHERS_READ,
    Permission.ATTENDANCE_READ, Permission.ATTENDANCE_CREATE,
  ],
  viewer: [
    Permission.STUDENTS_READ,
    Permission.TEACHERS_READ,
    Permission.ATTENDANCE_READ,
    Permission.ACCOUNTS_READ,
  ],
};

// Helper function to check if role has permission
export function hasPermission(role: string, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission);
}
