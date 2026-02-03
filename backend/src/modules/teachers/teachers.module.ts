import { Module } from '@nestjs/common';
import { TeachersController, SchedulesController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  controllers: [TeachersController, SchedulesController],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
