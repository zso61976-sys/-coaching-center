import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';
import { TelegramProcessor } from './telegram.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'telegram',
    }),
  ],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramProcessor],
  exports: [TelegramService],
})
export class TelegramModule {}
