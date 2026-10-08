import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { WhatsappService } from './whatsapp.service';

class UpdateWhatsappSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

class TestMessageDto {
  @IsString()
  phone: string;
}

@Controller('admin/whatsapp')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get('status')
  async getStatus(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return {
      success: true,
      data: {
        ...this.whatsappService.getStatus(tenantId),
        settings: await this.whatsappService.getSettings(tenantId),
      },
    };
  }

  @Post('connect')
  async connect(@Request() req: any) {
    await this.whatsappService.connect(req.user.tenantId);
    return { success: true, data: this.whatsappService.getStatus(req.user.tenantId) };
  }

  @Post('logout')
  async logout(@Request() req: any) {
    return this.whatsappService.logout(req.user.tenantId);
  }

  @Put('settings')
  async updateSettings(@Request() req: any, @Body() dto: UpdateWhatsappSettingsDto) {
    return {
      success: true,
      data: await this.whatsappService.updateSettings(req.user.tenantId, dto),
    };
  }

  @Post('test')
  async sendTest(@Request() req: any, @Body() dto: TestMessageDto) {
    return this.whatsappService.sendTestMessage(req.user.tenantId, dto.phone);
  }

  @Get('logs')
  async getLogs(@Request() req: any) {
    return { success: true, data: await this.whatsappService.getLogs(req.user.tenantId) };
  }
}
