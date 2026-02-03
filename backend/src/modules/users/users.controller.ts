import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsString, IsEmail, MinLength, IsOptional, IsArray } from 'class-validator';

class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  fullName: string;

  @IsString()
  role: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];
}

class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  role?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  permissions?: string[];
}

class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  newPassword: string;
}

@Controller('admin/users')
@UseGuards(AuthGuard('jwt'), RolesGuard, TenantGuard)
@Roles('admin')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  async listUsers(
    @Request() req: any,
    @Query('search') search?: string,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.listUsers(req.user.tenantId, {
      search,
      role,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('roles')
  async getRoles() {
    return this.usersService.getRolesList();
  }

  @Get(':id')
  async getUser(@Request() req: any, @Param('id') id: string) {
    return this.usersService.getUser(req.user.tenantId, id);
  }

  @Post()
  async createUser(@Request() req: any, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(req.user.tenantId, req.user.role, dto);
  }

  @Put(':id')
  async updateUser(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    // Prevent self-modification of role
    if (id === req.user.userId && dto.role) {
      throw new ForbiddenException('Cannot change your own role');
    }
    return this.usersService.updateUser(req.user.tenantId, id, req.user.role, dto);
  }

  @Patch(':id/reset-password')
  async resetPassword(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.usersService.resetPassword(req.user.tenantId, id, dto.newPassword);
  }

  @Delete(':id')
  async deleteUser(@Request() req: any, @Param('id') id: string) {
    if (id === req.user.userId) {
      throw new ForbiddenException('Cannot delete yourself');
    }
    return this.usersService.deleteUser(req.user.tenantId, id, req.user.role);
  }
}
