import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SuperAdminService {
  constructor(private prisma: PrismaService) {}

  async createCompany(data: {
    name: string;
    code: string;
    adminEmail: string;
    adminPassword: string;
    adminFullName: string;
  }) {
    // Check if code already exists
    const existing = await this.prisma.tenant.findUnique({
      where: { code: data.code.toUpperCase() },
    });

    if (existing) {
      throw new ConflictException('Company code already exists');
    }

    // Check if email exists in any tenant
    const existingEmail = await this.prisma.user.findFirst({
      where: { email: data.adminEmail },
    });

    if (existingEmail) {
      throw new ConflictException('Email is already registered');
    }

    // Create tenant and admin user in transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create tenant
      const tenant = await prisma.tenant.create({
        data: {
          name: data.name,
          code: data.code.toUpperCase(),
          status: 'active',
          settings: {},
        },
      });

      // Create default branch
      const branch = await prisma.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'Main Branch',
          status: 'active',
        },
      });

      // Create admin user for the tenant
      const passwordHash = await bcrypt.hash(data.adminPassword, 12);
      const adminUser = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: data.adminEmail,
          passwordHash,
          fullName: data.adminFullName,
          role: 'admin',
          status: 'active',
        },
      });

      return { tenant, branch, adminUser };
    });

    return {
      success: true,
      data: {
        company: {
          id: result.tenant.id,
          name: result.tenant.name,
          code: result.tenant.code,
        },
        admin: {
          id: result.adminUser.id,
          email: result.adminUser.email,
          fullName: result.adminUser.fullName,
        },
      },
    };
  }

  async listCompanies(options?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (options?.status) where.status = options.status;
    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { code: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: {
            select: {
              students: true,
              users: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    return {
      success: true,
      data: {
        companies: companies.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          status: c.status,
          studentCount: c._count.students,
          userCount: c._count.users,
          createdAt: c.createdAt,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getCompany(id: string) {
    const company = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            students: true,
            users: true,
            branches: true,
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return {
      success: true,
      data: {
        id: company.id,
        name: company.name,
        code: company.code,
        status: company.status,
        settings: company.settings,
        createdAt: company.createdAt,
        stats: {
          students: company._count.students,
          users: company._count.users,
          branches: company._count.branches,
        },
        users: company.users,
      },
    };
  }

  async updateCompany(
    id: string,
    data: { name?: string; status?: string; settings?: any },
  ) {
    const company = await this.prisma.tenant.findUnique({ where: { id } });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: {
        name: data.name ?? company.name,
        status: data.status ?? company.status,
        settings: data.settings ?? company.settings,
      },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        code: updated.code,
        status: updated.status,
      },
    };
  }

  async updateCompanyStatus(id: string, status: string) {
    const company = await this.prisma.tenant.findUnique({ where: { id } });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status },
    });

    return {
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        status: updated.status,
      },
    };
  }

  async getGlobalStats() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalCompanies,
      activeCompanies,
      totalStudents,
      totalUsers,
      todayAttendance,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.student.count(),
      this.prisma.user.count({ where: { role: { not: 'super_admin' } } }),
      this.prisma.attendanceSession.count({
        where: {
          checkinTime: { gte: today },
        },
      }),
    ]);

    return {
      success: true,
      data: {
        companies: { total: totalCompanies, active: activeCompanies },
        students: { total: totalStudents },
        users: { total: totalUsers },
        todayAttendance,
      },
    };
  }

  async createCompanyUser(
    companyId: string,
    data: {
      email: string;
      password: string;
      fullName: string;
      role: string;
    },
  ) {
    const company = await this.prisma.tenant.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { email: data.email, tenantId: companyId },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists in this company');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: {
        tenantId: companyId,
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
        status: 'active',
      },
    });

    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}
