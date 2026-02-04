import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    tenantId: string;
    branchId: string;
    studentCode: string;
    fullName: string;
    attendanceId?: string;
    phone?: string;
    email?: string;
    dateOfBirth?: Date;
    grade?: string;
    deviceIds?: string[];
    parents?: Array<{
      fullName: string;
      phone: string;
      email?: string;
      relationship: string;
      isPrimary: boolean;
      telegramChatId?: string;
    }>;
    createdBy?: string;
  }) {
    // Check for duplicate student code
    const existing = await this.prisma.student.findFirst({
      where: {
        tenantId: data.tenantId,
        studentCode: data.studentCode,
      },
    });

    if (existing) {
      throw new ConflictException({
        success: false,
        error: 'DUPLICATE_STUDENT_CODE',
        message: 'Student code already exists',
      });
    }

    // Generate attendanceId if not provided
    let attendanceId = data.attendanceId;
    if (!attendanceId) {
      attendanceId = await this.generateAttendanceId(data.tenantId);
    } else {
      // Check if attendanceId already exists
      const existingAttId = await this.prisma.student.findFirst({
        where: { tenantId: data.tenantId, attendanceId },
      });
      if (existingAttId) {
        throw new ConflictException({
          success: false,
          error: 'DUPLICATE_ATTENDANCE_ID',
          message: 'Biometric ID already exists',
        });
      }
    }

    const student = await this.prisma.student.create({
      data: {
        tenantId: data.tenantId,
        branchId: data.branchId,
        studentCode: data.studentCode,
        attendanceId,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        dateOfBirth: data.dateOfBirth,
        grade: data.grade,
        createdBy: data.createdBy,
      },
    });

    // Create parents if provided
    if (data.parents && data.parents.length > 0) {
      for (const parentData of data.parents) {
        const parent = await this.prisma.parent.create({
          data: {
            tenantId: data.tenantId,
            fullName: parentData.fullName,
            phone: parentData.phone,
            email: parentData.email,
            telegramChatId: parentData.telegramChatId || undefined,
            telegramConnectedAt: parentData.telegramChatId ? new Date() : undefined,
            notificationEnabled: parentData.telegramChatId ? true : undefined,
          },
        });

        await this.prisma.studentParent.create({
          data: {
            studentId: student.id,
            parentId: parent.id,
            relationship: parentData.relationship,
            isPrimary: parentData.isPrimary,
          },
        });
      }
    }

    // Auto-enroll student to biometric devices and push to device
    await this.autoEnrollToBiometricDevices(data.tenantId, student.id, attendanceId, data.fullName, data.deviceIds);

    return this.findById(student.id, data.tenantId);
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

  private async autoEnrollToBiometricDevices(tenantId: string, studentId: string, attendanceId: string, fullName?: string, deviceIds?: string[]) {
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
            studentId,
            deviceUserId: attendanceId,
            memberType: 'student',
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

  async findAll(tenantId: string, options?: {
    branchId?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (options?.branchId) where.branchId = options.branchId;
    if (options?.status) where.status = options.status;
    if (options?.search) {
      where.OR = [
        { fullName: { contains: options.search, mode: 'insensitive' } },
        { studentCode: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [students, total] = await Promise.all([
      this.prisma.student.findMany({
        where,
        skip,
        take: limit,
        include: {
          branch: true,
          parents: {
            include: {
              parent: true,
            },
          },
          biometricEnrollments: {
            where: { status: 'active' },
            select: { deviceId: true },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.student.count({ where }),
    ]);

    return {
      success: true,
      data: {
        students: students.map(s => ({
          student_id: s.id,
          student_code: s.studentCode,
          biometric_id: s.attendanceId,
          full_name: s.fullName,
          phone: s.phone,
          email: s.email,
          grade: s.grade,
          status: s.status,
          branch_name: s.branch.name,
          enrolled_device_ids: s.biometricEnrollments.map(e => e.deviceId),
          parents: s.parents.map(sp => ({
            parent_id: sp.parent.id,
            full_name: sp.parent.fullName,
            phone: sp.parent.phone,
            relationship: sp.relationship,
            is_primary: sp.isPrimary,
            telegram_connected: !!sp.parent.telegramChatId,
            telegram_chat_id: sp.parent.telegramChatId || null,
          })),
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      },
    };
  }

  async findById(id: string, tenantId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
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
      throw new NotFoundException({
        success: false,
        error: 'STUDENT_NOT_FOUND',
        message: 'Student not found',
      });
    }

    return {
      success: true,
      data: {
        student_id: student.id,
        student_code: student.studentCode,
        biometric_id: student.attendanceId,
        full_name: student.fullName,
        phone: student.phone,
        email: student.email,
        date_of_birth: student.dateOfBirth,
        grade: student.grade,
        status: student.status,
        branch: {
          branch_id: student.branch.id,
          name: student.branch.name,
        },
        parents: student.parents.map(sp => ({
          parent_id: sp.parent.id,
          full_name: sp.parent.fullName,
          phone: sp.parent.phone,
          email: sp.parent.email,
          relationship: sp.relationship,
          is_primary: sp.isPrimary,
          telegram_connected: !!sp.parent.telegramChatId,
          telegram_chat_id: sp.parent.telegramChatId || null,
        })),
      },
    };
  }

  async update(id: string, tenantId: string, data: {
    fullName?: string;
    phone?: string;
    email?: string;
    grade?: string;
    status?: string;
    updatedBy?: string;
    deviceIds?: string[];
    parents?: Array<{
      fullName: string;
      phone: string;
      email?: string;
      relationship: string;
      isPrimary: boolean;
      telegramChatId?: string;
    }>;
  }) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
      include: { parents: true },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    await this.prisma.student.update({
      where: { id },
      data: {
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        grade: data.grade,
        status: data.status,
        updatedBy: data.updatedBy,
      },
    });

    // Add or update parents
    if (data.parents && data.parents.length > 0) {
      if (student.parents.length === 0) {
        // Create new parents if student has none
        for (const parentData of data.parents) {
          const parent = await this.prisma.parent.create({
            data: {
              tenantId,
              fullName: parentData.fullName,
              phone: parentData.phone,
              email: parentData.email,
              telegramChatId: parentData.telegramChatId || undefined,
              telegramConnectedAt: parentData.telegramChatId ? new Date() : undefined,
              notificationEnabled: parentData.telegramChatId ? true : undefined,
            },
          });

          await this.prisma.studentParent.create({
            data: {
              studentId: id,
              parentId: parent.id,
              relationship: parentData.relationship,
              isPrimary: parentData.isPrimary,
            },
          });
        }
      } else {
        // Update existing primary parent with new data
        const primaryParentLink = student.parents.find(p => p.isPrimary) || student.parents[0];
        if (primaryParentLink && data.parents[0]) {
          const parentData = data.parents[0];
          const updateData: any = {
            fullName: parentData.fullName,
            phone: parentData.phone,
          };
          if (parentData.email) updateData.email = parentData.email;
          if (parentData.telegramChatId) {
            updateData.telegramChatId = parentData.telegramChatId;
            updateData.telegramConnectedAt = new Date();
            updateData.notificationEnabled = true;
          }
          await this.prisma.parent.update({
            where: { id: primaryParentLink.parentId },
            data: updateData,
          });
        }
      }
    }

    // Enroll on new devices if deviceIds provided
    if (data.deviceIds && data.deviceIds.length > 0 && student.attendanceId) {
      await this.autoEnrollToBiometricDevices(
        tenantId,
        id,
        student.attendanceId,
        data.fullName || student.fullName,
        data.deviceIds,
      );
    }

    return this.findById(id, tenantId);
  }

  async delete(id: string, tenantId: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    // Queue delete commands for all device enrollments before deleting
    const enrollments = await this.prisma.biometricEnrollment.findMany({
      where: { studentId: id },
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

    // Cascade will handle: biometric enrollments, attendance sessions, student-parent links
    await this.prisma.student.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Student deleted successfully',
    };
  }

  async resetPin(id: string, tenantId: string, newPin: string) {
    const student = await this.prisma.student.findFirst({
      where: { id, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const pinHash = await bcrypt.hash(newPin, 12);

    await this.prisma.student.update({
      where: { id },
      data: { pinHash },
    });

    return {
      success: true,
      message: 'PIN reset successfully',
      data: {
        student_id: id,
        student_code: student.studentCode,
      },
    };
  }
}
