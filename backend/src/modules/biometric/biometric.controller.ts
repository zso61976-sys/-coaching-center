import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BiometricService } from './biometric.service';
import { RegisterDeviceDto, UpdateDeviceDto, EnrollStudentDto } from './dto';

@Controller('admin/biometric')
@UseGuards(AuthGuard('jwt'))
export class BiometricController {
  constructor(private readonly biometricService: BiometricService) {}

  // ==================== Device Endpoints ====================

  @Get('devices')
  async getDevices(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const devices = await this.biometricService.getDevices(tenantId);
    return {
      success: true,
      data: devices,
    };
  }

  @Get('devices/:id')
  async getDevice(@Request() req: any, @Param('id') deviceId: string) {
    const tenantId = req.user.tenantId;
    const device = await this.biometricService.getDeviceById(tenantId, deviceId);
    return {
      success: true,
      data: device,
    };
  }

  @Post('devices')
  async registerDevice(@Request() req: any, @Body() dto: RegisterDeviceDto) {
    const tenantId = req.user.tenantId;
    const device = await this.biometricService.registerDevice(tenantId, dto);
    return {
      success: true,
      data: device,
      message: 'Device registered successfully',
    };
  }

  @Put('devices/:id')
  async updateDevice(
    @Request() req: any,
    @Param('id') deviceId: string,
    @Body() dto: UpdateDeviceDto,
  ) {
    const tenantId = req.user.tenantId;
    const device = await this.biometricService.updateDevice(tenantId, deviceId, dto);
    return {
      success: true,
      data: device,
      message: 'Device updated successfully',
    };
  }

  @Delete('devices/:id')
  async deleteDevice(@Request() req: any, @Param('id') deviceId: string) {
    const tenantId = req.user.tenantId;
    await this.biometricService.deleteDevice(tenantId, deviceId);
    return {
      success: true,
      message: 'Device deleted successfully',
    };
  }

  // ==================== Enrollment Endpoints ====================

  @Get('enrollments')
  async getEnrollments(
    @Request() req: any,
    @Query('deviceId') deviceId?: string,
  ) {
    const tenantId = req.user.tenantId;
    const enrollments = await this.biometricService.getEnrollments(tenantId, deviceId);
    return {
      success: true,
      data: enrollments,
    };
  }

  @Post('enroll')
  async enrollStudent(@Request() req: any, @Body() dto: EnrollStudentDto) {
    const tenantId = req.user.tenantId;
    const enrollment = await this.biometricService.enrollStudent(tenantId, dto);
    return {
      success: true,
      data: enrollment,
      message: 'Student enrolled successfully',
    };
  }

  @Delete('enroll/:id')
  async removeEnrollment(@Request() req: any, @Param('id') enrollmentId: string) {
    const tenantId = req.user.tenantId;
    await this.biometricService.removeEnrollment(tenantId, enrollmentId);
    return {
      success: true,
      message: 'Enrollment removed successfully',
    };
  }

  // ==================== Logs & Status Endpoints ====================

  @Get('logs')
  async getPunchLogs(
    @Request() req: any,
    @Query('deviceId') deviceId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('processed') processed?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const tenantId = req.user.tenantId;
    const result = await this.biometricService.getPunchLogs(tenantId, {
      deviceId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      processed: processed !== undefined ? processed === 'true' : undefined,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return {
      success: true,
      data: result.logs,
      total: result.total,
    };
  }

  @Get('sync-status')
  async getSyncStatus(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const status = await this.biometricService.getDeviceSyncStatus(tenantId);
    return {
      success: true,
      data: status,
    };
  }

  // ==================== Attendance Report Endpoint ====================

  @Get('attendance/report')
  async getAttendanceReport(
    @Request() req: any,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('studentId') studentId?: string,
    @Query('branchId') branchId?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = req.user.tenantId;
    const report = await this.biometricService.getAttendanceReport(tenantId, {
      date,
      startDate,
      endDate,
      studentId,
      branchId,
      search,
    });
    return {
      success: true,
      data: report,
    };
  }

  // ==================== Device Command Endpoints ====================

  @Post('devices/:id/push-user')
  async pushUserToDevice(
    @Request() req: any,
    @Param('id') deviceId: string,
    @Body() body: { pin: string; name: string },
  ) {
    const tenantId = req.user.tenantId;
    // Verify device belongs to tenant
    await this.biometricService.getDeviceById(tenantId, deviceId);
    const command = await this.biometricService.queueSetUserCommand(deviceId, body.pin, body.name);
    return {
      success: true,
      data: command,
      message: 'Push user command queued',
    };
  }

  @Post('devices/:id/delete-user')
  async deleteUserFromDevice(
    @Request() req: any,
    @Param('id') deviceId: string,
    @Body() body: { pin: string },
  ) {
    const tenantId = req.user.tenantId;
    await this.biometricService.getDeviceById(tenantId, deviceId);
    const command = await this.biometricService.queueDeleteUserCommand(deviceId, body.pin);
    return {
      success: true,
      data: command,
      message: 'Delete user command queued',
    };
  }

  @Get('devices/:id/commands')
  async getDeviceCommands(
    @Request() req: any,
    @Param('id') deviceId: string,
  ) {
    const tenantId = req.user.tenantId;
    const commands = await this.biometricService.getCommandHistory(tenantId, deviceId);
    return {
      success: true,
      data: commands,
    };
  }

  // ==================== Sync Endpoints ====================

  @Post('devices/:id/sync-time')
  async syncDeviceTime(
    @Request() req: any,
    @Param('id') deviceId: string,
  ) {
    const tenantId = req.user.tenantId;
    await this.biometricService.getDeviceById(tenantId, deviceId);
    const command = await this.biometricService.queueSyncTimeCommand(deviceId);
    return {
      success: true,
      data: command,
      message: 'Sync time command queued',
    };
  }

  @Post('sync-time-all')
  async syncTimeAllDevices(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const results = await this.biometricService.syncTimeAllDevices(tenantId);
    return {
      success: true,
      data: results,
      message: `Sync time queued for ${results.length} device(s)`,
    };
  }

  @Post('sync-all-enrollments')
  async syncAllEnrollments(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const results = await this.biometricService.syncAllEnrollments(tenantId);
    return {
      success: true,
      data: results,
      message: `Synced ${results.length} enrollment(s) to devices`,
    };
  }

  // ==================== Fingerprint Sync Endpoints ====================

  @Post('fingerprint/download/:deviceId/:pin')
  async downloadFingerprint(
    @Request() req: any,
    @Param('deviceId') deviceId: string,
    @Param('pin') pin: string,
  ) {
    const tenantId = req.user.tenantId;
    const result = await this.biometricService.downloadFingerprintFromDevice(tenantId, deviceId, pin);
    return {
      success: true,
      data: result,
      message: 'Download fingerprint command queued. The device will upload the template on next sync.',
    };
  }

  @Post('fingerprint/sync/:pin')
  async syncFingerprints(
    @Request() req: any,
    @Param('pin') pin: string,
  ) {
    const tenantId = req.user.tenantId;
    const result = await this.biometricService.syncFingerprintsToAllDevices(tenantId, pin);
    return {
      success: true,
      data: result,
      message: result.synced > 0
        ? `Fingerprint sync queued for ${result.synced} device(s)`
        : result.message || 'No fingerprints to sync',
    };
  }

  @Get('fingerprint/:pin')
  async getFingerprintStatus(
    @Request() req: any,
    @Param('pin') pin: string,
  ) {
    const tenantId = req.user.tenantId;
    const templates = await this.biometricService.getFingerprintTemplates(tenantId, pin);
    return {
      success: true,
      data: {
        pin,
        templateCount: templates.length,
        templates: templates.map(t => ({
          fingerIndex: t.fingerIndex,
          size: t.size,
          sourceDeviceId: t.sourceDeviceId,
          createdAt: t.createdAt,
        })),
      },
    };
  }
}
