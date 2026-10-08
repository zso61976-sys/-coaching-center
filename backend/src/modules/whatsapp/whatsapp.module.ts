import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappProcessor } from './whatsapp.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'whatsapp',
    }),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService, WhatsappProcessor],
  exports: [WhatsappService],
})
export class WhatsappModule {}
