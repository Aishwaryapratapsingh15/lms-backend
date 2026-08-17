import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from './refresh-token.service';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private refreshTokenService: RefreshTokenService,
  ) {}

  async validateUser(email: string, password: string): Promise<Omit<User, 'password'> | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) return null;

    const { password: _password, ...result } = user;
    return result;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.refreshTokenService.createRefreshToken(user.id);

    return {
      user,
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') || '15m',
    };
  }

  async refreshTokens(refreshToken: string) {
    const payload = await this.refreshTokenService.validateRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const accessToken = await this.generateAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });

    const newRefreshToken = await this.refreshTokenService.rotateRefreshToken(refreshToken, user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') || '15m',
    };
  }

  private async generateAccessToken(user: Partial<User> & { id: string; email: string; role: any }) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const expiresIn = this.configService.get<string>('JWT_ACCESS_TTL') || '15m';

    return this.jwtService.sign(payload as any, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET') || 'access-secret',
      expiresIn: expiresIn as any,
      issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
    } as any);
  }
}
