import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { normalizePhone, pick, WhatsappService } from './whatsapp.service';

// Broadcasts go out slowly so the numbers do not look like spam to WhatsApp:
// one message about every 2 minutes (150 parents ≈ 5 hours), starting as soon
// as the broadcast is saved or at the time it was scheduled for
const GAP_MS = 2 * 60 * 1000;
const JITTER = 0.3;
// How far ahead a broadcast can be scheduled
const MAX_SCHEDULE_DAYS = 30;

// Every parent gets the same notice with slightly different wording around it,
// so WhatsApp does not see hundreds of identical messages
const GREETINGS = [
  'Assalam o Alaikum {parent_name},',
  'Dear {parent_name},',
  'Respected {parent_name},',
  'Hello {parent_name},',
  'Assalam o Alaikum dear {parent_name},',
];
const INTROS = [
  'This message is about {student_name}.',
  'An update regarding {student_name}:',
  'Important information for {student_name}:',
  'Please note the following for {student_name}:',
  'We would like to inform you about {student_name}:',
];
const ICONS = ['📢', '📌', '🔔', '📣', '📝'];
const CLOSINGS = [
  'Thank you.',
  'Thank you for your cooperation.',
  'Regards.',
  'Thanks for your support.',
  'Best regards.',
];

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

/** The start time of a broadcast: now, or the scheduled time if one was chosen */
function resolveStart(startAt?: string | null) {
  if (!startAt) return new Date();
  const start = new Date(startAt);
  if (isNaN(start.getTime())) throw new BadRequestException('Invalid schedule time');
  // A minute of slack for the time it takes to fill in the form
  if (start.getTime() < Date.now() - 60 * 1000) throw new BadRequestException('The schedule time is in the past');
  if (start.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000) {
    throw new BadRequestException(`A broadcast can be scheduled at most ${MAX_SCHEDULE_DAYS} days ahead`);
  }
  return start < new Date() ? new Date() : start;
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

  /**
   * The notice with the parent's and children's names and a randomly chosen greeting,
   * intro and closing. If the notice already uses {parent_name} / {student_name},
   * the greeting / intro that would repeat the name is left out.
   */
  private personalize(template: string, recipient: Recipient, companyName: string) {
    const parentName =
      recipient.parent.fullName && !recipient.parent.fullName.startsWith('Parent of')
        ? recipient.parent.fullName
        : 'Parent';
    const names = recipient.students.map((s) => s.fullName);
    const studentNames =
      (names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}` : names[0]) || '';
    const fill = (text: string) =>
      text.replace(/\{parent_name\}/gi, parentName).replace(/\{student_name\}/gi, studentNames);

    const parts: string[] = [];
    if (!/\{parent_name\}/i.test(template)) parts.push(fill(pick(GREETINGS)), '');
    const body = fill(template.trim());
    parts.push(/\{student_name\}/i.test(template) ? body : `${pick(ICONS)} ${fill(pick(INTROS))}\n${body}`);
    parts.push('', pick(CLOSINGS));
    if (companyName) parts.push(`— ${companyName}`);
    return parts.join('\n');
  }

  private schedule(count: number, start: Date) {
    const gap = GAP_MS;
    // Each message gets its own slot, moved a little at random so the gaps look natural;
    // the randomness does not add up, so the broadcast still ends on time
    const times: Date[] = [];
    for (let i = 0; i < count; i++) {
      const jitter = i > 0 ? (Math.random() * 2 - 1) * JITTER * gap : 0;
      times.push(new Date(start.getTime() + i * gap + jitter));
    }
    return { gapSeconds: Math.round(gap / 1000), times };
  }

  async preview(tenantId: string, classes: string[], onlyWelcomed: boolean, message?: string, startAt?: string) {
    const { settings, recipients, notWelcomed } = await this.buildRecipients(tenantId, classes, onlyWelcomed);
    const { gapSeconds, times } = this.schedule(recipients.length, resolveStart(startAt));
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return {
      recipients: recipients.length,
      notWelcomed: onlyWelcomed ? notWelcomed : 0,
      gapSeconds,
      firstSendAt: times[0] || null,
      lastSendAt: times[times.length - 1] || null,
      timeZone: settings.timeZone,
      // A few examples, to show how the wording changes from parent to parent
      samples: message?.trim()
        ? Array.from({ length: Math.min(3, recipients.length) }, (_, i) =>
            this.personalize(message, recipients[i], tenant?.name || ''),
          )
        : [],
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

  async create(
    tenantId: string,
    userId: string | null,
    data: { message: string; classes: string[]; onlyWelcomed: boolean; startAt?: string },
  ) {
    const message = data.message.trim();
    if (!message) throw new BadRequestException('Write a message first');
    const start = resolveStart(data.startAt);

    const { settings, recipients } = await this.buildRecipients(tenantId, data.classes, data.onlyWelcomed);
    if (!settings.enabled) throw new BadRequestException('Turn on WhatsApp notifications first');
    if (recipients.length === 0) throw new BadRequestException('No parents to send to in the selected classes');

    // Two broadcasts at once would double the sending speed
    await this.refreshStatuses(tenantId);
    const running = await this.prisma.whatsappBroadcast.count({ where: { tenantId, status: 'running' } });
    if (running > 0) {
      throw new BadRequestException('A broadcast is still sending or scheduled. Wait for it to finish or stop it first.');
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const { times } = this.schedule(recipients.length, start);

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
          scheduledAt: times[i],
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
