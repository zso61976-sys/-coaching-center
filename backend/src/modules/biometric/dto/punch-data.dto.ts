import { IsString, IsOptional, IsDateString } from 'class-validator';

export class PunchDataDto {
  @IsString()
  SN: string;

  @IsString()
  PIN: string;

  @IsString()
  AttTime: string;

  @IsOptional()
  @IsString()
  Status?: string;

  @IsOptional()
  @IsString()
  Verify?: string;

  @IsOptional()
  @IsString()
  WorkCode?: string;

  @IsOptional()
  @IsString()
  Reserved1?: string;

  @IsOptional()
  @IsString()
  Reserved2?: string;
}

export class DeviceHandshakeDto {
  @IsString()
  SN: string;

  @IsOptional()
  @IsString()
  options?: string;

  @IsOptional()
  @IsString()
  pushver?: string;

  @IsOptional()
  @IsString()
  language?: string;
}

export class DeviceInfoDto {
  @IsString()
  SN: string;

  @IsOptional()
  @IsString()
  IPAddress?: string;

  @IsOptional()
  @IsString()
  FWVersion?: string;

  @IsOptional()
  @IsString()
  FPCount?: string;

  @IsOptional()
  @IsString()
  TransactionCount?: string;

  @IsOptional()
  @IsString()
  UserCount?: string;
}
