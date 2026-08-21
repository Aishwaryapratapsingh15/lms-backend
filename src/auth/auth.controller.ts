import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { Request, Response } from 'express';
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
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  CSRF_TOKEN_COOKIE,
  buildAccessTokenCookieOptions,
  buildRefreshTokenCookieOptions,
  buildCsrfCookieOptions,
  clearCookieOptions,
} from './cookie.util';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfTokenService: CsrfTokenService,
    private readonly configService: ConfigService,
  ) {}

  private setCsrfCookie(res: Response): string {
    const csrfToken = this.csrfTokenService.generateToken();
    res.cookie(
      CSRF_TOKEN_COOKIE,
      csrfToken,
      buildCsrfCookieOptions(this.configService),
    );
    return csrfToken;
  }

  private setSessionCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      buildAccessTokenCookieOptions(this.configService),
    );
    res.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      buildRefreshTokenCookieOptions(this.configService),
    );
  }

  private clearSessionCookies(res: Response) {
    res.clearCookie(
      ACCESS_TOKEN_COOKIE,
      clearCookieOptions(buildAccessTokenCookieOptions(this.configService)),
    );
    res.clearCookie(
      REFRESH_TOKEN_COOKIE,
      clearCookieOptions(buildRefreshTokenCookieOptions(this.configService)),
    );
    res.clearCookie(
      CSRF_TOKEN_COOKIE,
      clearCookieOptions(buildCsrfCookieOptions(this.configService)),
    );
  }

  @Get('csrf')
  @ApiOperation({
    summary: 'Issue a CSRF token cookie for frontend-safe state-changing requests',
  })
  getCsrfToken(@Res({ passthrough: true }) res: Response) {
    return { csrfToken: this.setCsrfCookie(res) };
  }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit(10, 900)
  @ApiOperation({ summary: 'Login user and set access + refresh cookies' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken, expiresIn } =
      await this.authService.login(loginDto);
    this.setSessionCookies(res, accessToken, refreshToken);
    const csrfToken = this.setCsrfCookie(res);
    return { user, csrfToken, expiresIn };
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit(30, 60)
  @ApiOperation({
    summary: 'Rotate refresh cookie and issue a fresh access cookie',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken !== 'string') {
      throw new UnauthorizedException('Missing refresh token');
    }
    const { user, accessToken, refreshToken: rotated, expiresIn } =
      await this.authService.refreshTokens(refreshToken);
    this.setSessionCookies(res, accessToken, rotated);
    const csrfToken = this.setCsrfCookie(res);
    return { user, csrfToken, expiresIn };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Return the currently authenticated user' })
  async me(@Req() req: RequestWithUser) {
    const user = await this.authService.getProfile(req.user.id);
    return { user, expiresAt: req.user.exp * 1000 };
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
  @ApiOperation({ summary: 'Revoke the current session and clear cookies' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof refreshToken !== 'string')
      throw new BadRequestException('Missing refresh token');
    const result = await this.authService.logout(refreshToken);
    this.clearSessionCookies(res);
    return result;
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Revoke all refresh tokens for the authenticated user',
  })
  async logoutAll(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.logoutAll(req.user.id);
    this.clearSessionCookies(res);
    return result;
  }
}
