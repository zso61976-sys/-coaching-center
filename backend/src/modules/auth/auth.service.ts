import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcrypt';

const SUPER_ADMIN_CODE = 'SUPERADMIN';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(companyCode: string | undefined, email: string, password: string) {
    let user;
    let tenant = null;

    // Check if super admin login (empty code or SUPERADMIN)
    if (!companyCode || companyCode.toUpperCase() === SUPER_ADMIN_CODE) {
      // Super admin login - find user without tenantId
      user = await this.prisma.user.findFirst({
        where: {
          email,
          tenantId: null,
          role: 'super_admin',
        },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
    } else {
      // Regular user login - find tenant first
      tenant = await this.prisma.tenant.findUnique({
        where: { code: companyCode.toUpperCase() },
      });

      if (!tenant) {
        throw new NotFoundException('Company not found. Please check your company code.');
      }

      if (tenant.status !== 'active') {
        throw new UnauthorizedException('Company account is inactive. Please contact support.');
      }

      // Find user within tenant
      user = await this.prisma.user.findFirst({
        where: { email, tenantId: tenant.id },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is inactive. Please contact your administrator.');
    }

    // Build JWT payload
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      companyCode: tenant?.code || null,
      companyName: tenant?.name || null,
    };

    return {
      success: true,
      data: {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user.id,
          email: user.email,
          full_name: user.fullName,
          role: user.role,
          permissions: (user.permissions as string[]) || [],
          is_super_admin: user.role === 'super_admin',
        },
        company: tenant
          ? {
              id: tenant.id,
              code: tenant.code,
              name: tenant.name,
            }
          : null,
      },
    };
  }

  // Legacy method for backward compatibility
  async validateUser(email: string, password: string, tenantId: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, tenantId },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is inactive');
    }

    return user;
  }

  async createUser(data: {
    tenantId?: string | null;
    email: string;
    password: string;
    fullName: string;
    role: string;
  }) {
    const passwordHash = await bcrypt.hash(data.password, 12);

    const user = await this.prisma.user.create({
      data: {
        tenantId: data.tenantId || null,
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
      },
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }
}
