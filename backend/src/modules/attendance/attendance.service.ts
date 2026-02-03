import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async getReport(tenantId: string, options: {
    from?: Date;
    to?: Date;
    branchId?: string;
    studentId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (options.from) {
      where.checkinTime = { gte: options.from };
    }
    if (options.to) {
      where.checkinTime = { ...where.checkinTime, lte: options.to };
    }
    if (options.branchId) where.branchId = options.branchId;
    if (options.studentId) where.studentId = options.studentId;
    if (options.status) where.status = options.status;

    const [records, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        skip,
        take: limit,
        include: {
          student: true,
          branch: true,
        },
        orderBy: { checkinTime: 'desc' },
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);

    // Calculate summary
    const allRecords = await this.prisma.attendanceSession.findMany({
      where,
      select: {
        checkinTime: true,
        checkoutTime: true,
        studentId: true,
      },
    });

    let totalDuration = 0;
    let completedSessions = 0;
    const uniqueStudents = new Set<string>();

    for (const record of allRecords) {
      uniqueStudents.add(record.studentId);
      if (record.checkoutTime) {
        completedSessions++;
        const duration = (new Date(record.checkoutTime).getTime() - new Date(record.checkinTime).getTime()) / 1000 / 60;
        totalDuration += duration;
      }
    }

    const avgDuration = completedSessions > 0 ? Math.round(totalDuration / completedSessions) : 0;

    return {
      success: true,
      data: {
        records: records.map(r => ({
          attendance_id: r.id,
          student: {
            student_id: r.student.id,
            student_code: r.student.studentCode,
            full_name: r.student.fullName,
          },
          branch_name: r.branch.name,
          checkin_time: r.checkinTime,
          checkout_time: r.checkoutTime,
          duration_minutes: r.checkoutTime
            ? Math.round((new Date(r.checkoutTime).getTime() - new Date(r.checkinTime).getTime()) / 1000 / 60)
            : null,
          checkout_method: r.checkoutMethod,
          status: r.status,
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
        summary: {
          total_sessions: total,
          avg_duration_minutes: avgDuration,
          unique_students: uniqueStudents.size,
        },
      },
    };
  }

  async getCurrentlyCheckedIn(tenantId: string, branchId?: string) {
    const where: any = {
      tenantId,
      checkoutTime: null,
    };

    if (branchId) where.branchId = branchId;

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: {
        student: true,
        branch: true,
      },
      orderBy: { checkinTime: 'asc' },
    });

    return {
      success: true,
      data: {
        count: sessions.length,
        students: sessions.map(s => ({
          attendance_id: s.id,
          student_id: s.student.id,
          student_code: s.student.studentCode,
          full_name: s.student.fullName,
          branch_name: s.branch.name,
          checkin_time: s.checkinTime,
          duration_minutes: Math.round((new Date().getTime() - new Date(s.checkinTime).getTime()) / 1000 / 60),
        })),
      },
    };
  }

  async getDailyStats(tenantId: string, date: Date, branchId?: string) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const where: any = {
      tenantId,
      checkinTime: {
        gte: startOfDay,
        lte: endOfDay,
      },
    };

    if (branchId) where.branchId = branchId;

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: {
        student: true,
      },
    });

    const uniqueStudents = new Set(sessions.map(s => s.studentId));
    const checkedOut = sessions.filter(s => s.checkoutTime).length;
    const stillCheckedIn = sessions.filter(s => !s.checkoutTime).length;

    let totalDuration = 0;
    for (const session of sessions) {
      if (session.checkoutTime) {
        totalDuration += (new Date(session.checkoutTime).getTime() - new Date(session.checkinTime).getTime()) / 1000 / 60;
      }
    }

    return {
      success: true,
      data: {
        date: date.toISOString().split('T')[0],
        total_checkins: sessions.length,
        unique_students: uniqueStudents.size,
        checked_out: checkedOut,
        still_checked_in: stillCheckedIn,
        avg_duration_minutes: checkedOut > 0 ? Math.round(totalDuration / checkedOut) : 0,
      },
    };
  }

  // Punch-log based daily attendance report
  // Groups raw biometric punches by student + date
  // First punch of the day = check-in, last punch = check-out
  // If only one punch exists, checkout = missing
  async getPunchBasedReport(tenantId: string, options: {
    from?: Date;
    to?: Date;
    search?: string;
  }) {
    // Get all devices for this tenant
    const devices = await this.prisma.biometricDevice.findMany({
      where: { tenantId },
      select: { id: true },
    });
    const deviceIds = devices.map(d => d.id);

    if (deviceIds.length === 0) {
      return {
        success: true,
        data: { records: [] },
      };
    }

    // Build punch log query
    const punchWhere: any = {
      deviceId: { in: deviceIds },
    };

    if (options.from || options.to) {
      punchWhere.punchTime = {};
      if (options.from) punchWhere.punchTime.gte = options.from;
      if (options.to) punchWhere.punchTime.lte = options.to;
    }

    // Fetch all punch logs in range, ordered by time
    const punchLogs = await this.prisma.biometricPunchLog.findMany({
      where: punchWhere,
      orderBy: { punchTime: 'asc' },
    });

    // Fetch all enrollments for these devices with student info
    const enrollments = await this.prisma.biometricEnrollment.findMany({
      where: {
        deviceId: { in: deviceIds },
        studentId: { not: null },
      },
      include: {
        student: {
          include: {
            branch: true,
          },
        },
      },
    });

    // Build enrollment lookup: "deviceId|deviceUserId" → enrollment
    const enrollmentMap = new Map<string, any>();
    for (const enrollment of enrollments) {
      const key = `${enrollment.deviceId}|${enrollment.deviceUserId}`;
      enrollmentMap.set(key, enrollment);
    }

    // Group punches by student + date
    const dailyMap = new Map<string, { punches: Date[]; student: any; branch: any }>();

    for (const punch of punchLogs) {
      const key = `${punch.deviceId}|${punch.deviceUserId}`;
      const enrollment = enrollmentMap.get(key);
      if (!enrollment || !enrollment.student) continue;

      const punchDate = new Date(punch.punchTime);
      const dateKey = `${punchDate.getFullYear()}-${String(punchDate.getMonth() + 1).padStart(2, '0')}-${String(punchDate.getDate()).padStart(2, '0')}`;
      const groupKey = `${enrollment.studentId}|${dateKey}`;

      if (!dailyMap.has(groupKey)) {
        dailyMap.set(groupKey, {
          punches: [],
          student: enrollment.student,
          branch: enrollment.student.branch,
        });
      }
      dailyMap.get(groupKey)!.punches.push(punchDate);
    }

    // Build records from grouped data
    const records: any[] = [];
    for (const [groupKey, data] of dailyMap) {
      const parts = groupKey.split('|');
      const dateKey = parts[parts.length - 1];
      const sortedPunches = data.punches.sort((a, b) => a.getTime() - b.getTime());
      const firstPunch = sortedPunches[0];
      const lastPunch = sortedPunches.length > 1 ? sortedPunches[sortedPunches.length - 1] : null;

      let durationMinutes: number | null = null;
      if (lastPunch) {
        durationMinutes = Math.round((lastPunch.getTime() - firstPunch.getTime()) / 1000 / 60);
      }

      records.push({
        attendance_id: `${data.student.id}-${dateKey}`,
        student: {
          student_id: data.student.id,
          student_code: data.student.studentCode,
          full_name: data.student.fullName,
          grade: data.student.grade,
        },
        branch_name: data.branch?.name || '-',
        date: dateKey,
        checkin_time: firstPunch.toISOString(),
        checkout_time: lastPunch ? lastPunch.toISOString() : null,
        duration_minutes: durationMinutes,
        total_punches: sortedPunches.length,
        status: lastPunch ? 'checked_out' : 'missing_checkout',
      });
    }

    // Sort by date desc, then student name asc
    records.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.student.full_name.localeCompare(b.student.full_name);
    });

    // Apply search filter if provided
    let filteredRecords = records;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filteredRecords = records.filter(r =>
        r.student.full_name.toLowerCase().includes(searchLower) ||
        r.student.student_code.toLowerCase().includes(searchLower),
      );
    }

    return {
      success: true,
      data: {
        records: filteredRecords,
        summary: {
          total_records: filteredRecords.length,
          unique_students: new Set(filteredRecords.map(r => r.student.student_id)).size,
          checked_out: filteredRecords.filter(r => r.checkout_time).length,
          missing_checkout: filteredRecords.filter(r => !r.checkout_time).length,
        },
      },
    };
  }

  // Auto-checkout cron job - runs at 11 PM daily
  @Cron('0 23 * * *')
  async autoCheckout() {
    console.log('Running auto-checkout job...');

    const today = new Date();
    today.setHours(23, 0, 0, 0);

    const openSessions = await this.prisma.attendanceSession.findMany({
      where: {
        checkoutTime: null,
        checkinTime: { lt: today },
      },
      include: {
        student: {
          include: {
            branch: true,
            parents: {
              include: {
                parent: true,
              },
            },
          },
        },
      },
    });

    console.log(`Found ${openSessions.length} open sessions to auto-checkout`);

    for (const session of openSessions) {
      const checkoutTime = new Date();
      checkoutTime.setHours(23, 0, 0, 0);

      await this.prisma.attendanceSession.update({
        where: { id: session.id },
        data: {
          checkoutTime,
          checkoutMethod: 'auto_checkout',
          status: 'checked_out',
          notes: 'Auto-closed by system',
        },
      });

      // TODO: Send notifications when Redis is available

      // Log audit
      await this.prisma.auditLog.create({
        data: {
          tenantId: session.tenantId,
          actorType: 'system',
          action: 'attendance.auto_checkout',
          entityType: 'attendance_session',
          entityId: session.id,
          beforeData: { checkout_time: null },
          afterData: { checkout_time: checkoutTime, checkout_method: 'auto_checkout' },
        },
      });
    }

    console.log('Auto-checkout job completed');
  }
}
