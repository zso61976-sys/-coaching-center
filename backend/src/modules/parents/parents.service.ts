import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ParentsService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async findAll(tenantId: string, options?: {
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (options?.search) {
      where.OR = [
        { fullName: { contains: options.search, mode: 'insensitive' } },
        { phone: { contains: options.search } },
      ];
    }

    const [parents, total] = await Promise.all([
      this.prisma.parent.findMany({
        where,
        skip,
        take: limit,
        include: {
          students: {
            include: {
              student: true,
            },
          },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.parent.count({ where }),
    ]);

    return {
      success: true,
      data: {
        parents: parents.map(p => ({
          parent_id: p.id,
          full_name: p.fullName,
          phone: p.phone,
          email: p.email,
          telegram_connected: !!p.telegramChatId,
          telegram_username: p.telegramUsername,
          notification_enabled: p.notificationEnabled,
          students: p.students.map(sp => ({
            student_id: sp.student.id,
            student_code: sp.student.studentCode,
            full_name: sp.student.fullName,
            relationship: sp.relationship,
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
    const parent = await this.prisma.parent.findFirst({
      where: { id, tenantId },
      include: {
        students: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    return {
      success: true,
      data: {
        parent_id: parent.id,
        full_name: parent.fullName,
        phone: parent.phone,
        email: parent.email,
        telegram_connected: !!parent.telegramChatId,
        telegram_username: parent.telegramUsername,
        telegram_connected_at: parent.telegramConnectedAt,
        notification_enabled: parent.notificationEnabled,
        students: parent.students.map(sp => ({
          student_id: sp.student.id,
          student_code: sp.student.studentCode,
          full_name: sp.student.fullName,
          relationship: sp.relationship,
        })),
      },
    };
  }

  async generateTelegramLink(parentId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    const token = uuidv4().replace(/-/g, '');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await this.prisma.parentTelegramToken.create({
      data: {
        parentId,
        token,
        expiresAt,
      },
    });

    const botUsername = this.configService.get<string>('TELEGRAM_BOT_USERNAME') || 'YourAttendanceBot';

    return {
      success: true,
      data: {
        telegram_link: `https://t.me/${botUsername}?start=${token}`,
        token,
        expires_at: expiresAt,
        instructions: 'Share this link with the parent. It expires in 24 hours.',
      },
    };
  }

  async disconnectTelegram(parentId: string, tenantId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        telegramChatId: null,
        telegramUsername: null,
        telegramConnectedAt: null,
      },
    });

    return {
      success: true,
      message: 'Telegram disconnected successfully',
    };
  }

  async toggleNotifications(parentId: string, tenantId: string, enabled: boolean) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    await this.prisma.parent.update({
      where: { id: parentId },
      data: { notificationEnabled: enabled },
    });

    return {
      success: true,
      message: `Notifications ${enabled ? 'enabled' : 'disabled'}`,
    };
  }

  async manualTelegramConnect(parentId: string, tenantId: string, chatId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { id: parentId, tenantId },
      include: {
        students: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent not found');
    }

    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        telegramChatId: chatId,
        telegramConnectedAt: new Date(),
        notificationEnabled: true,
      },
    });

    // Get student names for confirmation
    const studentNames = parent.students.map(sp => sp.student.fullName);

    return {
      success: true,
      message: 'Telegram connected successfully',
      data: {
        chat_id: chatId,
        students: studentNames,
      },
    };
  }
}
