import { IsString, IsNotEmpty, Length, IsUUID, IsOptional, IsIP } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  student_code: string;

  @IsString()
  @Length(4, 6)
  pin: string;

  @IsUUID()
  branch_id: string;

  @IsOptional()
  @IsString()
  kiosk_ip?: string;
}

export class CheckOutDto {
  @IsString()
  @IsNotEmpty()
  student_code: string;

  @IsString()
  @Length(4, 6)
  pin: string;

  @IsUUID()
  branch_id: string;

  @IsOptional()
  @IsString()
  kiosk_ip?: string;
}

export class VerifyDto {
  @IsString()
  @IsNotEmpty()
  student_code: string;

  @IsString()
  @Length(4, 6)
  pin: string;
}
