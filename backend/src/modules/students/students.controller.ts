import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { StudentsService } from './students.service';
import { IsString, IsOptional, IsUUID, Length, IsEmail, IsDateString, IsArray, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class ParentDto {
  @IsString()
  full_name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  relationship: string;

  @IsBoolean()
  is_primary: boolean;

  @IsOptional()
  @IsString()
  telegram_chat_id?: string;
}

class CreateStudentDto {
  @IsString()
  student_code: string;

  @IsString()
  full_name: string;

  @IsUUID()
  branch_id: string;

  @IsOptional()
  @IsString()
  biometric_id?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsDateString()
  date_of_birth?: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParentDto)
  parents?: ParentDto[];
}

class UpdateParentDto {
  @IsString()
  fullName: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  relationship: string;

  @IsBoolean()
  isPrimary: boolean;

  @IsOptional()
  @IsString()
  telegramChatId?: string;
}

class UpdateStudentDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  device_ids?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateParentDto)
  parents?: UpdateParentDto[];
}

class ImportStudentItemDto {
  @IsString()
  student_code: string;

  @IsString()
  full_name: string;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  parent_name?: string;

  @IsOptional()
  @IsString()
  parent_phone?: string;

  @IsOptional()
  @IsString()
  telegram_chat_id?: string;
}

class ImportStudentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportStudentItemDto)
  students: ImportStudentItemDto[];
}

class ResetPinDto {
  @IsString()
  @Length(4, 6)
  new_pin: string;
}

@Controller('admin/students')
@UseGuards(AuthGuard('jwt'))
export class StudentsController {
  constructor(private studentsService: StudentsService) {}

  @Post()
  async create(@Body() dto: CreateStudentDto, @Request() req: any) {
    return this.studentsService.create({
      tenantId: req.user.tenantId,
      branchId: dto.branch_id,
      studentCode: dto.student_code,
      fullName: dto.full_name,
      attendanceId: dto.biometric_id,
      phone: dto.phone,
      email: dto.email,
      dateOfBirth: dto.date_of_birth ? new Date(dto.date_of_birth) : undefined,
      grade: dto.grade,
      parents: dto.parents?.map(p => ({
        fullName: p.full_name,
        phone: p.phone,
        email: p.email,
        relationship: p.relationship,
        isPrimary: p.is_primary,
      })),
      createdBy: req.user.userId,
    });
  }

  @Get()
  async findAll(
    @Query('branch_id') branchId: string,
    @Query('status') status: string,
    @Query('search') search: string,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Request() req: any,
  ) {
    return this.studentsService.findAll(req.user.tenantId, {
      branchId,
      status,
      search,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  @Post('import')
  async importStudents(@Body() dto: ImportStudentsDto, @Request() req: any) {
    return this.studentsService.bulkCreate(
      req.user.tenantId,
      '660e8400-e29b-41d4-a716-446655440002',
      dto.students.map(s => ({
        studentCode: s.student_code,
        fullName: s.full_name,
        grade: s.grade,
        phone: s.phone,
        parentName: s.parent_name,
        parentPhone: s.parent_phone,
        telegramChatId: s.telegram_chat_id,
      })),
      req.user.userId,
    );
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Request() req: any) {
    return this.studentsService.findById(id, req.user.tenantId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStudentDto, @Request() req: any) {
    return this.studentsService.update(id, req.user.tenantId, {
      fullName: dto.full_name,
      phone: dto.phone,
      email: dto.email,
      grade: dto.grade,
      status: dto.status,
      updatedBy: req.user.userId,
      deviceIds: dto.device_ids,
      parents: dto.parents,
    });
  }

  @Post(':id/reset-pin')
  async resetPin(@Param('id') id: string, @Body() dto: ResetPinDto, @Request() req: any) {
    return this.studentsService.resetPin(id, req.user.tenantId, dto.new_pin);
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @Request() req: any) {
    return this.studentsService.delete(id, req.user.tenantId);
  }
}
