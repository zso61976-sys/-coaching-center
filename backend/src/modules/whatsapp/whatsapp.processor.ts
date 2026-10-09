import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { WhatsappService } from './whatsapp.service';

// At most one message every 3 seconds, to keep the numbers from looking like spam
@Processor('whatsapp', { limiter: { max: 1, duration: 3000 } })
export class WhatsappProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsappService,
  ) {
    super();
  }

  async process(
    job: Job<{ logId: string; tenantId: string; accountId?: string | null; phone: string; text: string }>,
  ) {
    const { logId, tenantId, accountId, phone, text } = job.data;

    try {
      // Sends from the parent's own SIM, or another connected SIM if that one is down
      const result = await this.whatsappService.sendText(tenantId, accountId || null, phone, text);
      await this.prisma.whatsappMessageLog.update({
        where: { id: logId },
        data: {
          status: 'sent',
          sentAt: new Date(),
          errorText: null,
          waMessageId: result.messageId,
          accountId: result.accountId,
        },
      });
    } catch (error: any) {
      const message = error?.message || 'Unknown error';
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 1);
      const permanent = message.includes('not on WhatsApp');

      await this.prisma.whatsappMessageLog.update({
        where: { id: logId },
        data: { status: finalAttempt || permanent ? 'failed' : 'retry', errorText: message },
      });

      if (!permanent) throw error;
    }
  }
}
