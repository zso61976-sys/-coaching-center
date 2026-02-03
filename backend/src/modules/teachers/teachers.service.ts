import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class TeachersService {
  constructor(private prisma: PrismaService) {}

  // Teacher CRUD
  async createTeacher(data: {
    tenantId: string;
    teacherCode: string;
    fullName: string;
    attendanceId?: string;
    phone?: string;
    salary?: number;
    subjects: string[];
    classes: string[];
    deviceIds?: string[];
  }) {
    // Check for duplicate teacher code
    const existing = await this.prisma.teacher.findFirst({
      where: {
        tenantId: data.tenantId,
        teacherCode: data.teacherCode,
      },
    });

    if (existing) {
      throw new ConflictException({
        success: false,
        error: 'DUPLICATE_TEACHER_CODE',
        message: 'Teacher code already exists',
      });
    }

    // Generate attendanceId if not provided
    let attendanceId = data.attendanceId;
    if (!attendanceId) {
      attendanceId = await this.generateAttendanceId(data.tenantId);
    } else {
      // Check if attendanceId already exists
      const existingAttId = await this.prisma.teacher.findFirst({
        where: { tenantId: data.tenantId, attendanceId },
      });
      if (existingAttId) {
        throw new ConflictException({
          success: false,
          error: 'DUPLICATE_ATTENDANCE_ID',
          message: 'Attendance ID already exists',
        });
      }
    }

    const teacher = await this.prisma.teacher.create({
      data: {
        tenantId: data.tenantId,
        teacherCode: data.teacherCode,
        attendanceId,
        fullName: data.fullName,
        phone: data.phone,
        salary: data.salary,
        subjects: data.subjects,
        classes: data.classes,
      },
    });

    // Auto-enroll teacher to biometric devices and push to device
    await this.autoEnrollToBiometricDevices(data.tenantId, teacher.id, attendanceId, data.fullName, data.deviceIds);

    return {
      success: true,
      message: 'Teacher created successfully',
      data: {
        teacher_id: teacher.id,
        teacher_code: teacher.teacherCode,
        attendance_id: teacher.attendanceId,
        full_name: teacher.fullName,
        phone: teacher.phone,
        salary: teacher.salary ? Number(teacher.salary) : null,
        subjects: teacher.subjects,
        classes: teacher.classes,
        status: teacher.status,
      },
    };
  }

  private async generateAttendanceId(tenantId: string): Promise<string> {
    // Find the highest attendance ID for this tenant (students + teachers)
    const [lastStudent, lastTeacher] = await Promise.all([
      this.prisma.student.findFirst({
        where: { tenantId, attendanceId: { not: null } },
        orderBy: { attendanceId: 'desc' },
        select: { attendanceId: true },
      }),
      this.prisma.teacher.findFirst({
        where: { tenantId, attendanceId: { not: null } },
        orderBy: { attendanceId: 'desc' },
        select: { attendanceId: true },
      }),
    ]);

    const lastStudentId = lastStudent?.attendanceId ? parseInt(lastStudent.attendanceId) : 0;
    const lastTeacherId = lastTeacher?.attendanceId ? parseInt(lastTeacher.attendanceId) : 0;
    const maxId = Math.max(lastStudentId, lastTeacherId, 1000); // Start from 1001

    return String(maxId + 1);
  }

  private async autoEnrollToBiometricDevices(tenantId: string, teacherId: string, attendanceId: string, fullName?: string, deviceIds?: string[]) {
    // Get devices - either specific ones or all active devices
    let devices;
    if (deviceIds && deviceIds.length > 0) {
      devices = await this.prisma.biometricDevice.findMany({
        where: { tenantId, status: 'active', id: { in: deviceIds } },
      });
    } else {
      devices = await this.prisma.biometricDevice.findMany({
        where: { tenantId, status: 'active' },
      });
    }

    // Create enrollment and queue push command for each device
    for (const device of devices) {
      try {
        await this.prisma.biometricEnrollment.create({
          data: {
            deviceId: device.id,
            teacherId,
            deviceUserId: attendanceId,
            memberType: 'teacher',
            status: 'active',
          },
        });

        // Queue push command to add user on the device
        const name = fullName || attendanceId;
        const commandData = `DATA UPDATE USERINFO PIN=${attendanceId}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`;
        await this.prisma.deviceCommand.create({
          data: {
            deviceId: device.id,
            commandType: 'set_user',
            commandData,
            status: 'pending',
          },
        });
      } catch (error) {
        // Ignore duplicate enrollment errors
        console.log(`Auto-enrollment skipped for device ${device.id}: ${error.message}`);
      }
    }
  }

  async findAllTeachers(tenantId: string, options?: {
    status?: string;
    search?: string;
  }) {
    const where: any = { tenantId };

    if (options?.status) where.status = options.status;
    if (options?.search) {
      where.OR = [
        { fullName: { contains: options.search, mode: 'insensitive' } },
        { teacherCode: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const teachers = await this.prisma.teacher.findMany({
      where,
      include: {
        schedules: true,
      },
      orderBy: { fullName: 'asc' },
    });

    return {
      success: true,
      data: {
        teachers: teachers.map(t => ({
          teacher_id: t.id,
          teacher_code: t.teacherCode,
          attendance_id: t.attendanceId,
          full_name: t.fullName,
          phone: t.phone,
          salary: t.salary ? Number(t.salary) : null,
          subjects: t.subjects,
          classes: t.classes,
          status: t.status,
          schedule_count: t.schedules.length,
          created_at: t.createdAt,
        })),
      },
    };
  }

  async findTeacherById(id: string, tenantId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
      include: {
        schedules: true,
      },
    });

    if (!teacher) {
      throw new NotFoundException({
        success: false,
        error: 'TEACHER_NOT_FOUND',
        message: 'Teacher not found',
      });
    }

    return {
      success: true,
      data: {
        teacher_id: teacher.id,
        teacher_code: teacher.teacherCode,
        attendance_id: teacher.attendanceId,
        full_name: teacher.fullName,
        phone: teacher.phone,
        salary: teacher.salary ? Number(teacher.salary) : null,
        subjects: teacher.subjects,
        classes: teacher.classes,
        status: teacher.status,
        schedules: teacher.schedules.map(s => ({
          schedule_id: s.id,
          subject_code: s.subjectCode,
          class_grade: s.classGrade,
          day_of_week: s.dayOfWeek,
          schedule_date: s.scheduleDate,
          start_time: s.startTime,
          end_time: s.endTime,
          is_recurring: s.isRecurring,
        })),
      },
    };
  }

  async updateTeacher(id: string, tenantId: string, data: {
    fullName?: string;
    phone?: string;
    salary?: number;
    subjects?: string[];
    classes?: string[];
    status?: string;
    deviceIds?: string[];
  }) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const updated = await this.prisma.teacher.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        salary: data.salary,
        subjects: data.subjects,
        classes: data.classes,
        status: data.status,
      },
    });

    // Enroll on new devices if deviceIds provided
    if (data.deviceIds && data.deviceIds.length > 0 && teacher.attendanceId) {
      await this.autoEnrollToBiometricDevices(
        tenantId,
        id,
        teacher.attendanceId,
        data.fullName || teacher.fullName,
        data.deviceIds,
      );
    }

    return {
      success: true,
      message: 'Teacher updated successfully',
      data: {
        teacher_id: updated.id,
        teacher_code: updated.teacherCode,
        full_name: updated.fullName,
        phone: updated.phone,
        subjects: updated.subjects,
        classes: updated.classes,
        status: updated.status,
      },
    };
  }

  async deleteTeacher(id: string, tenantId: string) {
    const teacher = await this.prisma.teacher.findFirst({
      where: { id, tenantId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    // Queue delete commands for all device enrollments before deleting
    const enrollments = await this.prisma.biometricEnrollment.findMany({
      where: { teacherId: id },
    });

    for (const enrollment of enrollments) {
      await this.prisma.deviceCommand.create({
        data: {
          deviceId: enrollment.deviceId,
          commandType: 'delete_user',
          commandData: `DATA DELETE USERINFO PIN=${enrollment.deviceUserId}`,
          status: 'pending',
        },
      });
    }

    await this.prisma.teacher.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Teacher deleted successfully',
      data: {
        teacher_id: id,
        teacher_code: teacher.teacherCode,
      },
    };
  }

  // Schedule CRUD
  async createSchedule(data: {
    tenantId: string;
    teacherId: string;
    subjectCode: string;
    classGrade: string;
    dayOfWeek?: string;
    scheduleDate?: Date;
    startTime: string;
    endTime: string;
    isRecurring: boolean;
  }) {
    // Verify teacher exists
    const teacher = await this.prisma.teacher.findFirst({
      where: { id: data.teacherId, tenantId: data.tenantId },
    });

    if (!teacher) {
      throw new NotFoundException('Teacher not found');
    }

    const schedule = await this.prisma.classSchedule.create({
      data: {
        tenantId: data.tenantId,
        teacherId: data.teacherId,
        subjectCode: data.subjectCode,
        classGrade: data.classGrade,
        dayOfWeek: data.dayOfWeek,
        scheduleDate: data.scheduleDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isRecurring: data.isRecurring,
      },
      include: {
        teacher: true,
      },
    });

    return {
      success: true,
      message: 'Schedule created successfully',
      data: {
        schedule_id: schedule.id,
        teacher_id: schedule.teacherId,
        teacher_name: schedule.teacher.fullName,
        subject_code: schedule.subjectCode,
        class_grade: schedule.classGrade,
        day_of_week: schedule.dayOfWeek,
        schedule_date: schedule.scheduleDate,
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        is_recurring: schedule.isRecurring,
      },
    };
  }

  async findAllSchedules(tenantId: string, options?: {
    teacherId?: string;
    classGrade?: string;
    dayOfWeek?: string;
    isRecurring?: boolean;
  }) {
    const where: any = { tenantId, status: 'active' };

    if (options?.teacherId) where.teacherId = options.teacherId;
    if (options?.classGrade) where.classGrade = options.classGrade;
    if (options?.dayOfWeek) where.dayOfWeek = options.dayOfWeek;
    if (options?.isRecurring !== undefined) where.isRecurring = options.isRecurring;

    const schedules = await this.prisma.classSchedule.findMany({
      where,
      include: {
        teacher: true,
      },
      orderBy: [
        { dayOfWeek: 'asc' },
        { startTime: 'asc' },
      ],
    });

    return {
      success: true,
      data: {
        schedules: schedules.map(s => ({
          schedule_id: s.id,
          teacher_id: s.teacherId,
          teacher_name: s.teacher.fullName,
          teacher_code: s.teacher.teacherCode,
          subject_code: s.subjectCode,
          class_grade: s.classGrade,
          day_of_week: s.dayOfWeek,
          schedule_date: s.scheduleDate,
          start_time: s.startTime,
          end_time: s.endTime,
          is_recurring: s.isRecurring,
          status: s.status,
        })),
      },
    };
  }

  async updateSchedule(id: string, tenantId: string, data: {
    subjectCode?: string;
    classGrade?: string;
    dayOfWeek?: string;
    scheduleDate?: Date;
    startTime?: string;
    endTime?: string;
    isRecurring?: boolean;
    status?: string;
  }) {
    const schedule = await this.prisma.classSchedule.findFirst({
      where: { id, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    const updated = await this.prisma.classSchedule.update({
      where: { id },
      data: {
        subjectCode: data.subjectCode,
        classGrade: data.classGrade,
        dayOfWeek: data.dayOfWeek,
        scheduleDate: data.scheduleDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isRecurring: data.isRecurring,
        status: data.status,
      },
      include: {
        teacher: true,
      },
    });

    return {
      success: true,
      message: 'Schedule updated successfully',
      data: {
        schedule_id: updated.id,
        teacher_name: updated.teacher.fullName,
        subject_code: updated.subjectCode,
        class_grade: updated.classGrade,
        day_of_week: updated.dayOfWeek,
        start_time: updated.startTime,
        end_time: updated.endTime,
        is_recurring: updated.isRecurring,
      },
    };
  }

  async deleteSchedule(id: string, tenantId: string) {
    const schedule = await this.prisma.classSchedule.findFirst({
      where: { id, tenantId },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    await this.prisma.classSchedule.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Schedule deleted successfully',
      data: {
        schedule_id: id,
      },
    };
  }
}
