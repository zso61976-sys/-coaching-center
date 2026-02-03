import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalStudents,
      activeStudents,
      totalParents,
      connectedParents,
      todayCheckins,
      currentlyCheckedIn,
    ] = await Promise.all([
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.student.count({ where: { tenantId, status: 'active' } }),
      this.prisma.parent.count({ where: { tenantId } }),
      this.prisma.parent.count({ where: { tenantId, telegramChatId: { not: null } } }),
      this.prisma.attendanceSession.count({
        where: {
          tenantId,
          checkinTime: { gte: today },
        },
      }),
      this.prisma.attendanceSession.count({
        where: {
          tenantId,
          checkoutTime: null,
        },
      }),
    ]);

    return {
      success: true,
      data: {
        students: {
          total: totalStudents,
          active: activeStudents,
        },
        parents: {
          total: totalParents,
          telegram_connected: connectedParents,
        },
        attendance: {
          today_checkins: todayCheckins,
          currently_checked_in: currentlyCheckedIn,
        },
      },
    };
  }

  async getBranches(tenantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, status: 'active' },
      orderBy: { name: 'asc' },
    });

    return {
      success: true,
      data: branches.map(b => ({
        branch_id: b.id,
        name: b.name,
        address: b.address,
        phone: b.phone,
        timezone: b.timezone,
      })),
    };
  }

  async getAuditLogs(tenantId: string, options: {
    entityType?: string;
    action?: string;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  }) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };

    if (options.entityType) where.entityType = options.entityType;
    if (options.action) where.action = { contains: options.action };
    if (options.from) where.createdAt = { gte: options.from };
    if (options.to) where.createdAt = { ...where.createdAt, lte: options.to };

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      success: true,
      data: {
        logs: logs.map(l => ({
          audit_id: l.id,
          actor_type: l.actorType,
          actor_user_id: l.actorUserId,
          action: l.action,
          entity_type: l.entityType,
          entity_id: l.entityId,
          before_data: l.beforeData,
          after_data: l.afterData,
          ip_address: l.ipAddress,
          created_at: l.createdAt,
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

  async getTelegramStats(tenantId: string) {
    const [total, sent, failed, queued] = await Promise.all([
      this.prisma.telegramMessageLog.count({ where: { tenantId } }),
      this.prisma.telegramMessageLog.count({ where: { tenantId, status: 'sent' } }),
      this.prisma.telegramMessageLog.count({ where: { tenantId, status: 'failed' } }),
      this.prisma.telegramMessageLog.count({ where: { tenantId, status: 'queued' } }),
    ]);

    const successRate = total > 0 ? Math.round((sent / total) * 100) : 0;

    return {
      success: true,
      data: {
        total_messages: total,
        sent: sent,
        failed: failed,
        queued: queued,
        success_rate: successRate,
      },
    };
  }
}
