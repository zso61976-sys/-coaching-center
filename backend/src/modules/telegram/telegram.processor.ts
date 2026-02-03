import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../common/prisma.service';
import { TelegramService } from './telegram.service';

@Processor('telegram')
export class TelegramProcessor extends WorkerHost {
  constructor(
    private prisma: PrismaService,
    private telegramService: TelegramService,
  ) {
    super();
  }

  async process(job: Job<{ logId: string; chatId: string; text: string }>) {
    const { logId, chatId, text } = job.data;

    try {
      const result = await this.telegramService.sendMessage(chatId, text);

      if (result.success) {
        await this.prisma.telegramMessageLog.update({
          where: { id: logId },
          data: {
            status: 'sent',
            telegramMessageId: result.messageId,
            sentAt: new Date(),
          },
        });
      } else {
        // Check if bot was blocked
        if (result.error?.includes('blocked') || result.error?.includes('chat not found')) {
          // Mark parent as disconnected
          const log = await this.prisma.telegramMessageLog.findUnique({
            where: { id: logId },
          });

          if (log) {
            await this.prisma.parent.updateMany({
              where: {
                id: log.parentId,
                telegramChatId: chatId,
              },
              data: {
                telegramChatId: null,
                telegramConnectedAt: null,
              },
            });
          }

          await this.prisma.telegramMessageLog.update({
            where: { id: logId },
            data: {
              status: 'failed',
              errorText: result.error,
              retryCount: job.attemptsMade,
            },
          });

          // Don't retry if blocked
          return;
        }

        // Update retry count
        await this.prisma.telegramMessageLog.update({
          where: { id: logId },
          data: {
            status: 'retry',
            errorText: result.error,
            retryCount: job.attemptsMade,
          },
        });

        throw new Error(result.error);
      }
    } catch (error: any) {
      // Final failure
      if (job.attemptsMade >= (job.opts.attempts || 4)) {
        await this.prisma.telegramMessageLog.update({
          where: { id: logId },
          data: {
            status: 'failed',
            errorText: error.message,
            retryCount: job.attemptsMade,
          },
        });
      }
      throw error;
    }
  }
}
