import { IsString, IsUUID, MaxLength } from 'class-validator';

export class EnrollStudentDto {
  @IsUUID()
  deviceId: string;

  @IsUUID()
  studentId: string;

  @IsString()
  @MaxLength(50)
  deviceUserId: string;
}

export class BulkEnrollDto {
  @IsUUID()
  deviceId: string;

  enrollments: {
    studentId: string;
    deviceUserId: string;
  }[];
}
