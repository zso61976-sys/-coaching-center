import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/** Classes a new company starts with, until it saves its own list */
const DEFAULT_CLASSES = ['9th', '10th', '11th', '12th'];
const MAX_CLASS_LENGTH = 20; // class_schedules.class_grade is VARCHAR(20)

const sameClass = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const byClassName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

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

  /**
   * The company's classes, with how many active students, teachers and schedules use each.
   * A class that students already have stays on the list even if it was never added.
   */
  async getClasses(tenantId: string) {
    const [tenant, studentGroups, teachers, schedules] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
      this.prisma.student.groupBy({
        by: ['grade'],
        where: { tenantId, status: 'active' },
        _count: { _all: true },
      }),
      this.prisma.teacher.findMany({ where: { tenantId, status: 'active' }, select: { classes: true } }),
      this.prisma.classSchedule.findMany({ where: { tenantId, status: 'active' }, select: { classGrade: true } }),
    ]);

    const saved = ((tenant?.settings as any) || {}).classes;
    const classes: string[] = Array.isArray(saved) ? [...saved] : [...DEFAULT_CLASSES];
    const usage: Record<string, { students: number; teachers: number; schedules: number }> = {};
    const use = (raw: string | null | undefined, field: 'students' | 'teachers' | 'schedules', n = 1) => {
      const name = (raw || '').trim();
      if (!name) return;
      let key = classes.find((c) => sameClass(c, name));
      if (!key) {
        classes.push(name);
        key = name;
      }
      usage[key] = usage[key] || { students: 0, teachers: 0, schedules: 0 };
      usage[key][field] += n;
    };

    for (const g of studentGroups) use(g.grade, 'students', g._count._all);
    for (const t of teachers) for (const c of t.classes) use(c, 'teachers');
    for (const s of schedules) use(s.classGrade, 'schedules');

    return {
      classes: classes.sort(byClassName),
      usage: Object.fromEntries(classes.map((c) => [c, usage[c] || { students: 0, teachers: 0, schedules: 0 }])),
    };
  }

  /** Save the company's class list. A class still in use can't be removed. */
  async updateClasses(tenantId: string, input: string[]) {
    const classes: string[] = [];
    for (const raw of input) {
      const name = raw.trim().replace(/\s+/g, ' ');
      if (!name) continue;
      if (name.length > MAX_CLASS_LENGTH) {
        throw new BadRequestException(`"${name}" is too long (${MAX_CLASS_LENGTH} characters at most)`);
      }
      if (classes.some((c) => sameClass(c, name))) {
        throw new BadRequestException(`"${name}" is on the list twice`);
      }
      classes.push(name);
    }

    const current = await this.getClasses(tenantId);
    const stillUsed = current.classes
      .filter((c) => !classes.some((n) => sameClass(n, c)))
      .map((c) => ({ name: c, ...current.usage[c] }))
      .filter((c) => c.students || c.teachers || c.schedules);
    if (stillUsed.length) {
      const describe = (c: (typeof stillUsed)[number]) =>
        [
          c.students && `${c.students} student${c.students === 1 ? '' : 's'}`,
          c.teachers && `${c.teachers} teacher${c.teachers === 1 ? '' : 's'}`,
          c.schedules && `${c.schedules} schedule${c.schedules === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(', ');
      throw new BadRequestException(
        `Can't remove ${stillUsed.map((c) => `${c.name} (${describe(c)})`).join('; ')}. Move them to another class first.`,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...((tenant?.settings as any) || {}), classes: classes.sort(byClassName) } },
    });
    return this.getClasses(tenantId);
  }
}
