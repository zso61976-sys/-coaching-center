import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SuperAdminService } from './super-admin.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

class CreateCompanyDto {
  @IsString()
  name: string;

  @IsString()
  @MinLength(3)
  code: string;

  @IsEmail()
  adminEmail: string;

  @IsString()
  @MinLength(8)
  adminPassword: string;

  @IsString()
  adminFullName: string;
}

class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  settings?: any;
}

class CreateCompanyUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  fullName: string;

  @IsString()
  role: string;
}

@Controller('super-admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('super_admin')
export class SuperAdminController {
  constructor(private superAdminService: SuperAdminService) {}

  @Post('companies')
  async createCompany(@Body() dto: CreateCompanyDto) {
    return this.superAdminService.createCompany(dto);
  }

  @Get('companies')
  async listCompanies(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.superAdminService.listCompanies({
      search,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('companies/:id')
  async getCompany(@Param('id') id: string) {
    return this.superAdminService.getCompany(id);
  }

  @Put('companies/:id')
  async updateCompany(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.superAdminService.updateCompany(id, dto);
  }

  @Patch('companies/:id/status')
  async updateCompanyStatus(
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.superAdminService.updateCompanyStatus(id, status);
  }

  @Get('stats')
  async getGlobalStats() {
    return this.superAdminService.getGlobalStats();
  }

  @Post('companies/:id/users')
  async createCompanyUser(
    @Param('id') companyId: string,
    @Body() dto: CreateCompanyUserDto,
  ) {
    return this.superAdminService.createCompanyUser(companyId, dto);
  }
}
