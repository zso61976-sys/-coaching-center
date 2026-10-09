import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SimRole, WhatsappService } from './whatsapp.service';

class UpdateWhatsappSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  welcomeEnabled?: boolean;

  @IsOptional()
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  timeZone?: string;
}

class CreateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsIn(['balance', 'backup'])
  role?: SimRole;
}

class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsIn(['balance', 'backup'])
  role?: SimRole;
}

class TestMessageDto {
  @IsString()
  phone: string;

  @IsOptional()
  @IsUUID()
  accountId?: string;
}

@Controller('admin/whatsapp')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class WhatsappController {
  constructor(private whatsappService: WhatsappService) {}

  @Get('status')
  async getStatus(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const [accounts, settings, today] = await Promise.all([
      this.whatsappService.listAccounts(tenantId),
      this.whatsappService.getSettings(tenantId),
      this.whatsappService.getTodaySummary(tenantId),
    ]);
    return { success: true, data: { accounts, settings, today } };
  }

  @Post('accounts')
  async createAccount(@Request() req: any, @Body() dto: CreateAccountDto) {
    return { success: true, data: await this.whatsappService.createAccount(req.user.tenantId, dto.label, dto.role) };
  }

  @Put('accounts/:id')
  async updateAccount(@Request() req: any, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return {
      success: true,
      data: await this.whatsappService.updateAccount(req.user.tenantId, id, dto),
    };
  }

  @Delete('accounts/:id')
  async deleteAccount(@Request() req: any, @Param('id') id: string) {
    return this.whatsappService.deleteAccount(req.user.tenantId, id);
  }

  @Post('accounts/:id/connect')
  async connect(@Request() req: any, @Param('id') id: string) {
    await this.whatsappService.connect(req.user.tenantId, id);
    return { success: true };
  }

  @Post('accounts/:id/logout')
  async logout(@Request() req: any, @Param('id') id: string) {
    return this.whatsappService.logout(req.user.tenantId, id);
  }

  @Post('rebalance')
  async rebalance(@Request() req: any) {
    return this.whatsappService.rebalance(req.user.tenantId);
  }

  @Post('welcome-pending')
  async sendPendingWelcomes(@Request() req: any) {
    return this.whatsappService.sendPendingWelcomes(req.user.tenantId);
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
    return this.whatsappService.sendTestMessage(req.user.tenantId, dto.phone, dto.accountId);
  }

  @Get('logs')
  async getLogs(@Request() req: any) {
    return { success: true, data: await this.whatsappService.getLogs(req.user.tenantId) };
  }
}
