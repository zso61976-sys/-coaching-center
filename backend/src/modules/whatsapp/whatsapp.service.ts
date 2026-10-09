import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as QRCode from 'qrcode';
import pino from 'pino';
import { PrismaService } from '../../common/prisma.service';
import { clearDbAuthState, useDbAuthState } from './whatsapp-auth-state';

type ConnectionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

interface Session {
  status: ConnectionStatus;
  qr: string | null;
  phone: string | null;
  sock: any;
  stopped: boolean;
  reconnectAttempts: number;
}

export interface WhatsappSettings {
  enabled: boolean;
  countryCode: string;
  timeZone: string;
}

const DEFAULT_SETTINGS: WhatsappSettings = {
  enabled: false,
  countryCode: '971',
  timeZone: 'Asia/Dubai',
};

/** Small in-memory TTL cache matching Baileys' CacheStore interface */
class MemoryCache {
  private store = new Map<string, { value: any; expires: number }>();

  constructor(private ttlMs: number, private maxEntries = 5000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set<T>(key: string, value: T) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs });
  }

  del(key: string) {
    this.store.delete(key);
  }

  flushAll() {
    this.store.clear();
  }
}

// Baileys is ESM-only; load it with a real dynamic import from this CommonJS build
const importEsm = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<any>;

/**
 * Turns a stored phone number into international digits (no +).
 * 0501234567 -> 971501234567 (country code 971), 00923001234567 -> 923001234567,
 * numbers of 11+ digits not starting with 0 are assumed to already include a country code.
 */
export function normalizePhone(raw: string, countryCode: string): string | null {
  if (!raw) return null;
  const hasPlus = raw.trim().startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) return digits;
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  else if (digits.length >= 11) return digits;

  const cc = (countryCode || '').replace(/\D/g, '');
  if (!cc) return null;
  return cc + digits;
}

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private sessions = new Map<string, Session>();
  private baileys: any;
  // Retry bookkeeping and copies of sent messages, so a message can be re-sent when the
  // recipient's phone could not decrypt it (otherwise it shows "Waiting for this message")
  private msgRetryCounterCache = new MemoryCache(60 * 60 * 1000);
  private sentMessages = new MemoryCache(24 * 60 * 60 * 1000);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('whatsapp') private whatsappQueue: Queue,
  ) {}

  async onModuleInit() {
    // Reconnect every company that has a saved WhatsApp login
    const saved = await this.prisma.whatsappAuth.findMany({
      where: { key: 'creds' },
      select: { tenantId: true },
    });
    for (const { tenantId } of saved) {
      this.connect(tenantId).catch((err) =>
        this.logger.error(`WhatsApp reconnect failed for ${tenantId}: ${err.message}`),
      );
    }
  }

  onModuleDestroy() {
    for (const session of this.sessions.values()) {
      session.stopped = true;
      try {
        session.sock?.end(undefined);
      } catch {
        // ignore
      }
    }
  }

  private async loadBaileys() {
    if (!this.baileys) this.baileys = await importEsm('@whiskeysockets/baileys');
    return this.baileys;
  }

  getStatus(tenantId: string) {
    const session = this.sessions.get(tenantId);
    return {
      status: session?.status || 'disconnected',
      qr: session?.status === 'qr' ? session.qr : null,
      phone: session?.status === 'connected' ? session.phone : null,
    };
  }

  async connect(tenantId: string) {
    const existing = this.sessions.get(tenantId);
    if (existing && !existing.stopped && existing.status !== 'disconnected') return;

    const session: Session = {
      status: 'connecting',
      qr: null,
      phone: null,
      sock: null,
      stopped: false,
      reconnectAttempts: 0,
    };
    this.sessions.set(tenantId, session);
    await this.startSocket(tenantId, session);
  }

  private async startSocket(tenantId: string, session: Session) {
    const baileys = await this.loadBaileys();
    const { state, saveCreds } = await useDbAuthState(this.prisma, tenantId, baileys);
    const { version } = await baileys
      .fetchLatestBaileysVersion()
      .catch(() => ({ version: undefined }));

    const logger = pino({ level: 'error' });
    const sock = baileys.default({
      version,
      auth: {
        creds: state.creds,
        keys: baileys.makeCacheableSignalKeyStore(state.keys, logger),
      },
      logger,
      browser: baileys.Browsers.ubuntu('Coaching Center'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      msgRetryCounterCache: this.msgRetryCounterCache,
      getMessage: (key: any) => this.getSentMessage(tenantId, key?.id),
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      if (session.stopped || session.sock !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.qr = await QRCode.toDataURL(qr, { width: 300, margin: 1 });
        session.status = 'qr';
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = null;
        session.reconnectAttempts = 0;
        session.phone = (sock.user?.id || '').split(':')[0].split('@')[0] || null;
        this.logger.log(`WhatsApp connected for ${tenantId} (${session.phone})`);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const paired = !!state.creds.me;

        if (code === baileys.DisconnectReason.loggedOut) {
          this.logger.warn(`WhatsApp logged out for ${tenantId}`);
          session.stopped = true;
          session.status = 'disconnected';
          await clearDbAuthState(this.prisma, tenantId);
          return;
        }

        // Not paired yet and the QR expired: wait for the admin to click Connect again
        if (!paired && code !== baileys.DisconnectReason.restartRequired) {
          session.stopped = true;
          session.status = 'disconnected';
          session.qr = null;
          return;
        }

        session.status = 'connecting';
        session.reconnectAttempts += 1;
        const delay = Math.min(60000, 2000 * 2 ** Math.min(session.reconnectAttempts - 1, 5));
        setTimeout(() => {
          if (session.stopped || this.sessions.get(tenantId) !== session) return;
          this.startSocket(tenantId, session).catch((err) =>
            this.logger.error(`WhatsApp reconnect error for ${tenantId}: ${err.message}`),
          );
        }, code === baileys.DisconnectReason.restartRequired ? 0 : delay);
      }
    });
  }

  async logout(tenantId: string) {
    const session = this.sessions.get(tenantId);
    if (session) {
      session.stopped = true;
      try {
        await session.sock?.logout();
      } catch {
        // already disconnected
      }
      this.sessions.delete(tenantId);
    }
    await clearDbAuthState(this.prisma, tenantId);
    return { success: true };
  }

  async sendText(tenantId: string, phone: string, text: string) {
    const session = this.sessions.get(tenantId);
    if (!session || session.status !== 'connected') {
      throw new Error('WhatsApp is not connected');
    }

    const [result] = await session.sock.onWhatsApp(phone);
    if (!result?.exists) {
      throw new Error('This number is not on WhatsApp');
    }

    const sent = await session.sock.sendMessage(result.jid, { text });
    const messageId: string | null = sent?.key?.id || null;
    if (messageId && sent?.message) {
      this.sentMessages.set(`${tenantId}:${messageId}`, sent.message);
    }
    return messageId;
  }

  /** Used by Baileys to re-send a message the recipient asked for again */
  private async getSentMessage(tenantId: string, messageId?: string | null) {
    if (!messageId) return undefined;

    const cached = this.sentMessages.get<any>(`${tenantId}:${messageId}`);
    if (cached) return cached;

    const log = await this.prisma.whatsappMessageLog.findFirst({
      where: { tenantId, waMessageId: messageId },
    });
    if (!log) return undefined;

    const baileys = await this.loadBaileys();
    return baileys.proto.Message.fromObject({ conversation: log.messageText });
  }

  async getSettings(tenantId: string): Promise<WhatsappSettings> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const saved = ((tenant?.settings as any) || {}).whatsapp || {};
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  async updateSettings(tenantId: string, data: Partial<WhatsappSettings>) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings as any) || {};
    const current = { ...DEFAULT_SETTINGS, ...(settings.whatsapp || {}) };

    const next: WhatsappSettings = {
      enabled: data.enabled ?? current.enabled,
      countryCode: (data.countryCode ?? current.countryCode).replace(/\D/g, ''),
      timeZone: data.timeZone ?? current.timeZone,
    };

    try {
      new Intl.DateTimeFormat('en-US', { timeZone: next.timeZone });
    } catch {
      throw new BadRequestException('Invalid time zone');
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, whatsapp: next } },
    });
    return next;
  }

  async sendTestMessage(tenantId: string, rawPhone: string) {
    const settings = await this.getSettings(tenantId);
    const phone = normalizePhone(rawPhone, settings.countryCode);
    if (!phone) throw new BadRequestException('Invalid phone number');

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    try {
      await this.sendText(
        tenantId,
        phone,
        `✅ Test message from *${tenant?.name || 'Coaching Center'}*.\nWhatsApp notifications are working.`,
      );
      return { success: true, phone };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  async getLogs(tenantId: string, limit = 50) {
    return this.prisma.whatsappMessageLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /** Queue check-in / check-out messages to every parent of the student. Never throws. */
  async notifyAttendance(data: {
    tenantId: string;
    studentId: string;
    attendanceId?: string;
    type: 'checkin' | 'checkout';
    time: Date;
    checkinTime?: Date;
  }) {
    try {
      const settings = await this.getSettings(data.tenantId);
      if (!settings.enabled) return;

      const [tenant, student] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: data.tenantId } }),
        this.prisma.student.findUnique({
          where: { id: data.studentId },
          include: { parents: { include: { parent: true } } },
        }),
      ]);
      if (!student) return;

      const text = this.formatMessage(data, student.fullName, tenant?.name || '', settings);

      for (const { parent } of student.parents) {
        if (!parent.notificationEnabled || !parent.phone) continue;

        const phone = normalizePhone(parent.phone, settings.countryCode);
        const log = await this.prisma.whatsappMessageLog.create({
          data: {
            tenantId: data.tenantId,
            studentId: student.id,
            parentId: parent.id,
            attendanceId: data.attendanceId,
            studentName: student.fullName,
            parentName: parent.fullName,
            phone: phone || parent.phone,
            messageType: data.type,
            messageText: text,
            status: phone ? 'queued' : 'failed',
            errorText: phone ? null : 'Invalid phone number or missing country code',
          },
        });
        if (!phone) continue;

        await this.whatsappQueue.add(
          'send-message',
          { logId: log.id, tenantId: data.tenantId, phone, text },
          { attempts: 3, backoff: { type: 'exponential', delay: 30000 }, removeOnComplete: true },
        );
      }
    } catch (err: any) {
      this.logger.error(`Failed to queue WhatsApp notification: ${err.message}`);
    }
  }

  private formatMessage(
    data: { type: 'checkin' | 'checkout'; time: Date; checkinTime?: Date },
    studentName: string,
    companyName: string,
    settings: WhatsappSettings,
  ) {
    const time = data.time.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: settings.timeZone,
    });
    const date = data.time.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: settings.timeZone,
    });
    const footer = companyName ? `\n\n— ${companyName}` : '';

    if (data.type === 'checkin') {
      return `✅ *${studentName}* has checked in at *${time}*.\n📅 ${date}${footer}`;
    }

    let duration = '';
    if (data.checkinTime) {
      const minutes = Math.max(0, Math.round((data.time.getTime() - data.checkinTime.getTime()) / 60000));
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      duration = `\n⏱ Time at center: ${h ? `${h}h ` : ''}${m}m`;
    }
    return `🏠 *${studentName}* has checked out at *${time}*.${duration}\n📅 ${date}${footer}`;
  }
}
