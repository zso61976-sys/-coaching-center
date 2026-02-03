import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AuthGuard('jwt'))
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('dashboard')
  async getDashboardStats(@Request() req: any) {
    return this.adminService.getDashboardStats(req.user.tenantId);
  }

  @Get('branches')
  async getBranches(@Request() req: any) {
    return this.adminService.getBranches(req.user.tenantId);
  }

  @Get('audit-logs')
  async getAuditLogs(
    @Query('entity_type') entityType: string,
    @Query('action') action: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    return this.adminService.getAuditLogs(req.user.tenantId, {
      entityType,
      action,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('telegram-stats')
  async getTelegramStats(@Request() req: any) {
    return this.adminService.getTelegramStats(req.user.tenantId);
  }
}
