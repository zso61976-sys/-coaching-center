import { Controller, Post, Body, Headers, UnauthorizedException, Ip } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KioskService } from './kiosk.service';
import { CheckInDto, CheckOutDto, VerifyDto } from './dto/kiosk.dto';

@Controller('kiosk')
export class KioskController {
  constructor(
    private kioskService: KioskService,
    private configService: ConfigService,
  ) {}

  private validateKioskSecret(secret: string) {
    const validSecret = this.configService.get<string>('KIOSK_SECRET_KEY');
    if (!secret || secret !== validSecret) {
      throw new UnauthorizedException('Invalid kiosk secret');
    }
  }

  private getTenantId(): string {
    // For MVP, use default tenant. In production, extract from subdomain or header
    return this.configService.get<string>('DEFAULT_TENANT_ID') || 'default-tenant-id';
  }

  @Post('checkin')
  async checkIn(
    @Body() dto: CheckInDto,
    @Headers('x-kiosk-secret') kioskSecret: string,
    @Ip() ip: string,
  ) {
    this.validateKioskSecret(kioskSecret);
    dto.kiosk_ip = ip;
    return this.kioskService.checkIn(dto, this.getTenantId());
  }

  @Post('checkout')
  async checkOut(
    @Body() dto: CheckOutDto,
    @Headers('x-kiosk-secret') kioskSecret: string,
    @Ip() ip: string,
  ) {
    this.validateKioskSecret(kioskSecret);
    dto.kiosk_ip = ip;
    return this.kioskService.checkOut(dto, this.getTenantId());
  }

  @Post('verify')
  async verify(
    @Body() dto: VerifyDto,
    @Headers('x-kiosk-secret') kioskSecret: string,
  ) {
    this.validateKioskSecret(kioskSecret);
    return this.kioskService.verify(dto, this.getTenantId());
  }
}
