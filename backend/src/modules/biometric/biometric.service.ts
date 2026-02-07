import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { RegisterDeviceDto, UpdateDeviceDto, EnrollStudentDto, PunchDataDto, DeviceHandshakeDto } from './dto';
import { TelegramService } from '../telegram/telegram.service';

@Injectable()
export class BiometricService {
  private readonly logger = new Logger(BiometricService.name);

  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {}

  // ==================== Device Management ====================

  async getDevices(tenantId: string) {
    return this.prisma.biometricDevice.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { enrollments: true, punchLogs: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDeviceById(tenantId: string, deviceId: string) {
    const device = await this.prisma.biometricDevice.findFirst({
      where: { id: deviceId, tenantId },
      include: {
        enrollments: {
          include: { student: true },
        },
        _count: {
          select: { punchLogs: true },
        },
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return device;
  }

  async getDeviceBySerial(serialNumber: string) {
    return this.prisma.biometricDevice.findUnique({
      where: { serialNumber },
      select: { id: true, timezoneOffset: true, status: true },
    });
  }

  async registerDevice(tenantId: string, dto: RegisterDeviceDto) {
    const existingDevice = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber: dto.serialNumber },
    });

    if (existingDevice) {
      throw new ConflictException('Device with this serial number already exists');
    }

    return this.prisma.biometricDevice.create({
      data: {
        tenantId,
        serialNumber: dto.serialNumber,
        name: dto.name,
        model: dto.model,
        location: dto.location,
        ipAddress: dto.ipAddress,
        timezoneOffset: dto.timezoneOffset ?? 4,
        status: 'active',
      },
    });
  }

  async updateDevice(tenantId: string, deviceId: string, dto: UpdateDeviceDto) {
    const device = await this.prisma.biometricDevice.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.biometricDevice.update({
      where: { id: deviceId },
      data: dto,
    });
  }

  async deleteDevice(tenantId: string, deviceId: string) {
    const device = await this.prisma.biometricDevice.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.biometricDevice.delete({
      where: { id: deviceId },
    });
  }

  // ==================== Enrollment Management ====================

  async getEnrollments(tenantId: string, deviceId?: string) {
    return this.prisma.biometricEnrollment.findMany({
      where: {
        device: { tenantId },
        ...(deviceId && { deviceId }),
      },
      include: {
        student: true,
        teacher: true,
        device: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async enrollStudent(tenantId: string, dto: EnrollStudentDto) {
    const device = await this.prisma.biometricDevice.findFirst({
      where: { id: dto.deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    const student = await this.prisma.student.findFirst({
      where: { id: dto.studentId, tenantId },
    });

    if (!student) {
      throw new NotFoundException('Student not found');
    }

    const existingEnrollment = await this.prisma.biometricEnrollment.findFirst({
      where: {
        OR: [
          { deviceId: dto.deviceId, studentId: dto.studentId },
          { deviceId: dto.deviceId, deviceUserId: dto.deviceUserId },
        ],
      },
    });

    if (existingEnrollment) {
      throw new ConflictException('Student or device user ID already enrolled on this device');
    }

    const enrollment = await this.prisma.biometricEnrollment.create({
      data: {
        deviceId: dto.deviceId,
        studentId: dto.studentId,
        deviceUserId: dto.deviceUserId,
        status: 'active',
      },
      include: {
        student: true,
        device: true,
      },
    });

    // Queue SET_USER command to push user to device
    await this.queueSetUserCommand(dto.deviceId, dto.deviceUserId, student.fullName);

    return enrollment;
  }

  async removeEnrollment(tenantId: string, enrollmentId: string) {
    const enrollment = await this.prisma.biometricEnrollment.findFirst({
      where: {
        id: enrollmentId,
        device: { tenantId },
      },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }

    // Queue DELETE_USER command before removing enrollment
    await this.queueDeleteUserCommand(enrollment.deviceId, enrollment.deviceUserId);

    return this.prisma.biometricEnrollment.delete({
      where: { id: enrollmentId },
    });
  }

  // ==================== ADMS Protocol Handlers ====================

  async handleHandshake(serialNumber: string) {
    this.logger.log(`Device handshake: ${serialNumber}`);

    const device = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      this.logger.warn(`Unknown device attempted handshake: ${serialNumber}`);
      return { success: false, message: 'Device not registered' };
    }

    await this.prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date() },
    });

    return { success: true, message: 'OK' };
  }

  async updateDeviceSync(serialNumber: string) {
    try {
      await this.prisma.biometricDevice.updateMany({
        where: { serialNumber },
        data: { lastSyncAt: new Date() },
      });
    } catch (error) {
      // Silently ignore if device not found
    }
  }

  async handlePunch(data: PunchDataDto) {
    this.logger.log(`Punch received: SN=${data.SN}, PIN=${data.PIN}, Time=${data.AttTime}`);

    const device = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber: data.SN },
      include: { tenant: true },
    });

    if (!device) {
      this.logger.warn(`Punch from unknown device: ${data.SN}`);
      return { success: false, message: 'Unknown device' };
    }

    if (device.status !== 'active') {
      this.logger.warn(`Punch from inactive device: ${data.SN}`);
      return { success: false, message: 'Device inactive' };
    }

    const enrollment = await this.prisma.biometricEnrollment.findFirst({
      where: {
        deviceId: device.id,
        deviceUserId: data.PIN,
        status: 'active',
      },
      include: {
        student: {
          include: { branch: true },
        },
      },
    });

    if (!enrollment) {
      this.logger.warn(`Punch from unknown user: PIN=${data.PIN} on device ${data.SN}`);

      await this.prisma.biometricPunchLog.create({
        data: {
          deviceId: device.id,
          deviceUserId: data.PIN,
          punchTime: this.parseAttTime(data.AttTime),
          punchType: 'unknown',
          verifyMethod: this.getVerifyMethod(data.Verify),
          rawData: data as any,
          processed: false,
          errorMessage: 'User not enrolled',
        },
      });

      return { success: false, message: 'User not enrolled' };
    }

    const student = enrollment.student;

    if (!student) {
      this.logger.warn(`Enrollment without student: PIN=${data.PIN}`);
      return { success: false, message: 'Student not found' };
    }

    if (student.status !== 'active') {
      this.logger.warn(`Punch from inactive student: ${student.id}`);

      await this.prisma.biometricPunchLog.create({
        data: {
          deviceId: device.id,
          deviceUserId: data.PIN,
          punchTime: this.parseAttTime(data.AttTime),
          punchType: 'unknown',
          verifyMethod: this.getVerifyMethod(data.Verify),
          rawData: data as any,
          processed: false,
          errorMessage: 'Student inactive',
        },
      });

      return { success: false, message: 'Student inactive' };
    }

    const punchTime = this.parseAttTime(data.AttTime);

    const isDuplicate = await this.checkDuplicatePunch(device.id, data.PIN, punchTime);
    if (isDuplicate) {
      this.logger.log(`Duplicate punch ignored: ${data.PIN} at ${data.AttTime}`);
      return { success: true, message: 'OK (duplicate)' };
    }

    const punchType = await this.determinePunchType(student.id, device.tenantId, punchTime);

    let attendance = null;
    let errorMessage: string | null = null;

    try {
      if (punchType === 'in') {
        attendance = await this.createCheckin(device.tenantId, student, punchTime);
        this.logger.log(`Check-in created for student ${student.id}`);
      } else {
        attendance = await this.processCheckout(device.tenantId, student.id, punchTime);
        this.logger.log(`Check-out processed for student ${student.id}`);
      }
    } catch (error) {
      errorMessage = error.message;
      this.logger.error(`Error processing punch: ${error.message}`);
    }

    await this.prisma.biometricPunchLog.create({
      data: {
        deviceId: device.id,
        deviceUserId: data.PIN,
        punchTime,
        punchType,
        verifyMethod: this.getVerifyMethod(data.Verify),
        rawData: data as any,
        processed: !!attendance,
        errorMessage,
      },
    });

    await this.prisma.biometricDevice.update({
      where: { id: device.id },
      data: { lastSyncAt: new Date() },
    });

    // Send Telegram notifications to parents
    if (attendance) {
      try {
        await this.sendParentNotifications(
          device.tenantId,
          student,
          attendance,
          punchType,
          punchTime,
        );
      } catch (notifError) {
        this.logger.error(`Failed to send parent notifications: ${notifError.message}`);
        // Don't fail the punch if notification fails
      }
    }

    return { success: true, message: 'OK' };
  }

  // Send Telegram notifications to all connected parents of a student
  private async sendParentNotifications(
    tenantId: string,
    student: any,
    attendance: any,
    punchType: string,
    punchTime: Date,
  ) {
    // Get all parents connected to this student with Telegram enabled
    const studentParents = await this.prisma.studentParent.findMany({
      where: {
        studentId: student.id,
        parent: {
          telegramChatId: { not: null },
          notificationEnabled: true,
        },
      },
      include: {
        parent: true,
      },
    });

    if (studentParents.length === 0) {
      this.logger.log(`No connected parents for student ${student.id}`);
      return;
    }

    const branchName = student.branch?.name || 'Main Branch';

    for (const sp of studentParents) {
      const parent = sp.parent;

      if (!parent.telegramChatId) continue;

      try {
        if (punchType === 'in') {
          await this.telegramService.queueCheckinNotification({
            tenantId,
            studentId: student.id,
            parentId: parent.id,
            attendanceId: attendance.id,
            studentName: student.fullName,
            studentCode: student.studentCode,
            branchName,
            checkinTime: punchTime,
            telegramChatId: parent.telegramChatId,
          });
          this.logger.log(`Check-in notification queued for parent ${parent.id}`);
        } else {
          // For checkout, calculate duration
          const checkinTime = attendance.checkInTime || punchTime;
          const durationMs = punchTime.getTime() - new Date(checkinTime).getTime();
          const durationMinutes = Math.round(durationMs / 60000);

          await this.telegramService.queueCheckoutNotification({
            tenantId,
            studentId: student.id,
            parentId: parent.id,
            attendanceId: attendance.id,
            studentName: student.fullName,
            studentCode: student.studentCode,
            branchName,
            checkinTime: new Date(checkinTime),
            checkoutTime: punchTime,
            durationMinutes,
            telegramChatId: parent.telegramChatId,
          });
          this.logger.log(`Check-out notification queued for parent ${parent.id}`);
        }
      } catch (err) {
        this.logger.error(`Failed to queue notification for parent ${parent.id}: ${err.message}`);
      }
    }
  }

  // ==================== Helper Methods ====================

  private parseAttTime(attTime: string): Date {
    const parsed = new Date(attTime.replace(' ', 'T'));
    if (isNaN(parsed.getTime())) {
      return new Date();
    }
    return parsed;
  }

  private getVerifyMethod(verify?: string): string {
    const methods: Record<string, string> = {
      '0': 'password',
      '1': 'fingerprint',
      '2': 'card',
      '3': 'fingerprint_password',
      '4': 'fingerprint_card',
      '15': 'face',
    };
    return methods[verify || '1'] || 'fingerprint';
  }

  private async checkDuplicatePunch(deviceId: string, deviceUserId: string, punchTime: Date): Promise<boolean> {
    const oneMinuteAgo = new Date(punchTime.getTime() - 60 * 1000);
    const oneMinuteAfter = new Date(punchTime.getTime() + 60 * 1000);

    const existingPunch = await this.prisma.biometricPunchLog.findFirst({
      where: {
        deviceId,
        deviceUserId,
        punchTime: {
          gte: oneMinuteAgo,
          lte: oneMinuteAfter,
        },
      },
    });

    return !!existingPunch;
  }

  private async determinePunchType(studentId: string, tenantId: string, punchTime?: Date): Promise<'in' | 'out'> {
    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId,
        tenantId,
        status: 'checked_in',
        checkoutTime: null,
      },
      orderBy: { checkinTime: 'desc' },
    });

    if (!openSession) {
      return 'in';
    }

    // If the punch is on a different date than the check-in, treat as new check-in
    const now = punchTime || new Date();
    const checkinDate = new Date(openSession.checkinTime);
    const punchDateStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const checkinDateStr = `${checkinDate.getFullYear()}-${checkinDate.getMonth()}-${checkinDate.getDate()}`;

    if (punchDateStr !== checkinDateStr) {
      // Different day — auto-close old session and treat this as a new check-in
      return 'in';
    }

    return 'out';
  }

  private async createCheckin(tenantId: string, student: any, checkinTime: Date) {
    const existingOpenSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId: student.id,
        tenantId,
        status: 'checked_in',
        checkoutTime: null,
      },
    });

    if (existingOpenSession) {
      await this.prisma.attendanceSession.update({
        where: { id: existingOpenSession.id },
        data: {
          checkoutTime: new Date(checkinTime.getTime() - 1000),
          checkoutMethod: 'auto_close',
          status: 'checked_out',
        },
      });
    }

    return this.prisma.attendanceSession.create({
      data: {
        tenantId,
        branchId: student.branchId,
        studentId: student.id,
        checkinTime,
        status: 'checked_in',
        notes: 'Biometric check-in',
      },
    });
  }

  private async processCheckout(tenantId: string, studentId: string, checkoutTime: Date) {
    const openSession = await this.prisma.attendanceSession.findFirst({
      where: {
        studentId,
        tenantId,
        status: 'checked_in',
        checkoutTime: null,
      },
      orderBy: { checkinTime: 'desc' },
    });

    if (!openSession) {
      throw new BadRequestException('No open session to checkout');
    }

    return this.prisma.attendanceSession.update({
      where: { id: openSession.id },
      data: {
        checkoutTime,
        checkoutMethod: 'biometric',
        status: 'checked_out',
      },
    });
  }

  // ==================== Punch Log Queries ====================

  async getPunchLogs(tenantId: string, options: {
    deviceId?: string;
    startDate?: Date;
    endDate?: Date;
    processed?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: any = {
      device: { tenantId },
    };

    if (options.deviceId) {
      where.deviceId = options.deviceId;
    }

    if (options.startDate || options.endDate) {
      where.punchTime = {};
      if (options.startDate) {
        where.punchTime.gte = options.startDate;
      }
      if (options.endDate) {
        where.punchTime.lte = options.endDate;
      }
    }

    if (options.processed !== undefined) {
      where.processed = options.processed;
    }

    const [logs, total] = await Promise.all([
      this.prisma.biometricPunchLog.findMany({
        where,
        include: {
          device: true,
          attendance: {
            include: { student: true },
          },
        },
        orderBy: { punchTime: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      this.prisma.biometricPunchLog.count({ where }),
    ]);

    // Enrich logs with student/teacher info from enrollments
    const enrichedLogs = await Promise.all(
      logs.map(async (log) => {
        // If no attendance student, try to get from enrollment
        if (!log.attendance?.student) {
          const enrollment = await this.prisma.biometricEnrollment.findFirst({
            where: {
              deviceId: log.deviceId,
              deviceUserId: log.deviceUserId,
            },
            include: {
              student: true,
              teacher: true,
            },
          });
          return {
            ...log,
            enrollment,
          };
        }
        return log;
      })
    );

    // Filter by student/teacher name if search provided
    let filteredLogs = enrichedLogs;
    if (options.search) {
      const searchLower = options.search.toLowerCase();
      filteredLogs = enrichedLogs.filter((log: any) => {
        const studentName = log.attendance?.student?.fullName || log.enrollment?.student?.fullName || '';
        const teacherName = log.enrollment?.teacher?.fullName || '';
        const deviceUserId = log.deviceUserId || '';
        return studentName.toLowerCase().includes(searchLower) ||
               teacherName.toLowerCase().includes(searchLower) ||
               deviceUserId.toLowerCase().includes(searchLower);
      });
    }

    return { logs: filteredLogs, total: options.search ? filteredLogs.length : total };
  }

  async getDeviceSyncStatus(tenantId: string) {
    const devices = await this.prisma.biometricDevice.findMany({
      where: { tenantId },
      select: {
        id: true,
        serialNumber: true,
        name: true,
        status: true,
        lastSyncAt: true,
        _count: {
          select: {
            enrollments: true,
            punchLogs: { where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
          },
        },
      },
    });

    return devices.map(device => ({
      ...device,
      isOnline: device.lastSyncAt && (new Date().getTime() - device.lastSyncAt.getTime()) < 5 * 60 * 1000,
      enrollmentCount: device._count.enrollments,
      punchesToday: device._count.punchLogs,
    }));
  }

  // ==================== Attendance Report ====================

  async getAttendanceReport(tenantId: string, options: {
    date?: string;
    startDate?: string;
    endDate?: string;
    studentId?: string;
    branchId?: string;
    search?: string;
  } = {}) {
    const where: any = { tenantId };

    // Support both single date and date range
    if (options.startDate && options.endDate) {
      const startOfDay = new Date(options.startDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(options.endDate);
      endOfDay.setHours(23, 59, 59, 999);
      where.checkinTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (options.date) {
      const startOfDay = new Date(options.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(options.date);
      endOfDay.setHours(23, 59, 59, 999);
      where.checkinTime = {
        gte: startOfDay,
        lte: endOfDay,
      };
    }

    if (options.studentId) {
      where.studentId = options.studentId;
    }

    if (options.branchId) {
      where.branchId = options.branchId;
    }

    if (options.search) {
      where.student = {
        OR: [
          { fullName: { contains: options.search, mode: 'insensitive' } },
          { studentCode: { contains: options.search, mode: 'insensitive' } },
        ],
      };
    }

    const sessions = await this.prisma.attendanceSession.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            studentCode: true,
            fullName: true,
            grade: true,
          },
        },
      },
      orderBy: { checkinTime: 'desc' },
    });

    return sessions.map(session => ({
      id: session.id,
      studentId: session.studentId,
      checkinTime: session.checkinTime,
      checkoutTime: session.checkoutTime,
      status: this.determineAttendanceStatus(session.checkinTime),
      student: session.student,
    }));
  }

  private determineAttendanceStatus(checkinTime: Date): string {
    const checkinHour = checkinTime.getHours();
    const checkinMinute = checkinTime.getMinutes();

    // Consider late if after 9:30 AM (configurable later)
    if (checkinHour > 9 || (checkinHour === 9 && checkinMinute > 30)) {
      return 'late';
    }
    return 'present';
  }

  // ==================== Device Command Queuing ====================

  async queueSetUserCommand(deviceId: string, pin: string, name: string) {
    const commandData = `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000100000000`;

    return this.prisma.deviceCommand.create({
      data: {
        deviceId,
        commandType: 'set_user',
        commandData,
        status: 'pending',
      },
    });
  }

  async queueDeleteUserCommand(deviceId: string, pin: string) {
    const commandData = `DATA DELETE USERINFO PIN=${pin}`;

    return this.prisma.deviceCommand.create({
      data: {
        deviceId,
        commandType: 'delete_user',
        commandData,
        status: 'pending',
      },
    });
  }

  async getPendingCommands(serialNumber: string) {
    const device = await this.prisma.biometricDevice.findUnique({
      where: { serialNumber },
    });

    if (!device) {
      return [];
    }

    return this.prisma.deviceCommand.findMany({
      where: {
        deviceId: device.id,
        status: 'pending',
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markCommandSent(commandId: string) {
    return this.prisma.deviceCommand.update({
      where: { id: commandId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  async markCommandExecuted(commandId: string, returnValue: string) {
    const status = returnValue === '0' ? 'executed' : 'failed';

    return this.prisma.deviceCommand.update({
      where: { id: commandId },
      data: {
        status,
        executedAt: new Date(),
        returnValue,
      },
    });
  }

  // Queue a SET TIME command to sync device clock
  async queueSyncTimeCommand(deviceId: string) {
    // Queue a REBOOT command to force device to reconnect and do a new handshake.
    // The handshake response includes ServerTime which the device uses to sync its clock.
    // This is more reliable than SET OPTIONS which some devices ignore.
    const commandData = `REBOOT`;

    this.logger.log(`Queuing REBOOT command for device ${deviceId} to force time sync via handshake`);

    return this.prisma.deviceCommand.create({
      data: {
        deviceId,
        commandType: 'sync_time',
        commandData,
        status: 'pending',
      },
    });
  }

  // Sync time to all active devices for a tenant
  async syncTimeAllDevices(tenantId: string) {
    const devices = await this.prisma.biometricDevice.findMany({
      where: { tenantId, status: 'active' },
    });

    const results = [];
    for (const device of devices) {
      const command = await this.queueSyncTimeCommand(device.id);
      results.push({ deviceId: device.id, deviceName: device.name, commandId: command.id });
    }

    return results;
  }

  // Sync all enrollments: re-push all enrolled users to their devices
  async syncAllEnrollments(tenantId: string) {
    const enrollments = await this.prisma.biometricEnrollment.findMany({
      where: {
        status: 'active',
        device: { tenantId, status: 'active' },
      },
      include: {
        student: true,
        teacher: true,
        device: true,
      },
    });

    const results = [];
    for (const enrollment of enrollments) {
      const name = enrollment.student?.fullName || enrollment.teacher?.fullName || 'Unknown';
      const command = await this.queueSetUserCommand(enrollment.deviceId, enrollment.deviceUserId, name);
      results.push({
        deviceName: enrollment.device.name,
        deviceUserId: enrollment.deviceUserId,
        memberName: name,
        commandId: command.id,
      });
    }

    return results;
  }

  async getCommandHistory(tenantId: string, deviceId: string) {
    const device = await this.prisma.biometricDevice.findFirst({
      where: { id: deviceId, tenantId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.deviceCommand.findMany({
      where: { deviceId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
