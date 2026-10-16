import { Body, Controller, Get, Put, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';
import { AdminService } from './admin.service';

class UpdateClassesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  classes: string[];
}

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

  @Get('classes')
  async getClasses(@Request() req: any) {
    return { success: true, data: await this.adminService.getClasses(req.user.tenantId) };
  }

  @Put('classes')
  async updateClasses(@Request() req: any, @Body() dto: UpdateClassesDto) {
    return { success: true, data: await this.adminService.updateClasses(req.user.tenantId, dto.classes) };
  }
}
