import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [SuperAdminController],
  providers: [SuperAdminService, PrismaService],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
