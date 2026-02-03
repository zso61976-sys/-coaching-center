import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AttendanceService } from './attendance.service';

@Controller('admin/attendance')
@UseGuards(AuthGuard('jwt'))
export class AttendanceController {
  constructor(private attendanceService: AttendanceService) {}

  @Get('report')
  async getReport(
    @Query('date') date: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('branch_id') branchId: string,
    @Query('student_id') studentId: string,
    @Query('status') status: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    // If 'date' is provided, use it for both from and to (single day filter)
    if (date) {
      fromDate = new Date(date);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(date);
      toDate.setHours(23, 59, 59, 999);
    } else {
      fromDate = from ? new Date(from) : undefined;
      toDate = to ? new Date(to) : undefined;
    }

    return this.attendanceService.getReport(req.user.tenantId, {
      from: fromDate,
      to: toDate,
      branchId,
      studentId,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get('punch-report')
  async getPunchBasedReport(
    @Query('date') date: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('search') search: string,
    @Request() req: any,
  ) {
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (date) {
      fromDate = new Date(date);
      fromDate.setHours(0, 0, 0, 0);
      toDate = new Date(date);
      toDate.setHours(23, 59, 59, 999);
    } else {
      if (from) {
        fromDate = new Date(from);
        fromDate.setHours(0, 0, 0, 0);
      }
      if (to) {
        toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
      }
    }

    return this.attendanceService.getPunchBasedReport(req.user.tenantId, {
      from: fromDate,
      to: toDate,
      search,
    });
  }

  @Get('current')
  async getCurrentlyCheckedIn(
    @Query('branch_id') branchId: string,
    @Request() req: any,
  ) {
    return this.attendanceService.getCurrentlyCheckedIn(req.user.tenantId, branchId);
  }

  @Get('daily-stats')
  async getDailyStats(
    @Query('date') date: string,
    @Query('branch_id') branchId: string,
    @Request() req: any,
  ) {
    const targetDate = date ? new Date(date) : new Date();
    return this.attendanceService.getDailyStats(req.user.tenantId, targetDate, branchId);
  }
}
