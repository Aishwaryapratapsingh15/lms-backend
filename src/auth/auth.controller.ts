import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { CsrfTokenService } from './csrf.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RateLimit } from '../common/decorators/rate-limit.decorator';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfTokenService: CsrfTokenService,
  ) {}

  @Get('csrf')
  @ApiOperation({
    summary: 'Issue a CSRF token for frontend-safe state-changing requests',
  })
  getCsrfToken() {
    return { csrfToken: this.csrfTokenService.generateToken() };
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 900)
  @ApiOperation({ summary: 'Login user and issue access + refresh tokens' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginDto: LoginDto, @Req() req: RequestWithUser) {
    const csrfToken = req.headers['x-csrf-token'];
    if (
      typeof csrfToken !== 'string' ||
      !this.csrfTokenService.validate(csrfToken)
    ) {
      throw new BadRequestException('Invalid CSRF token');
    }
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit(30, 60)
  @ApiOperation({
    summary: 'Rotate refresh token and issue a fresh access token',
  })
  async refresh(@Req() req: RequestWithUser) {
    const refreshToken = req.headers['x-refresh-token'];
    const csrfToken = req.headers['x-csrf-token'];
    if (typeof refreshToken !== 'string') {
      throw new BadRequestException('Missing refresh token');
    }
    if (
      typeof csrfToken !== 'string' ||
      !this.csrfTokenService.validate(csrfToken)
    ) {
      throw new BadRequestException('Invalid CSRF token');
    }
    return this.authService.refreshTokens(refreshToken);
  }

  @Post('forgot-password')
  @UseGuards(RateLimitGuard)
  @RateLimit(5, 900)
  @ApiOperation({ summary: 'Email a time-limited password reset link' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 900)
  @ApiOperation({ summary: 'Reset a password with an emailed token' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Change the authenticated user password' })
  changePassword(@Body() dto: ChangePasswordDto, @Req() req: RequestWithUser) {
    return this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Revoke the supplied refresh token' })
  logout(@Req() req: RequestWithUser) {
    const refreshToken = req.headers['x-refresh-token'];
    if (typeof refreshToken !== 'string')
      throw new BadRequestException('Missing refresh token');
    return this.authService.logout(refreshToken);
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Revoke all refresh tokens for the authenticated user',
  })
  logoutAll(@Req() req: RequestWithUser) {
    return this.authService.logoutAll(req.user.id);
  }
}
