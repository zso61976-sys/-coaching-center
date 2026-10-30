import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
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

export type SimRole = 'balance' | 'backup';

interface Session {
  accountId: string;
  tenantId: string;
  status: ConnectionStatus;
  qr: string | null;
  phone: string | null;
  sock: any;
  stopped: boolean;
  reconnectAttempts: number;
}

/** Wording choices for each part of the welcome message; one is picked at random per parent */
export interface WelcomeTexts {
  greetings: string[];
  greetingsNoName: string[];
  intros: string[];
  updates: string[];
  save: string[];
  noReply: string[];
}

export interface WhatsappSettings {
  enabled: boolean;
  welcomeEnabled: boolean;
  countryCode: string;
  timeZone: string;
  welcomeTexts: WelcomeTexts;
}

const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30000 },
  removeOnComplete: true,
};

// Welcome messages go to numbers that have not saved ours yet, so they are spaced
// out (an Excel import of 100 students ≈ 75 minutes) and wait behind attendance
// messages (no priority) but still go before broadcasts (priority 10)
const WELCOME_GAP_MS = 45 * 1000;
const WELCOME_JITTER = 0.3;
const WELCOME_JOB_OPTIONS = { ...JOB_OPTIONS, priority: 5 };

export type LogFilter = 'all' | 'waiting' | 'sent' | 'failed';

// Message statuses shown by each filter of the message log (all: no filter)
const LOG_FILTER_STATUSES: Record<LogFilter, string[] | null> = {
  all: null,
  waiting: ['queued', 'retry'],
  sent: ['sent'],
  failed: ['failed', 'cancelled'],
};

export function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

// Parts of the welcome message, picked at random so parents do not all get the same text.
// Companies can change them on the WhatsApp page; these are the defaults.
const WELCOME_ICONS = ['👋', '🌟', '😊', '🙂', '🎉'];
export const DEFAULT_WELCOME_TEXTS: WelcomeTexts = {
  greetings: [
    'Assalam o Alaikum {name}!',
    'Dear {name},',
    'Hello {name},',
    'Respected {name},',
    'Assalam o Alaikum dear {name},',
  ],
  greetingsNoName: [
    'Assalam o Alaikum!',
    'Dear Parent,',
    'Hello,',
    'Respected Parent,',
    'Assalam o Alaikum dear Parent,',
  ],
  intros: [
    'Welcome to *{company}*. *{student}* is now registered with us.',
    '*{student}* has been registered at *{company}*. Welcome!',
    'Thank you for choosing *{company}*. *{student}* is now registered with us.',
    'We are happy to welcome *{student}* to *{company}*.',
    'Welcome! *{student}* is now a student at *{company}*.',
  ],
  updates: [
    'You will receive a message on this number every time {student} checks in or out.',
    'From now on, this number will tell you when {student} checks in and checks out.',
    'Each time {student} arrives or leaves, you will get a message on this number.',
    'You will be informed on this number whenever {student} checks in or out.',
    'We will message you here every time {student} checks in or checks out.',
  ],
  save: [
    'Please *save this number* in your contacts as "{company}" so you receive every update.',
    'Kindly *save this number* as "{company}" in your phone so no update is missed.',
    'To receive all updates, please *save this number* in your contacts as "{company}".',
    'Please add this number to your contacts as "{company}" (*save it*) to get every message.',
    'So that every message reaches you, please *save this number* as "{company}".',
  ],
  noReply: [
    'This is an automated number. Please do not reply to this message.',
    'This number sends automatic messages only. Please do not reply here.',
    'Messages from this number are automatic. Kindly do not reply.',
    'This is an automatic service, so replies to this number are not read.',
    'Please do not reply to this number. It only sends automatic updates.',
  ],
};
const WELCOME_TEXT_KEYS = Object.keys(DEFAULT_WELCOME_TEXTS) as (keyof WelcomeTexts)[];

const DEFAULT_SETTINGS: WhatsappSettings = {
  enabled: false,
  welcomeEnabled: true,
  countryCode: '971',
  timeZone: 'Asia/Dubai',
  welcomeTexts: DEFAULT_WELCOME_TEXTS,
};

/** Saved wording with blank lines dropped; a part left empty falls back to the default */
function cleanWelcomeTexts(texts?: Partial<Record<keyof WelcomeTexts, unknown>>): WelcomeTexts {
  const result = {} as WelcomeTexts;
  for (const key of WELCOME_TEXT_KEYS) {
    const lines = Array.isArray(texts?.[key])
      ? (texts![key] as unknown[]).map((line) => String(line ?? '').trim().slice(0, 500)).filter(Boolean).slice(0, 20)
      : [];
    result[key] = lines.length ? lines : DEFAULT_WELCOME_TEXTS[key];
  }
  return result;
}

export type NumberCheck = 'ok' | 'invalid' | 'not_on_whatsapp';

export interface NumberProblem {
  parentId: string;
  parentName: string;
  phone: string;
  problem: 'invalid' | 'not_on_whatsapp';
  students: { id: string; fullName: string; grade: string | null }[];
}

export type NumberStatus =
  | { status: 'ok' | 'unchecked' | 'missing' }
  | { status: 'problem'; problem: NumberProblem['problem'] };

/** Whether a parent's current number can receive WhatsApp messages, from the last check */
export function numberStatus(
  parent: { phone: string; whatsappCheck: string | null; whatsappCheckedPhone: string | null },
  countryCode: string,
): NumberStatus {
  if (!parent.phone?.trim()) return { status: 'missing' };
  if (!normalizePhone(parent.phone, countryCode)) return { status: 'problem', problem: 'invalid' };
  if (parent.whatsappCheckedPhone !== parent.phone) return { status: 'unchecked' };
  if (parent.whatsappCheck === 'not_on_whatsapp') return { status: 'problem', problem: 'not_on_whatsapp' };
  return { status: parent.whatsappCheck === 'ok' ? 'ok' : 'unchecked' };
}

// Numbers are looked up on WhatsApp this many at a time
const NUMBER_CHECK_BATCH = 50;
// How often numbers that could not be checked yet are tried again
const NUMBER_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const PROBLEM_PARENT_SELECT = {
  id: true,
  fullName: true,
  phone: true,
  students: { select: { student: { select: { id: true, fullName: true, grade: true } } } },
} as const;

function toProblem(
  p: { id: string; fullName: string; phone: string; students: { student: NumberProblem['students'][number] }[] },
  problem: NumberProblem['problem'],
): NumberProblem {
  return {
    parentId: p.id,
    parentName: p.fullName,
    phone: p.phone,
    problem,
    students: p.students.map((s) => s.student),
  };
}

// Parents are saved as contacts on their SIM one at a time, this far apart
const CONTACT_GAP_MS = 2000;
const CONTACT_NAME_MAX = 60;

/** Contact name for a parent, e.g. "Ahmed Ali (Parent of Sara, Omar)" */
function contactName(parentName: string, studentNames: string[]) {
  const name = (parentName || '').trim();
  const children = studentNames.filter(Boolean).join(', ');
  const full = !children || name.startsWith('Parent of') ? name || `Parent of ${children}` : `${name} (Parent of ${children})`;
  return full.length > CONTACT_NAME_MAX ? `${full.slice(0, CONTACT_NAME_MAX - 1)}…` : full;
}

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
  /** Live connections, keyed by WhatsApp account (SIM) id */
  private sessions = new Map<string, Session>();
  private baileys: any;
  // Retry bookkeeping and copies of sent messages, so a message can be re-sent when the
  // recipient's phone could not decrypt it (otherwise it shows "Waiting for this message")
  private msgRetryCounterCache = new MemoryCache(60 * 60 * 1000);
  private sentMessages = new MemoryCache(24 * 60 * 60 * 1000);
  /** One rebalance at a time per company */
  private rebalanceLocks = new Map<string, Promise<unknown>>();
  /** When the next welcome message may go out, per company */
  private nextWelcomeAt = new Map<string, number>();
  /** Contact saves waiting to run, chained per SIM */
  private contactChains = new Map<string, Promise<unknown>>();
  /** Automatic number checks: one run at a time per company */
  private numberCheckRuns = new Map<string, Promise<void>>();
  private numberCheckTimer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    @InjectQueue('whatsapp') private whatsappQueue: Queue,
  ) {}

  async onModuleInit() {
    // Reconnect every SIM that has a saved WhatsApp login
    const saved = await this.prisma.whatsappAuth.findMany({
      where: { key: 'creds' },
      select: { accountId: true },
    });
    const accounts = await this.prisma.whatsappAccount.findMany({
      where: { id: { in: saved.map((s) => s.accountId) } },
    });
    for (const account of accounts) {
      this.startSession(account.id, account.tenantId).catch((err) =>
        this.logger.error(`WhatsApp reconnect failed for SIM ${account.id}: ${err.message}`),
      );
    }

    // Numbers that could not be checked yet (no SIM was connected) are retried regularly
    this.numberCheckTimer = setInterval(() => {
      const tenantIds = new Set(
        [...this.sessions.values()].filter((s) => s.status === 'connected').map((s) => s.tenantId),
      );
      for (const tenantId of tenantIds) this.checkUncheckedNumbers(tenantId);
    }, NUMBER_CHECK_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.numberCheckTimer) clearInterval(this.numberCheckTimer);
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

  // ---------------------------------------------------------------------------
  // SIMs (WhatsApp accounts)
  // ---------------------------------------------------------------------------

  private async getAccount(tenantId: string, accountId: string) {
    const account = await this.prisma.whatsappAccount.findFirst({
      where: { id: accountId, tenantId },
    });
    if (!account) throw new NotFoundException('WhatsApp number not found');
    return account;
  }

  private startOfToday(timeZone: string) {
    // Midnight today in the company's time zone, as a UTC Date
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone }));
    const offsetMs = local.getTime() - now.getTime();
    local.setHours(0, 0, 0, 0);
    return new Date(local.getTime() - offsetMs);
  }

  async listAccounts(tenantId: string) {
    const [accounts, settings] = await Promise.all([
      this.prisma.whatsappAccount.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
      this.getSettings(tenantId),
    ]);
    const ids = accounts.map((a) => a.id);

    const [linked, assigned, sentToday] = await Promise.all([
      this.prisma.whatsappAuth.findMany({
        where: { accountId: { in: ids }, key: 'creds' },
        select: { accountId: true },
      }),
      this.prisma.parent.groupBy({
        by: ['whatsappAccountId'],
        where: { tenantId, whatsappAccountId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.whatsappMessageLog.groupBy({
        by: ['accountId'],
        where: {
          tenantId,
          accountId: { in: ids },
          status: 'sent',
          sentAt: { gte: this.startOfToday(settings.timeZone) },
        },
        _count: { _all: true },
      }),
    ]);
    const linkedIds = new Set(linked.map((l) => l.accountId));

    return accounts.map((account) => {
      const session = this.sessions.get(account.id);
      const status: ConnectionStatus = session?.status || 'disconnected';
      return {
        id: account.id,
        label: account.label,
        enabled: account.enabled,
        role: account.role as SimRole,
        linked: linkedIds.has(account.id),
        status,
        qr: status === 'qr' ? session?.qr || null : null,
        phone: status === 'connected' ? session?.phone || null : null,
        assignedParents:
          assigned.find((a) => a.whatsappAccountId === account.id)?._count._all || 0,
        sentToday: sentToday.find((s) => s.accountId === account.id)?._count._all || 0,
      };
    });
  }

  /** Today's message counts by status, for the live dashboard */
  async getTodaySummary(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    const rows = await this.prisma.whatsappMessageLog.groupBy({
      by: ['status'],
      where: { tenantId, createdAt: { gte: this.startOfToday(settings.timeZone) } },
      _count: { _all: true },
    });
    const count = (status: string) => rows.find((r) => r.status === status)?._count._all || 0;
    return {
      sent: count('sent'),
      failed: count('failed'),
      pending: count('queued') + count('retry'),
    };
  }

  async createAccount(tenantId: string, label?: string, role: SimRole = 'balance') {
    const count = await this.prisma.whatsappAccount.count({ where: { tenantId } });
    return this.prisma.whatsappAccount.create({
      data: { tenantId, label: label?.trim() || `SIM ${count + 1}`, role },
    });
  }

  async updateAccount(
    tenantId: string,
    accountId: string,
    data: { label?: string; enabled?: boolean; role?: SimRole },
  ) {
    const before = await this.getAccount(tenantId, accountId);
    const updated = await this.prisma.whatsappAccount.update({
      where: { id: accountId },
      data: {
        label: data.label?.trim() || undefined,
        enabled: data.enabled,
        role: data.role,
      },
    });
    // Pausing/resuming or switching between balancing and backup changes who shares the parents
    if (before.enabled !== updated.enabled || before.role !== updated.role) {
      await this.autoRebalance(tenantId);
    }
    return updated;
  }

  async deleteAccount(tenantId: string, accountId: string) {
    await this.getAccount(tenantId, accountId);
    await this.logout(tenantId, accountId);
    // Parents of this SIM get a new SIM the next time they are messaged
    await this.prisma.parent.updateMany({
      where: { tenantId, whatsappAccountId: accountId },
      data: { whatsappAccountId: null },
    });
    await this.prisma.whatsappAccount.delete({ where: { id: accountId } });
    await this.autoRebalance(tenantId);
    return { success: true };
  }

  async connect(tenantId: string, accountId: string) {
    await this.getAccount(tenantId, accountId);
    await this.startSession(accountId, tenantId);
  }

  private async startSession(accountId: string, tenantId: string) {
    const existing = this.sessions.get(accountId);
    if (existing && !existing.stopped && existing.status !== 'disconnected') return;

    const session: Session = {
      accountId,
      tenantId,
      status: 'connecting',
      qr: null,
      phone: null,
      sock: null,
      stopped: false,
      reconnectAttempts: 0,
    };
    this.sessions.set(accountId, session);
    await this.startSocket(session);
  }

  private async startSocket(session: Session) {
    const { accountId } = session;
    const baileys = await this.loadBaileys();
    const { state, saveCreds } = await useDbAuthState(this.prisma, accountId, baileys);
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
      getMessage: (key: any) => this.getSentMessage(accountId, key?.id),
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
        this.logger.log(`WhatsApp SIM ${accountId} connected (${session.phone})`);
        // A newly linked balancing SIM takes its share of the parents
        await this.autoRebalance(session.tenantId);
        // Numbers added while no SIM was connected can be checked now
        this.checkUncheckedNumbers(session.tenantId);
      }

      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const paired = !!state.creds.me;

        if (code === baileys.DisconnectReason.loggedOut) {
          this.logger.warn(`WhatsApp SIM ${accountId} was logged out`);
          session.stopped = true;
          session.status = 'disconnected';
          await clearDbAuthState(this.prisma, accountId);
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
          if (session.stopped || this.sessions.get(accountId) !== session) return;
          this.startSocket(session).catch((err) =>
            this.logger.error(`WhatsApp SIM ${accountId} reconnect error: ${err.message}`),
          );
        }, code === baileys.DisconnectReason.restartRequired ? 0 : delay);
      }
    });
  }

  async logout(tenantId: string, accountId: string) {
    await this.getAccount(tenantId, accountId);
    const session = this.sessions.get(accountId);
    if (session) {
      session.stopped = true;
      try {
        await session.sock?.logout();
      } catch {
        // already disconnected
      }
      this.sessions.delete(accountId);
    }
    await clearDbAuthState(this.prisma, accountId);
    return { success: true };
  }

  // ---------------------------------------------------------------------------
  // Assigning parents to SIMs
  // ---------------------------------------------------------------------------

  /** Enabled balancing SIMs of the company that have been linked by QR scan */
  private async linkedAccountIds(tenantId: string) {
    const accounts = await this.prisma.whatsappAccount.findMany({
      where: { tenantId, enabled: true, role: 'balance' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    const linked = await this.prisma.whatsappAuth.findMany({
      where: { accountId: { in: accounts.map((a) => a.id) }, key: 'creds' },
      select: { accountId: true },
    });
    const linkedSet = new Set(linked.map((l) => l.accountId));
    return accounts.map((a) => a.id).filter((id) => linkedSet.has(id));
  }

  /**
   * Returns the SIM a parent is assigned to, assigning the least-loaded SIM the first time.
   * The assignment is kept, so a parent always hears from the same number.
   */
  async assignAccount(tenantId: string, parent: { id: string; whatsappAccountId: string | null }) {
    const accountIds = await this.linkedAccountIds(tenantId);
    if (accountIds.length === 0) return null;
    if (parent.whatsappAccountId && accountIds.includes(parent.whatsappAccountId)) {
      return parent.whatsappAccountId;
    }

    const counts = await this.prisma.parent.groupBy({
      by: ['whatsappAccountId'],
      where: { tenantId, whatsappAccountId: { in: accountIds } },
      _count: { _all: true },
    });
    const load = (id: string) => counts.find((c) => c.whatsappAccountId === id)?._count._all || 0;
    const chosen = accountIds.reduce((best, id) => (load(id) < load(best) ? id : best), accountIds[0]);

    await this.prisma.parent.update({
      where: { id: parent.id },
      data: { whatsappAccountId: chosen },
    });
    return chosen;
  }

  /** Spread all parents evenly over the linked SIMs, moving as few parents as possible */
  async rebalance(tenantId: string) {
    const accountIds = await this.linkedAccountIds(tenantId);
    if (accountIds.length === 0) {
      throw new BadRequestException('Link at least one balancing WhatsApp number first');
    }

    const parents = await this.prisma.parent.findMany({
      where: { tenantId, phone: { not: '' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, whatsappAccountId: true },
    });

    const groups = new Map<string, string[]>(accountIds.map((id) => [id, []]));
    const unassigned: string[] = [];
    for (const p of parents) {
      if (p.whatsappAccountId && groups.has(p.whatsappAccountId)) {
        groups.get(p.whatsappAccountId)!.push(p.id);
      } else {
        unassigned.push(p.id);
      }
    }

    // Capacity per SIM: equal shares; the SIMs that already have the most keep the remainder
    const base = Math.floor(parents.length / accountIds.length);
    const remainder = parents.length % accountIds.length;
    const bySize = [...accountIds].sort((a, b) => groups.get(b)!.length - groups.get(a)!.length);
    const capacity = new Map(bySize.map((id, i) => [id, base + (i < remainder ? 1 : 0)]));

    // Take the newest parents off over-full SIMs
    for (const id of accountIds) {
      const members = groups.get(id)!;
      const cap = capacity.get(id)!;
      if (members.length > cap) unassigned.push(...members.splice(cap));
    }

    const moves = new Map<string, string[]>();
    for (const id of accountIds) {
      const members = groups.get(id)!;
      const cap = capacity.get(id)!;
      while (members.length < cap && unassigned.length > 0) {
        const parentId = unassigned.shift()!;
        members.push(parentId);
        if (!moves.has(id)) moves.set(id, []);
        moves.get(id)!.push(parentId);
      }
    }

    for (const [accountId, parentIds] of moves) {
      await this.prisma.parent.updateMany({
        where: { id: { in: parentIds } },
        data: { whatsappAccountId: accountId },
      });
    }

    const moved = [...moves.values()].reduce((sum, ids) => sum + ids.length, 0);
    return { success: true, moved, total: parents.length };
  }

  /** Rebalance after SIM changes; never throws, one run at a time per company */
  private async autoRebalance(tenantId: string) {
    const previous = this.rebalanceLocks.get(tenantId) || Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        if ((await this.linkedAccountIds(tenantId)).length === 0) return;
        const result = await this.rebalance(tenantId);
        if (result.moved > 0) {
          this.logger.log(`Rebalanced WhatsApp parents for ${tenantId}: ${result.moved} moved`);
        }
      })
      .catch((err) => this.logger.error(`Auto rebalance failed for ${tenantId}: ${err.message}`));
    this.rebalanceLocks.set(tenantId, run);
    await run;
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------

  /**
   * Sends from the preferred SIM, or from another connected SIM of the company when it is down.
   * With strict, only the given SIM is used (for testing a specific number).
   */
  async sendText(
    tenantId: string,
    preferredAccountId: string | null,
    phone: string,
    text: string,
    strict = false,
  ) {
    let session = preferredAccountId ? this.sessions.get(preferredAccountId) : undefined;
    if (session?.status !== 'connected' || session.tenantId !== tenantId) {
      session = undefined;
      if (!strict) {
        // The parent's SIM is down: use a backup SIM first, then another balancing SIM
        const enabled = await this.prisma.whatsappAccount.findMany({
          where: { tenantId, enabled: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true, role: true },
        });
        const ordered = [
          ...enabled.filter((a) => a.role === 'backup'),
          ...enabled.filter((a) => a.role !== 'backup'),
        ];
        session = ordered
          .map((a) => this.sessions.get(a.id))
          .find((s) => s?.status === 'connected');
      }
    }
    if (!session) throw new Error('WhatsApp is not connected');

    const [result] = await session.sock.onWhatsApp(phone);
    if (!result?.exists) {
      throw new Error('This number is not on WhatsApp');
    }

    const sent = await session.sock.sendMessage(result.jid, { text });
    const messageId: string | null = sent?.key?.id || null;
    if (messageId && sent?.message) {
      this.sentMessages.set(`${session.accountId}:${messageId}`, sent.message);
    }
    return { messageId, accountId: session.accountId };
  }

  /** Used by Baileys to re-send a message the recipient asked for again */
  private async getSentMessage(accountId: string, messageId?: string | null) {
    if (!messageId) return undefined;

    const cached = this.sentMessages.get<any>(`${accountId}:${messageId}`);
    if (cached) return cached;

    const log = await this.prisma.whatsappMessageLog.findFirst({
      where: { accountId, waMessageId: messageId },
    });
    if (!log) return undefined;

    const baileys = await this.loadBaileys();
    return baileys.proto.Message.fromObject({ conversation: log.messageText });
  }

  async getSettings(tenantId: string): Promise<WhatsappSettings> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const saved = ((tenant?.settings as any) || {}).whatsapp || {};
    return { ...DEFAULT_SETTINGS, ...saved, welcomeTexts: cleanWelcomeTexts(saved.welcomeTexts) };
  }

  async updateSettings(
    tenantId: string,
    data: Partial<Omit<WhatsappSettings, 'welcomeTexts'>> & { welcomeTexts?: Partial<WelcomeTexts> },
  ) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const settings = (tenant?.settings as any) || {};
    const current = { ...DEFAULT_SETTINGS, ...(settings.whatsapp || {}) };

    const next: WhatsappSettings = {
      enabled: data.enabled ?? current.enabled,
      welcomeEnabled: data.welcomeEnabled ?? current.welcomeEnabled,
      countryCode: (data.countryCode ?? current.countryCode).replace(/\D/g, ''),
      timeZone: data.timeZone ?? current.timeZone,
      welcomeTexts: cleanWelcomeTexts(data.welcomeTexts ?? current.welcomeTexts),
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

  async sendTestMessage(tenantId: string, rawPhone: string, accountId?: string) {
    const settings = await this.getSettings(tenantId);
    const phone = normalizePhone(rawPhone, settings.countryCode);
    if (!phone) throw new BadRequestException('Invalid phone number');
    if (accountId) await this.getAccount(tenantId, accountId);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    try {
      const result = await this.sendText(
        tenantId,
        accountId || null,
        phone,
        `✅ Test message from *${tenant?.name || 'Coaching Center'}*.\nWhatsApp notifications are working.`,
        !!accountId,
      );
      return { success: true, phone, accountId: result.accountId };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  /**
   * Message log, newest first. "waiting" shows queued and retrying messages, the next one to go first.
   * Also returns how many messages are in each group.
   */
  async getLogs(tenantId: string, filter: LogFilter = 'all', limit = 100) {
    const statuses = LOG_FILTER_STATUSES[filter];
    const [logs, accounts, counts] = await Promise.all([
      this.prisma.whatsappMessageLog.findMany({
        where: { tenantId, ...(statuses ? { status: { in: statuses } } : {}) },
        orderBy:
          filter === 'waiting'
            ? [{ scheduledAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }]
            : { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.whatsappAccount.findMany({ where: { tenantId }, select: { id: true, label: true } }),
      this.prisma.whatsappMessageLog.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const labels = new Map(accounts.map((a) => [a.id, a.label]));
    const count = (group: LogFilter) =>
      counts
        .filter((c) => !LOG_FILTER_STATUSES[group] || LOG_FILTER_STATUSES[group]!.includes(c.status))
        .reduce((sum, c) => sum + c._count._all, 0);

    return {
      logs: logs.map((log) => ({
        ...log,
        accountLabel: log.accountId ? labels.get(log.accountId) || null : null,
      })),
      counts: { all: count('all'), waiting: count('waiting'), sent: count('sent'), failed: count('failed') },
    };
  }

  /** Create a log entry and queue the message for a parent from their assigned SIM */
  private async queueForParent(data: {
    tenantId: string;
    parent: { id: string; fullName: string; phone: string; whatsappAccountId: string | null };
    phone: string | null;
    student: { id: string; fullName: string };
    attendanceId?: string;
    messageType: string;
    text: string;
  }, jobOptions: Record<string, any> = JOB_OPTIONS) {
    const accountId = data.phone ? await this.assignAccount(data.tenantId, data.parent) : null;

    const log = await this.prisma.whatsappMessageLog.create({
      data: {
        tenantId: data.tenantId,
        accountId,
        studentId: data.student.id,
        parentId: data.parent.id,
        attendanceId: data.attendanceId,
        studentName: data.student.fullName,
        parentName: data.parent.fullName,
        phone: data.phone || data.parent.phone,
        messageType: data.messageType,
        messageText: data.text,
        status: data.phone ? 'queued' : 'failed',
        errorText: data.phone ? null : 'Invalid phone number or missing country code',
        scheduledAt: data.phone ? new Date(Date.now() + (jobOptions.delay || 0)) : null,
      },
    });
    if (!data.phone) {
      await this.recordNumberCheck(data.parent.id, 'invalid');
      return false;
    }

    await this.whatsappQueue.add(
      'send-message',
      { logId: log.id, tenantId: data.tenantId, accountId, phone: data.phone, text: data.text },
      jobOptions,
    );
    return true;
  }

  /** Delay for the next welcome: the first goes at once, the rest about WELCOME_GAP_MS apart */
  private nextWelcomeDelay(tenantId: string) {
    const now = Date.now();
    const sendAt = Math.max(now, this.nextWelcomeAt.get(tenantId) || 0);
    const gap = WELCOME_GAP_MS * (1 + (Math.random() * 2 - 1) * WELCOME_JITTER);
    this.nextWelcomeAt.set(tenantId, sendAt + gap);
    return sendAt - now;
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
        await this.queueForParent({
          tenantId: data.tenantId,
          parent,
          phone: normalizePhone(parent.phone, settings.countryCode),
          student,
          attendanceId: data.attendanceId,
          messageType: data.type,
          text,
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to queue WhatsApp notification: ${err.message}`);
    }
  }

  /**
   * Welcome message for parents whose mobile number has not been welcomed yet
   * (new student, or the number was added or changed). Never throws.
   */
  async sendWelcome(tenantId: string, studentId: string) {
    try {
      const settings = await this.getSettings(tenantId);
      if (!settings.enabled || !settings.welcomeEnabled) return 0;

      const [tenant, student] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { id: tenantId } }),
        this.prisma.student.findFirst({
          where: { id: studentId, tenantId },
          include: { parents: { include: { parent: true } } },
        }),
      ]);
      if (!student) return 0;

      let queued = 0;
      for (const { parent } of student.parents) {
        if (!parent.notificationEnabled || !parent.phone) continue;
        const phone = normalizePhone(parent.phone, settings.countryCode);
        if (!phone || parent.whatsappWelcomedPhone === phone) continue;

        // Mark first, so a quick second save does not send the welcome twice
        await this.prisma.parent.update({
          where: { id: parent.id },
          data: { whatsappWelcomedPhone: phone },
        });
        const sent = await this.queueForParent({
          tenantId,
          parent,
          phone,
          student,
          messageType: 'welcome',
          text: this.formatWelcome(settings.welcomeTexts, parent.fullName, student.fullName, tenant?.name || 'our center'),
        }, { ...WELCOME_JOB_OPTIONS, delay: this.nextWelcomeDelay(tenantId) });
        if (sent) queued += 1;
      }
      return queued;
    } catch (err: any) {
      this.logger.error(`Failed to queue WhatsApp welcome: ${err.message}`);
      return 0;
    }
  }

  /** Welcome every parent of the company who has not received the welcome message yet */
  async sendPendingWelcomes(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled || !settings.welcomeEnabled) {
      throw new BadRequestException('Turn on WhatsApp notifications and welcome messages first');
    }

    const students = await this.prisma.student.findMany({
      where: { tenantId, parents: { some: {} } },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    let queued = 0;
    for (const student of students) {
      queued += await this.sendWelcome(tenantId, student.id);
    }
    return { success: true, queued };
  }

  // ---------------------------------------------------------------------------
  // Checking parent numbers
  // ---------------------------------------------------------------------------

  /** Remember the result for a parent's current number (from a check or a sent message) */
  async recordNumberCheck(parentId: string, check: NumberCheck) {
    const parent = await this.prisma.parent.findUnique({ where: { id: parentId }, select: { phone: true } });
    if (!parent) return;
    await this.prisma.parent.update({
      where: { id: parentId },
      data: { whatsappCheck: check, whatsappCheckedPhone: parent.phone, whatsappCheckedAt: new Date() },
    });
  }

  /**
   * Check the matching parents' numbers on WhatsApp and remember the results.
   * Returns the numbers with a problem. Never throws.
   */
  async checkParentNumbers(tenantId: string, where: Record<string, any>): Promise<NumberProblem[]> {
    try {
      const settings = await this.getSettings(tenantId);
      if (!settings.enabled) return [];

      const parents = await this.prisma.parent.findMany({
        where: { ...where, tenantId, phone: { not: '' } },
        select: PROBLEM_PARENT_SELECT,
      });

      const checks = new Map<string, NumberCheck>();
      const lookups: { id: string; phone: string }[] = [];
      for (const p of parents) {
        const phone = normalizePhone(p.phone, settings.countryCode);
        if (phone) lookups.push({ id: p.id, phone });
        else checks.set(p.id, 'invalid');
      }

      // Without a connected SIM only badly written numbers can be found
      const session = [...this.sessions.values()].find(
        (s) => s.tenantId === tenantId && s.status === 'connected',
      );
      if (session) {
        for (let i = 0; i < lookups.length; i += NUMBER_CHECK_BATCH) {
          const batch = lookups.slice(i, i + NUMBER_CHECK_BATCH);
          for (const [id, exists] of await this.lookupNumbers(session, batch)) {
            checks.set(id, exists ? 'ok' : 'not_on_whatsapp');
          }
        }
      }

      const now = new Date();
      for (const p of parents) {
        const check = checks.get(p.id);
        if (!check) continue;
        await this.prisma.parent.update({
          where: { id: p.id },
          data: { whatsappCheck: check, whatsappCheckedPhone: p.phone, whatsappCheckedAt: now },
        });
      }

      return parents
        .filter((p) => checks.get(p.id) === 'invalid' || checks.get(p.id) === 'not_on_whatsapp')
        .map((p) => toProblem(p, checks.get(p.id) as NumberProblem['problem']));
    } catch (err: any) {
      this.logger.error(`Failed to check WhatsApp numbers: ${err.message}`);
      return [];
    }
  }

  /** Which numbers are on WhatsApp, by parent id. Numbers whose lookup failed are left out. */
  private async lookupNumbers(session: Session, batch: { id: string; phone: string }[]) {
    const found = new Map<string, boolean>();
    try {
      const results: { jid: string; exists: boolean }[] =
        (await session.sock.onWhatsApp(...batch.map((b) => b.phone))) || [];
      // WhatsApp only answers for numbers that exist; match them back by number
      if (results.every((r) => r.jid?.endsWith('@s.whatsapp.net'))) {
        const existing = new Set(results.filter((r) => r.exists).map((r) => r.jid.split('@')[0].split(':')[0]));
        for (const b of batch) found.set(b.id, existing.has(b.phone));
        return found;
      }
    } catch (err: any) {
      this.logger.warn(`WhatsApp number lookup failed, checking one by one: ${err.message}`);
    }
    // The batch answer could not be matched back to the numbers: ask one at a time
    for (const b of batch) {
      try {
        const [result] = (await session.sock.onWhatsApp(b.phone)) || [];
        found.set(b.id, !!result?.exists);
      } catch {
        // unknown for now
      }
    }
    return found;
  }

  /** Parents whose current number is badly written or was found not to be on WhatsApp */
  async getNumberProblems(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    const parents = await this.prisma.parent.findMany({
      where: { tenantId, phone: { not: '' } },
      orderBy: { fullName: 'asc' },
      select: { ...PROBLEM_PARENT_SELECT, whatsappCheck: true, whatsappCheckedPhone: true },
    });

    const problems: NumberProblem[] = [];
    let unchecked = 0;
    for (const p of parents) {
      const result = numberStatus(p, settings.countryCode);
      if (result.status === 'problem') problems.push(toProblem(p, result.problem));
      else if (result.status === 'unchecked') unchecked += 1;
    }
    return { problems, unchecked, total: parents.length };
  }

  /** Check the numbers that were added or changed since their last check. Never throws. */
  checkUncheckedNumbers(tenantId: string) {
    const running = this.numberCheckRuns.get(tenantId);
    if (running) return running;

    const run = (async () => {
      const parents = await this.prisma.parent.findMany({
        where: { tenantId, phone: { not: '' } },
        select: { id: true, phone: true, whatsappCheckedPhone: true },
      });
      const ids = parents.filter((p) => p.whatsappCheckedPhone !== p.phone).map((p) => p.id);
      if (ids.length === 0) return;
      const problems = await this.checkParentNumbers(tenantId, { id: { in: ids } });
      this.logger.log(`Checked ${ids.length} WhatsApp number(s) for ${tenantId}: ${problems.length} problem(s)`);
    })()
      .catch((err) => this.logger.error(`Automatic number check failed for ${tenantId}: ${err.message}`))
      .finally(() => this.numberCheckRuns.delete(tenantId));
    this.numberCheckRuns.set(tenantId, run);
    return run;
  }

  // ---------------------------------------------------------------------------
  // Saving parents as contacts on the SIMs
  // ---------------------------------------------------------------------------

  /** Save the parents of a student as contacts on their SIMs. Runs in the background, never throws. */
  saveContacts(tenantId: string, studentId: string) {
    this.queueContacts(tenantId, { students: { some: { studentId } } }).catch((err) =>
      this.logger.error(`Failed to queue WhatsApp contacts: ${err.message}`),
    );
  }

  /** Save every parent of the company as a contact on the SIM they are assigned to */
  async saveAllContacts(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled) throw new BadRequestException('Turn on WhatsApp notifications first');
    if ((await this.linkedAccountIds(tenantId)).length === 0) {
      throw new BadRequestException('Link at least one balancing WhatsApp number first');
    }
    return { success: true, queued: await this.queueContacts(tenantId, {}) };
  }

  /** Queue contact saves for the matching parents, one SIM at a time, CONTACT_GAP_MS apart */
  private async queueContacts(tenantId: string, where: Record<string, any>) {
    const settings = await this.getSettings(tenantId);
    if (!settings.enabled) return 0;

    const parents = await this.prisma.parent.findMany({
      where: { ...where, tenantId, phone: { not: '' } },
      orderBy: { createdAt: 'asc' },
      include: { students: { include: { student: { select: { fullName: true } } } } },
    });

    let queued = 0;
    for (const parent of parents) {
      const phone = normalizePhone(parent.phone, settings.countryCode);
      const accountId = phone ? await this.assignAccount(tenantId, parent) : null;
      if (!phone || !accountId) continue;

      const name = contactName(parent.fullName, parent.students.map((s) => s.student.fullName));
      const previous = this.contactChains.get(accountId) || Promise.resolve();
      const run = previous
        .then(() => this.saveContact(accountId, phone, name))
        .catch((err) => this.logger.warn(`Could not save contact ${phone} on SIM ${accountId}: ${err.message}`))
        .then(() => new Promise((resolve) => setTimeout(resolve, CONTACT_GAP_MS)));
      this.contactChains.set(accountId, run);
      queued += 1;
    }
    return queued;
  }

  private async saveContact(accountId: string, phone: string, name: string) {
    const session = this.sessions.get(accountId);
    if (session?.status !== 'connected') throw new Error('SIM is not connected');
    await session.sock.addOrEditContact(`${phone}@s.whatsapp.net`, {
      fullName: name,
      firstName: name,
      // Also put it in the phone's own address book, not only in WhatsApp
      saveOnPrimaryAddressbook: true,
    });
  }

  /** Every parent gets the same welcome in different wording, like broadcasts */
  private formatWelcome(texts: WelcomeTexts, parentName: string, studentName: string, companyName: string) {
    const name = parentName && !parentName.startsWith('Parent of') ? parentName : '';
    const fill = (text: string) =>
      text.replace(/\{name\}/g, name).replace(/\{student\}/g, studentName).replace(/\{company\}/g, companyName);
    return [
      `${fill(pick(name ? texts.greetings : texts.greetingsNoName))} ${pick(WELCOME_ICONS)}`,
      fill(pick(texts.intros)),
      fill(pick(texts.updates)),
      `📌 ${fill(pick(texts.save))}`,
      `⚠️ ${fill(pick(texts.noReply))}`,
    ].join('\n\n');
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
