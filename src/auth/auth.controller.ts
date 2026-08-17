import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RequestWithUser } from '../common/interfaces/request-with-user.interface';
import { CsrfTokenService } from './csrf.service';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly csrfTokenService: CsrfTokenService,
  ) {}

  @Get('csrf')
  @ApiOperation({ summary: 'Issue a CSRF token for frontend-safe state-changing requests' })
  getCsrfToken() {
    return { csrfToken: this.csrfTokenService.generateToken() };
  }

  @Post('login')
  @ApiOperation({ summary: 'Login user and issue access + refresh tokens' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() loginDto: LoginDto, @Req() req: RequestWithUser) {
    const csrfToken = req.headers['x-csrf-token'];
    if (typeof csrfToken !== 'string' || !this.csrfTokenService.validate(csrfToken)) {
      throw new Error('Invalid CSRF token');
    }
    return this.authService.login(loginDto);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Rotate refresh token and issue a fresh access token' })
  async refresh(@Req() req: RequestWithUser) {
    const refreshToken = req.headers['x-refresh-token'];
    const csrfToken = req.headers['x-csrf-token'];
    if (typeof refreshToken !== 'string') {
      throw new Error('Missing refresh token');
    }
    if (typeof csrfToken !== 'string' || !this.csrfTokenService.validate(csrfToken)) {
      throw new Error('Invalid CSRF token');
    }
    return this.authService.refreshTokens(refreshToken);
  }
}
