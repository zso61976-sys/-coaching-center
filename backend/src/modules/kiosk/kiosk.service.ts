import { Injectable, UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CheckInDto, CheckOutDto, VerifyDto } from './dto/kiosk.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class KioskService {
  constructor(
    private prisma: PrismaService,
  ) {}

  async checkIn(dto: CheckInDto, tenantId: string) {
    // Find student by code
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId,
        studentCode: dto.student_code,
      },
      include: {
        branch: true,
        parents: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!student) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }

    // Verify PIN
    if (!student.pinHash) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }
    const pinValid = await bcrypt.compare(dto.pin, student.pinHash);
    if (!pinValid) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }

    // Check if student is active
    if (student.status !== 'active') {
      throw new ForbiddenException({
        success: false,
        error: 'STUDENT_INACTIVE',
        message: 'Your account is inactive. Please contact administration.',
      });
    }

    // Check for existing open session
    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId: student.id,
        checkoutTime: null,
      },
    });

    if (openSession) {
      throw new ConflictException({
        success: false,
        error: 'ALREADY_CHECKED_IN',
        message: 'You are already checked in. Please check out first.',
        data: {
          checkin_time: openSession.checkinTime,
        },
      });
    }

    // Create attendance record
    const attendance = await this.prisma.attendanceSession.create({
      data: {
        tenantId,
        branchId: dto.branch_id,
        studentId: student.id,
        checkinTime: new Date(),
        status: 'checked_in',
      },
    });

    // TODO: Queue Telegram notifications when Redis is available
    // Notifications disabled for testing without Redis

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorType: 'kiosk',
        action: 'student.checkin',
        entityType: 'attendance_session',
        entityId: attendance.id,
        afterData: { attendance_id: attendance.id, student_id: student.id },
        ipAddress: dto.kiosk_ip,
      },
    });

    return {
      success: true,
      message: 'Check-in successful',
      data: {
        attendance_id: attendance.id,
        student: {
          student_id: student.id,
          full_name: student.fullName,
          student_code: student.studentCode,
        },
        checkin_time: attendance.checkinTime,
        branch_name: student.branch.name,
      },
    };
  }

  async checkOut(dto: CheckOutDto, tenantId: string) {
    // Find student by code
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId,
        studentCode: dto.student_code,
      },
      include: {
        branch: true,
        parents: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!student) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }

    // Verify PIN
    if (!student.pinHash) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }
    const pinValid = await bcrypt.compare(dto.pin, student.pinHash);
    if (!pinValid) {
      throw new UnauthorizedException({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Student ID or PIN incorrect',
      });
    }

    // Find open session
    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId: student.id,
        checkoutTime: null,
      },
    });

    if (!openSession) {
      throw new BadRequestException({
        success: false,
        error: 'NOT_CHECKED_IN',
        message: 'You are not checked in. Please check in first.',
      });
    }

    // Check minimum stay duration (5 minutes)
    const checkinTime = new Date(openSession.checkinTime);
    const now = new Date();
    const diffMinutes = (now.getTime() - checkinTime.getTime()) / 1000 / 60;

    if (diffMinutes < 5) {
      throw new BadRequestException({
        success: false,
        error: 'CHECKOUT_TOO_SOON',
        message: 'You must be checked in for at least 5 minutes before checking out.',
      });
    }

    // Update attendance record
    const checkoutTime = new Date();
    const durationMinutes = Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 1000 / 60);

    const attendance = await this.prisma.attendanceSession.update({
      where: { id: openSession.id },
      data: {
        checkoutTime,
        checkoutMethod: 'self_service',
        status: 'checked_out',
      },
    });

    // TODO: Queue Telegram notifications when Redis is available
    // Notifications disabled for testing without Redis

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorType: 'kiosk',
        action: 'student.checkout',
        entityType: 'attendance_session',
        entityId: attendance.id,
        beforeData: { checkout_time: null },
        afterData: { checkout_time: checkoutTime, checkout_method: 'self_service' },
        ipAddress: dto.kiosk_ip,
      },
    });

    return {
      success: true,
      message: 'Check-out successful',
      data: {
        attendance_id: attendance.id,
        student: {
          student_id: student.id,
          full_name: student.fullName,
          student_code: student.studentCode,
        },
        checkin_time: openSession.checkinTime,
        checkout_time: checkoutTime,
        duration_minutes: durationMinutes,
        branch_name: student.branch.name,
      },
    };
  }

  async verify(dto: VerifyDto, tenantId: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        tenantId,
        studentCode: dto.student_code,
      },
    });

    if (!student) {
      return {
        success: true,
        valid: false,
      };
    }

    if (!student.pinHash) {
      return {
        success: true,
        valid: false,
      };
    }

    const pinValid = await bcrypt.compare(dto.pin, student.pinHash);
    if (!pinValid) {
      return {
        success: true,
        valid: false,
      };
    }

    // Check if currently checked in
    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId: student.id,
        checkoutTime: null,
      },
    });

    return {
      success: true,
      valid: true,
      student: {
        student_id: student.id,
        full_name: student.fullName,
        status: student.status,
        currently_checked_in: !!openSession,
      },
    };
  }
}
