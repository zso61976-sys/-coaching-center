import { Body, Controller, Delete, Get, Param, Post, Put, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SimRole, WhatsappService } from './whatsapp.service';
import { WhatsappBroadcastService } from './whatsapp-broadcast.service';

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

class BroadcastPreviewDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one class' })
  @IsString({ each: true })
  classes: string[];

  @IsOptional()
  @IsBoolean()
  onlyWelcomed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  // Empty = start right away
  @IsOptional()
  @IsDateString()
  startAt?: string;
}

class CreateBroadcastDto extends BroadcastPreviewDto {
  @IsString()
  @MaxLength(1000)
  declare message: string;
}

@Controller('admin/whatsapp')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class WhatsappController {
  constructor(
    private whatsappService: WhatsappService,
    private broadcastService: WhatsappBroadcastService,
  ) {}

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

  @Get('number-problems')
  async getNumberProblems(@Request() req: any) {
    return { success: true, data: await this.whatsappService.getNumberProblems(req.user.tenantId) };
  }

  @Post('save-contacts')
  async saveAllContacts(@Request() req: any) {
    return this.whatsappService.saveAllContacts(req.user.tenantId);
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

  @Get('broadcast/classes')
  async getBroadcastClasses(@Request() req: any) {
    return { success: true, data: await this.broadcastService.getClasses(req.user.tenantId) };
  }

  @Post('broadcast/preview')
  async previewBroadcast(@Request() req: any, @Body() dto: BroadcastPreviewDto) {
    return {
      success: true,
      data: await this.broadcastService.preview(req.user.tenantId, dto.classes, dto.onlyWelcomed ?? true, dto.message, dto.startAt),
    };
  }

  @Get('broadcasts')
  async listBroadcasts(@Request() req: any) {
    return { success: true, data: await this.broadcastService.list(req.user.tenantId) };
  }

  @Post('broadcasts')
  async createBroadcast(@Request() req: any, @Body() dto: CreateBroadcastDto) {
    const broadcast = await this.broadcastService.create(req.user.tenantId, req.user.userId || null, {
      message: dto.message,
      classes: dto.classes,
      onlyWelcomed: dto.onlyWelcomed ?? true,
      startAt: dto.startAt,
    });
    return { success: true, data: broadcast };
  }

  @Post('broadcasts/:id/cancel')
  async cancelBroadcast(@Request() req: any, @Param('id') id: string) {
    return this.broadcastService.cancel(req.user.tenantId, id);
  }

  @Get('logs')
  async getLogs(@Request() req: any) {
    return { success: true, data: await this.whatsappService.getLogs(req.user.tenantId) };
  }
}
