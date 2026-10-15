import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { normalizePhone, WhatsappService } from './whatsapp.service';

// Broadcasts go out slowly so the numbers do not look like spam to WhatsApp:
// spread over 12 sending hours (150 parents ≈ one message every ~5 minutes),
// only between 9 AM and 9 PM in the company's time zone.
const SEND_START_HOUR = 9;
const SEND_END_HOUR = 21;
const SPREAD_MS = 12 * 60 * 60 * 1000;
const MIN_GAP_MS = 20 * 1000;
const MAX_GAP_MS = 5 * 60 * 1000;
const JITTER = 0.3;

// Attendance messages (no priority) always go before broadcast messages
const BROADCAST_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60000 },
  removeOnComplete: true,
  priority: 10,
};

const NO_CLASS = '';

interface Recipient {
  phone: string;
  parent: { id: string; fullName: string; whatsappAccountId: string | null };
  students: { id: string; fullName: string }[];
}

// ---------------------------------------------------------------------------
// Time zone helpers
// ---------------------------------------------------------------------------

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** The instant of the given local wall-clock time in a time zone (day may overflow) */
function zonedDate(year: number, month: number, day: number, hour: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour);
  const p = zonedParts(new Date(guess), timeZone);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
  return new Date(guess - offset);
}

/** The same instant if it is within sending hours, otherwise the start of the next sending window */
function nextSendable(date: Date, timeZone: string) {
  const p = zonedParts(date, timeZone);
  if (p.hour < SEND_START_HOUR) return zonedDate(p.year, p.month, p.day, SEND_START_HOUR, timeZone);
  if (p.hour >= SEND_END_HOUR) return zonedDate(p.year, p.month, p.day + 1, SEND_START_HOUR, timeZone);
  return date;
}

/** Moves forward by `ms` of sending time, skipping the nights */
function addSendingTime(date: Date, ms: number, timeZone: string) {
  let cursor = nextSendable(date, timeZone);
  let left = ms;
  for (;;) {
    const p = zonedParts(cursor, timeZone);
    const windowEnd = zonedDate(p.year, p.month, p.day, SEND_END_HOUR, timeZone);
    const room = windowEnd.getTime() - cursor.getTime();
    if (left <= room) return new Date(cursor.getTime() + left);
    left -= room;
    cursor = nextSendable(windowEnd, timeZone);
  }
}

/** Gap between two messages: the broadcast fills 12 sending hours, within safe limits */
function gapFor(count: number) {
  return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, SPREAD_MS / Math.max(count, 1)));
}

@Injectable()
export class WhatsappBroadcastService {
  private readonly logger = new Logger(WhatsappBroadcastService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
    @InjectQueue('whatsapp') private whatsappQueue: Queue,
  ) {}

  private async activeStudents(tenantId: string) {
    return this.prisma.student.findMany({
      where: { tenantId, status: 'active' },
      select: {
        id: true,
        fullName: true,
        grade: true,
        parents: { select: { parent: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  /** Classes of the active students, with how many parent numbers each has */
  async getClasses(tenantId: string) {
    const settings = await this.whatsappService.getSettings(tenantId);
    const students = await this.activeStudents(tenantId);
    const classes = new Map<string, { students: number; phones: Set<string> }>();

    for (const student of students) {
      const name = (student.grade || '').trim();
      const entry = classes.get(name) || { students: 0, phones: new Set<string>() };
      entry.students += 1;
      for (const { parent } of student.parents) {
        const phone = parent.notificationEnabled ? normalizePhone(parent.phone, settings.countryCode) : null;
        if (phone) entry.phones.add(phone);
      }
      classes.set(name, entry);
    }

    return Array.from(classes.entries())
      .map(([name, entry]) => ({ name, students: entry.students, parents: entry.phones.size }))
      .sort((a, b) =>
        a.name === NO_CLASS ? 1 : b.name === NO_CLASS ? -1 : a.name.localeCompare(b.name, undefined, { numeric: true }),
      );
  }

  /** One recipient per phone number: siblings' parents sharing a number get one message */
  private async buildRecipients(tenantId: string, classes: string[], onlyWelcomed: boolean) {
    const settings = await this.whatsappService.getSettings(tenantId);
    const wanted = new Set(classes.map((c) => c.trim()));
    const students = (await this.activeStudents(tenantId)).filter((s) => wanted.has((s.grade || '').trim()));

    const byPhone = new Map<string, Recipient & { welcomed: boolean }>();
    for (const student of students) {
      for (const { parent } of student.parents) {
        if (!parent.notificationEnabled) continue;
        const phone = normalizePhone(parent.phone, settings.countryCode);
        if (!phone) continue;
        const entry = byPhone.get(phone) || { phone, parent, students: [], welcomed: false };
        if (!entry.students.some((s) => s.id === student.id)) {
          entry.students.push({ id: student.id, fullName: student.fullName });
        }
        if (parent.whatsappWelcomedPhone === phone) entry.welcomed = true;
        byPhone.set(phone, entry);
      }
    }

    const all = Array.from(byPhone.values());
    const recipients = onlyWelcomed ? all.filter((r) => r.welcomed) : all;
    return { settings, recipients, notWelcomed: all.length - all.filter((r) => r.welcomed).length };
  }

  private personalize(template: string, recipient: Recipient, companyName: string) {
    const parentName =
      recipient.parent.fullName && !recipient.parent.fullName.startsWith('Parent of')
        ? recipient.parent.fullName
        : 'Parent';
    const names = recipient.students.map((s) => s.fullName);
    const studentNames = names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0];
    const text = template
      .replace(/\{parent_name\}/gi, parentName)
      .replace(/\{student_name\}/gi, studentNames || '');
    return companyName ? `${text}\n\n— ${companyName}` : text;
  }

  private schedule(count: number, timeZone: string) {
    const gap = gapFor(count);
    const start = nextSendable(new Date(), timeZone);
    // Each message gets its own slot, moved a little at random so the gaps look natural;
    // the randomness does not add up, so the broadcast still ends inside its 12 hours
    const times: Date[] = [];
    for (let i = 0; i < count; i++) {
      const jitter = i > 0 ? (Math.random() * 2 - 1) * JITTER * gap : 0;
      times.push(addSendingTime(start, i * gap + jitter, timeZone));
    }
    return { gapSeconds: Math.round(gap / 1000), times };
  }

  async preview(tenantId: string, classes: string[], onlyWelcomed: boolean, message?: string) {
    const { settings, recipients, notWelcomed } = await this.buildRecipients(tenantId, classes, onlyWelcomed);
    const { gapSeconds, times } = this.schedule(recipients.length, settings.timeZone);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return {
      recipients: recipients.length,
      notWelcomed: onlyWelcomed ? notWelcomed : 0,
      gapSeconds,
      firstSendAt: times[0] || null,
      lastSendAt: times[times.length - 1] || null,
      timeZone: settings.timeZone,
      sample: message && recipients[0] ? this.personalize(message, recipients[0], tenant?.name || '') : null,
    };
  }

  /** Mark broadcasts whose messages have all gone out as completed */
  private async refreshStatuses(tenantId: string) {
    const running = await this.prisma.whatsappBroadcast.findMany({
      where: { tenantId, status: 'running' },
      select: { id: true },
    });
    for (const { id } of running) {
      const pending = await this.prisma.whatsappMessageLog.count({
        where: { broadcastId: id, status: { in: ['queued', 'retry'] } },
      });
      if (pending === 0) {
        await this.prisma.whatsappBroadcast.update({ where: { id }, data: { status: 'completed' } });
      }
    }
  }

  async create(tenantId: string, userId: string | null, data: { message: string; classes: string[]; onlyWelcomed: boolean }) {
    const message = data.message.trim();
    if (!message) throw new BadRequestException('Write a message first');

    const { settings, recipients } = await this.buildRecipients(tenantId, data.classes, data.onlyWelcomed);
    if (!settings.enabled) throw new BadRequestException('Turn on WhatsApp notifications first');
    if (recipients.length === 0) throw new BadRequestException('No parents to send to in the selected classes');

    // Two broadcasts at once would double the sending speed
    await this.refreshStatuses(tenantId);
    const running = await this.prisma.whatsappBroadcast.count({ where: { tenantId, status: 'running' } });
    if (running > 0) {
      throw new BadRequestException('A broadcast is still sending. Wait for it to finish or stop it first.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const { times } = this.schedule(recipients.length, settings.timeZone);

    const broadcast = await this.prisma.whatsappBroadcast.create({
      data: {
        tenantId,
        message,
        classes: data.classes,
        onlyWelcomed: data.onlyWelcomed,
        total: recipients.length,
        firstSendAt: times[0],
        lastSendAt: times[times.length - 1],
        createdBy: userId,
      },
    });

    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const accountId = await this.whatsappService.assignAccount(tenantId, recipient.parent);
      const text = this.personalize(message, recipient, tenant?.name || '');
      const log = await this.prisma.whatsappMessageLog.create({
        data: {
          tenantId,
          accountId,
          broadcastId: broadcast.id,
          studentId: recipient.students[0]?.id,
          parentId: recipient.parent.id,
          studentName: recipient.students.map((s) => s.fullName).join(', ').slice(0, 255),
          parentName: recipient.parent.fullName,
          phone: recipient.phone,
          messageType: 'broadcast',
          messageText: text,
          status: 'queued',
        },
      });
      await this.whatsappQueue.add(
        'send-message',
        { logId: log.id, tenantId, accountId, phone: recipient.phone, text },
        { ...BROADCAST_JOB_OPTIONS, jobId: `bc-${log.id}`, delay: Math.max(0, times[i].getTime() - Date.now()) },
      );
    }

    this.logger.log(`Broadcast ${broadcast.id}: ${recipients.length} message(s) scheduled for tenant ${tenantId}`);
    return broadcast;
  }

  async list(tenantId: string) {
    await this.refreshStatuses(tenantId);
    const broadcasts = await this.prisma.whatsappBroadcast.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    const counts = await this.prisma.whatsappMessageLog.groupBy({
      by: ['broadcastId', 'status'],
      where: { broadcastId: { in: broadcasts.map((b) => b.id) } },
      _count: { _all: true },
    });
    const count = (id: string, statuses: string[]) =>
      counts
        .filter((c) => c.broadcastId === id && statuses.includes(c.status))
        .reduce((sum, c) => sum + c._count._all, 0);

    return broadcasts.map((b) => ({
      ...b,
      sent: count(b.id, ['sent']),
      failed: count(b.id, ['failed']),
      pending: count(b.id, ['queued', 'retry']),
      cancelled: count(b.id, ['cancelled']),
    }));
  }

  /** Stop a broadcast: messages not sent yet are dropped */
  async cancel(tenantId: string, id: string) {
    const broadcast = await this.prisma.whatsappBroadcast.findFirst({ where: { id, tenantId } });
    if (!broadcast) throw new NotFoundException('Broadcast not found');
    if (broadcast.status !== 'running') return { success: true, cancelled: 0 };

    await this.prisma.whatsappBroadcast.update({
      where: { id },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    const pending = await this.prisma.whatsappMessageLog.findMany({
      where: { broadcastId: id, status: { in: ['queued', 'retry'] } },
      select: { id: true },
    });
    // The processor also skips cancelled logs, in case a job is already running
    await this.prisma.whatsappMessageLog.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: 'cancelled', errorText: 'Broadcast stopped' },
    });
    for (const { id: logId } of pending) {
      try {
        await (await this.whatsappQueue.getJob(`bc-${logId}`))?.remove();
      } catch {
        // Job is being processed right now; the processor will skip it
      }
    }
    return { success: true, cancelled: pending.length };
  }
}
