import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listUsers(
    tenantId: string,
    options?: {
      search?: string;
      role?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    if (options?.role) where.role = options.role;
    if (options?.status) where.status = options.status;
    if (options?.search) {
      where.OR = [
        { email: { contains: options.search, mode: 'insensitive' } },
        { fullName: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          permissions: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  }

  async getUser(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return { success: true, data: user };
  }

  async createUser(
    tenantId: string,
    creatorRole: string,
    data: {
      email: string;
      password: string;
      fullName: string;
      role: string;
      permissions?: string[];
    },
  ) {
    // Validate role hierarchy - can only create users with lower roles
    const roleHierarchy = ['admin', 'manager', 'staff', 'viewer'];
    const creatorIndex = roleHierarchy.indexOf(creatorRole);
    const newUserIndex = roleHierarchy.indexOf(data.role);

    if (newUserIndex <= creatorIndex && creatorRole !== 'admin') {
      throw new ForbiddenException('Cannot create user with equal or higher role');
    }

    // Check if email already exists in this tenant
    const existingUser = await this.prisma.user.findFirst({
      where: { email: data.email, tenantId },
    });

    if (existingUser) {
      throw new ConflictException('Email already exists in this company');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: data.email,
        passwordHash,
        fullName: data.fullName,
        role: data.role,
        permissions: data.permissions || [],
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        status: true,
        createdAt: true,
      },
    });

    return { success: true, data: user };
  }

  async updateUser(
    tenantId: string,
    userId: string,
    updaterRole: string,
    data: {
      fullName?: string;
      role?: string;
      status?: string;
      permissions?: string[];
    },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate role change if role is being updated
    if (data.role) {
      const roleHierarchy = ['admin', 'manager', 'staff', 'viewer'];
      const updaterIndex = roleHierarchy.indexOf(updaterRole);
      const currentUserIndex = roleHierarchy.indexOf(user.role);
      const newRoleIndex = roleHierarchy.indexOf(data.role);

      // Cannot modify users with equal or higher role (unless admin)
      if (currentUserIndex <= updaterIndex && updaterRole !== 'admin') {
        throw new ForbiddenException('Cannot modify user with equal or higher role');
      }

      // Cannot promote to equal or higher role (unless admin)
      if (newRoleIndex <= updaterIndex && updaterRole !== 'admin') {
        throw new ForbiddenException('Cannot assign equal or higher role');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        fullName: data.fullName ?? user.fullName,
        role: data.role ?? user.role,
        status: data.status ?? user.status,
        permissions: data.permissions !== undefined ? data.permissions : undefined,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        permissions: true,
        status: true,
        updatedAt: true,
      },
    });

    return { success: true, data: updated };
  }

  async resetPassword(tenantId: string, userId: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true, message: 'Password updated successfully' };
  }

  async deleteUser(tenantId: string, userId: string, deleterRole: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Cannot delete users with equal or higher role (unless admin)
    const roleHierarchy = ['admin', 'manager', 'staff', 'viewer'];
    const deleterIndex = roleHierarchy.indexOf(deleterRole);
    const userIndex = roleHierarchy.indexOf(user.role);

    if (userIndex <= deleterIndex && deleterRole !== 'admin') {
      throw new ForbiddenException('Cannot delete user with equal or higher role');
    }

    // Soft delete by setting status to 'deleted'
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'deleted' },
    });

    return { success: true, message: 'User deleted successfully' };
  }

  async getRolesList() {
    return {
      success: true,
      data: [
        { value: 'admin', label: 'Admin', description: 'Full access to all features' },
        { value: 'manager', label: 'Manager', description: 'Can manage students, teachers, and attendance' },
        { value: 'staff', label: 'Staff', description: 'Can view and manage students and attendance' },
        { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
      ],
    };
  }
}
