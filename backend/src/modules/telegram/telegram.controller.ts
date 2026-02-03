import { Controller, Post, Body, Headers, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

@Controller('telegram')
export class TelegramController {
  constructor(
    private telegramService: TelegramService,
    private configService: ConfigService,
  ) {}

  @Post('webhook')
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
  ) {
    const webhookSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');

    if (webhookSecret && secretToken !== webhookSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    return this.telegramService.handleWebhook(update);
  }
}
