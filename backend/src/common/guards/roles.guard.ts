import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole, ROLES_KEY } from '../decorators/roles.decorator';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  super_admin: 100,
  admin: 80,
  manager: 60,
  staff: 40,
  viewer: 20,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Super admin has access to everything
    if (user.role === 'super_admin') {
      return true;
    }

    // Check if user's role meets minimum required role
    const userRoleLevel = ROLE_HIERARCHY[user.role as UserRole] || 0;
    const minRequiredLevel = Math.min(...requiredRoles.map(r => ROLE_HIERARCHY[r]));

    if (userRoleLevel >= minRequiredLevel) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
