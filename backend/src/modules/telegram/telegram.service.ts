import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import axios from 'axios';

export interface CheckinNotificationData {
  tenantId: string;
  studentId: string;
  parentId: string;
  attendanceId: string;
  studentName: string;
  studentCode: string;
  branchName: string;
  checkinTime: Date;
  telegramChatId: string;
}

export interface CheckoutNotificationData {
  tenantId: string;
  studentId: string;
  parentId: string;
  attendanceId: string;
  studentName: string;
  studentCode: string;
  branchName: string;
  checkinTime: Date;
  checkoutTime: Date;
  durationMinutes: number;
  telegramChatId: string;
}

@Injectable()
export class TelegramService {
  private botToken: string;
  private baseUrl: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @InjectQueue('telegram') private telegramQueue: Queue,
  ) {
    this.botToken = this.configService.get<string>('TELEGRAM_BOT_TOKEN') || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(chatId: string, text: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const response = await axios.post(`${this.baseUrl}/sendMessage`, {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
      });

      return {
        success: true,
        messageId: response.data.result.message_id.toString(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  formatCheckinMessage(data: CheckinNotificationData): string {
    const time = new Date(data.checkinTime).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `✅ <b>Check-in Alert</b>

<b>Student:</b> ${data.studentName} (${data.studentCode})
<b>Time:</b> ${time}
<b>Branch:</b> ${data.branchName}
<b>Status:</b> Checked In

— Coaching Center Attendance System`;
  }

  formatCheckoutMessage(data: CheckoutNotificationData): string {
    const time = new Date(data.checkoutTime).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    const hours = Math.floor(data.durationMinutes / 60);
    const mins = data.durationMinutes % 60;
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return `🚪 <b>Check-out Alert</b>

<b>Student:</b> ${data.studentName} (${data.studentCode})
<b>Time:</b> ${time}
<b>Branch:</b> ${data.branchName}
<b>Status:</b> Checked Out
<b>Duration:</b> ${duration}

— Coaching Center Attendance System`;
  }

  formatAutoCheckoutMessage(data: CheckoutNotificationData): string {
    const time = new Date(data.checkoutTime).toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return `ℹ️ <b>Auto Check-out</b>

<b>Student:</b> ${data.studentName} (${data.studentCode})
<b>Time:</b> ${time} (Auto)
<b>Branch:</b> ${data.branchName}
<b>Status:</b> Auto-closed by system

<i>Note: Student did not check out manually. Please verify with the institute.</i>

— Coaching Center Attendance System`;
  }

  formatConnectionMessage(studentNames: string[]): string {
    const names = studentNames.map(n => `• ${n}`).join('\n');
    return `✓ <b>Connected Successfully!</b>

You will now receive attendance alerts for:
${names}

To disconnect, contact the institute.

— Coaching Center Attendance System`;
  }

  async queueCheckinNotification(data: CheckinNotificationData) {
    const messageText = this.formatCheckinMessage(data);

    // Create log entry
    const log = await this.prisma.telegramMessageLog.create({
      data: {
        tenantId: data.tenantId,
        studentId: data.studentId,
        parentId: data.parentId,
        attendanceId: data.attendanceId,
        messageType: 'checkin',
        messageText,
        telegramChatId: data.telegramChatId,
        status: 'queued',
      },
    });

    // Add to queue
    await this.telegramQueue.add('send-message', {
      logId: log.id,
      chatId: data.telegramChatId,
      text: messageText,
    }, {
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 60000, // 1 minute initial delay
      },
    });
  }

  async queueCheckoutNotification(data: CheckoutNotificationData, isAuto = false) {
    const messageText = isAuto
      ? this.formatAutoCheckoutMessage(data)
      : this.formatCheckoutMessage(data);

    // Create log entry
    const log = await this.prisma.telegramMessageLog.create({
      data: {
        tenantId: data.tenantId,
        studentId: data.studentId,
        parentId: data.parentId,
        attendanceId: data.attendanceId,
        messageType: 'checkout',
        messageText,
        telegramChatId: data.telegramChatId,
        status: 'queued',
      },
    });

    // Add to queue
    await this.telegramQueue.add('send-message', {
      logId: log.id,
      chatId: data.telegramChatId,
      text: messageText,
    }, {
      attempts: 4,
      backoff: {
        type: 'exponential',
        delay: 60000,
      },
    });
  }

  async handleWebhook(update: any) {
    if (!update.message?.text) return { ok: true };

    const chatId = update.message.chat.id.toString();
    const text = update.message.text;
    const username = update.message.from?.username || null;

    // Handle /start command with token
    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1];
      return this.handleStartCommand(chatId, token, username);
    }

    // Handle /start without token
    if (text === '/start') {
      await this.sendMessage(chatId,
        `Welcome to the Attendance Bot!

To connect your account, please use the link provided by your coaching center.

If you've already connected, you'll receive notifications when your child checks in or out.`
      );
      return { ok: true };
    }

    // Handle /status command
    if (text === '/status') {
      return this.handleStatusCommand(chatId);
    }

    // Handle /help command
    if (text === '/help') {
      await this.sendMessage(chatId,
        `<b>Attendance Bot Help</b>

<b>/start</b> - Connect your account
<b>/status</b> - Check connection status
<b>/help</b> - Show this help message

For support, contact your coaching center.`
      );
      return { ok: true };
    }

    return { ok: true };
  }

  private async handleStartCommand(chatId: string, token: string, username: string | null) {
    // Find valid token
    const tokenRecord = await this.prisma.parentTelegramToken.findFirst({
      where: {
        token,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        parent: {
          include: {
            students: {
              include: {
                student: true,
              },
            },
          },
        },
      },
    });

    if (!tokenRecord) {
      await this.sendMessage(chatId,
        `❌ Invalid or expired link.

Please request a new connection link from your coaching center.`
      );
      return { ok: true };
    }

    // Update parent with telegram info
    await this.prisma.parent.update({
      where: { id: tokenRecord.parentId },
      data: {
        telegramChatId: chatId,
        telegramUsername: username,
        telegramConnectedAt: new Date(),
      },
    });

    // Mark token as used
    await this.prisma.parentTelegramToken.update({
      where: { id: tokenRecord.id },
      data: {
        usedAt: new Date(),
        usedByChatId: chatId,
      },
    });

    // Send confirmation
    const studentNames = tokenRecord.parent.students.map(sp =>
      `${sp.student.fullName} (${sp.student.studentCode})`
    );

    await this.sendMessage(chatId, this.formatConnectionMessage(studentNames));

    // Log connection
    await this.prisma.telegramMessageLog.create({
      data: {
        tenantId: tokenRecord.parent.tenantId,
        studentId: tokenRecord.parent.students[0]?.studentId || tokenRecord.parentId,
        parentId: tokenRecord.parentId,
        messageType: 'connection',
        messageText: 'Parent connected to Telegram bot',
        telegramChatId: chatId,
        status: 'sent',
        sentAt: new Date(),
      },
    });

    return { ok: true };
  }

  private async handleStatusCommand(chatId: string) {
    const parent = await this.prisma.parent.findFirst({
      where: { telegramChatId: chatId },
      include: {
        students: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!parent) {
      await this.sendMessage(chatId,
        `❌ Not connected.

Please use the connection link provided by your coaching center.`
      );
      return { ok: true };
    }

    const studentList = parent.students.map(sp =>
      `• ${sp.student.fullName} (${sp.student.studentCode})`
    ).join('\n');

    await this.sendMessage(chatId,
      `✅ <b>Connected</b>

You are receiving notifications for:
${studentList}

Notifications: ${parent.notificationEnabled ? 'Enabled' : 'Disabled'}`
    );

    return { ok: true };
  }
}
