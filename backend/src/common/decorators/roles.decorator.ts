import { SetMetadata } from '@nestjs/common';

export type UserRole = 'super_admin' | 'admin' | 'manager' | 'staff' | 'viewer';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
