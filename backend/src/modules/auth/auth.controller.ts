import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

class LoginDto {
  @IsOptional()
  @IsString()
  company_code?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.company_code, dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async getMe(@Request() req: any) {
    return {
      success: true,
      data: {
        userId: req.user.userId,
        email: req.user.email,
        role: req.user.role,
        tenantId: req.user.tenantId,
        isSuperAdmin: req.user.isSuperAdmin,
        companyCode: req.user.companyCode,
        companyName: req.user.companyName,
      },
    };
  }
}
