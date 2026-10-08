import { Module } from '@nestjs/common';
import { BiometricService } from './biometric.service';
import { BiometricController } from './biometric.controller';
import { AdmsController } from './adms.controller';
import { PrismaModule } from '../../common/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, TelegramModule, WhatsappModule],
  controllers: [BiometricController, AdmsController],
  providers: [BiometricService],
  exports: [BiometricService],
})
export class BiometricModule {}
