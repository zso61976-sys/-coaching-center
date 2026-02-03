import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string | null;
  companyCode?: string;
  companyName?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenant: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found or inactive');
    }

    // For non-super admin, verify tenant is still active
    if (user.tenantId && user.tenant && user.tenant.status !== 'active') {
      throw new UnauthorizedException('Company account is inactive');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      isSuperAdmin: payload.role === 'super_admin',
      companyCode: payload.companyCode || user.tenant?.code,
      companyName: payload.companyName || user.tenant?.name,
    };
  }
}
