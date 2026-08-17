import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RefreshTokenService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async createRefreshToken(userId: string): Promise<string> {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const token = this.jwtService.sign(
      { sub: userId, type: 'REFRESH' } as any,
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
        expiresIn: (this.configService.get<string>('JWT_REFRESH_TTL') || '7d') as any,
        issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
      } as any,
    );

    await this.prisma.refreshToken.create({
      data: {
        token,
        userId,
        type: 'REFRESH',
        expiresAt,
      },
    });

    return token;
  }

  async validateRefreshToken(token: string) {
    let payload: any;

    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'refresh-secret',
        issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken || storedToken.revoked || new Date(storedToken.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    return payload;
  }

  async rotateRefreshToken(oldToken: string, userId: string): Promise<string> {
    const existing = await this.prisma.refreshToken.findUnique({ where: { token: oldToken } });
    if (!existing) {
      throw new UnauthorizedException('Refresh token not found');
    }

    await this.prisma.refreshToken.update({
      where: { token: oldToken },
      data: { revoked: true },
    });

    return this.createRefreshToken(userId);
  }
}
