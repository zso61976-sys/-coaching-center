import { Controller, Get, Post, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ParentsService } from './parents.service';
import { IsBoolean, IsString } from 'class-validator';

class ToggleNotificationsDto {
  @IsBoolean()
  enabled: boolean;
}

class ManualTelegramConnectDto {
  @IsString()
  chatId: string;
}

@Controller('admin/parents')
@UseGuards(AuthGuard('jwt'))
export class ParentsController {
  constructor(private parentsService: ParentsService) {}

  @Get()
  async findAll(
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    return this.parentsService.findAll(req.user.tenantId, {
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.parentsService.findById(id, req.user.tenantId);
  }

  @Post(':id/telegram/generate-link')
  async generateTelegramLink(@Param('id') id: string, @Request() req: any) {
    return this.parentsService.generateTelegramLink(id, req.user.tenantId);
  }

  @Post(':id/telegram/disconnect')
  async disconnectTelegram(@Param('id') id: string, @Request() req: any) {
    return this.parentsService.disconnectTelegram(id, req.user.tenantId);
  }

  @Post(':id/telegram/manual-connect')
  async manualTelegramConnect(
    @Param('id') id: string,
    @Body() dto: ManualTelegramConnectDto,
    @Request() req: any,
  ) {
    return this.parentsService.manualTelegramConnect(id, req.user.tenantId, dto.chatId);
  }

  @Post(':id/notifications')
  async toggleNotifications(
    @Param('id') id: string,
    @Body() dto: ToggleNotificationsDto,
    @Request() req: any,
  ) {
    return this.parentsService.toggleNotifications(id, req.user.tenantId, dto.enabled);
  }
}
