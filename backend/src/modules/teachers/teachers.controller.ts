import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { TeachersService } from './teachers.service';
import { IsString, IsOptional, IsArray, IsBoolean, IsDateString } from 'class-validator';

class CreateTeacherDto {
  @IsString()
  teacher_code: string;

  @IsString()
  full_name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  attendance_id?: string;

  @IsOptional()
  salary?: number;

  @IsOptional()
  @IsArray()
  subjects?: string[];

  @IsOptional()
  @IsArray()
  classes?: string[];
}

class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  full_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  salary?: number;

  @IsOptional()
  @IsArray()
  subjects?: string[];

  @IsOptional()
  @IsArray()
  classes?: string[];

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  device_ids?: string[];
}

class CreateScheduleDto {
  @IsString()
  teacher_id: string;

  @IsString()
  subject_code: string;

  @IsString()
  class_grade: string;

  @IsOptional()
  @IsString()
  day_of_week?: string;

  @IsOptional()
  @IsDateString()
  schedule_date?: string;

  @IsString()
  start_time: string;

  @IsString()
  end_time: string;

  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;
}

class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  subject_code?: string;

  @IsOptional()
  @IsString()
  class_grade?: string;

  @IsOptional()
  @IsString()
  day_of_week?: string;

  @IsOptional()
  @IsDateString()
  schedule_date?: string;

  @IsOptional()
  @IsString()
  start_time?: string;

  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsBoolean()
  is_recurring?: boolean;

  @IsOptional()
  @IsString()
  status?: string;
}

@Controller('admin/teachers')
@UseGuards(AuthGuard('jwt'))
export class TeachersController {
  constructor(private teachersService: TeachersService) {}

  // Teacher CRUD
  @Post()
  async createTeacher(@Body() dto: CreateTeacherDto, @Request() req: any) {
    return this.teachersService.createTeacher({
      tenantId: req.user.tenantId,
      teacherCode: dto.teacher_code,
      fullName: dto.full_name,
      phone: dto.phone,
      salary: dto.salary,
      attendanceId: dto.attendance_id,
      subjects: dto.subjects || [],
      classes: dto.classes || [],
    });
  }

  @Get()
  async findAllTeachers(
    @Query('status') status: string,
    @Query('search') search: string,
    @Request() req: any,
  ) {
    return this.teachersService.findAllTeachers(req.user.tenantId, { status, search });
  }

  @Get(':id')
  async findTeacherById(@Param('id') id: string, @Request() req: any) {
    return this.teachersService.findTeacherById(id, req.user.tenantId);
  }

  @Put(':id')
  async updateTeacher(@Param('id') id: string, @Body() dto: UpdateTeacherDto, @Request() req: any) {
    return this.teachersService.updateTeacher(id, req.user.tenantId, {
      fullName: dto.full_name,
      phone: dto.phone,
      salary: dto.salary,
      subjects: dto.subjects,
      classes: dto.classes,
      status: dto.status,
      deviceIds: dto.device_ids,
    });
  }

  @Delete(':id')
  async deleteTeacher(@Param('id') id: string, @Request() req: any) {
    return this.teachersService.deleteTeacher(id, req.user.tenantId);
  }
}

@Controller('admin/schedules')
@UseGuards(AuthGuard('jwt'))
export class SchedulesController {
  constructor(private teachersService: TeachersService) {}

  @Post()
  async createSchedule(@Body() dto: CreateScheduleDto, @Request() req: any) {
    return this.teachersService.createSchedule({
      tenantId: req.user.tenantId,
      teacherId: dto.teacher_id,
      subjectCode: dto.subject_code,
      classGrade: dto.class_grade,
      dayOfWeek: dto.day_of_week,
      scheduleDate: dto.schedule_date ? new Date(dto.schedule_date) : undefined,
      startTime: dto.start_time,
      endTime: dto.end_time,
      isRecurring: dto.is_recurring ?? true,
    });
  }

  @Get()
  async findAllSchedules(
    @Query('teacher_id') teacherId: string,
    @Query('class_grade') classGrade: string,
    @Query('day_of_week') dayOfWeek: string,
    @Query('is_recurring') isRecurring: string,
    @Request() req: any,
  ) {
    return this.teachersService.findAllSchedules(req.user.tenantId, {
      teacherId,
      classGrade,
      dayOfWeek,
      isRecurring: isRecurring === 'true' ? true : isRecurring === 'false' ? false : undefined,
    });
  }

  @Put(':id')
  async updateSchedule(@Param('id') id: string, @Body() dto: UpdateScheduleDto, @Request() req: any) {
    return this.teachersService.updateSchedule(id, req.user.tenantId, {
      subjectCode: dto.subject_code,
      classGrade: dto.class_grade,
      dayOfWeek: dto.day_of_week,
      scheduleDate: dto.schedule_date ? new Date(dto.schedule_date) : undefined,
      startTime: dto.start_time,
      endTime: dto.end_time,
      isRecurring: dto.is_recurring,
      status: dto.status,
    });
  }

  @Delete(':id')
  async deleteSchedule(@Param('id') id: string, @Request() req: any) {
    return this.teachersService.deleteSchedule(id, req.user.tenantId);
  }
}
