import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Super admin can access without tenantId
    if (user?.role === 'super_admin') {
      return true;
    }

    // Regular users must have tenantId
    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    return true;
  }
}
