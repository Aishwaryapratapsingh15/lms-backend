import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { requireJwtSecret } from './jwt-secrets.util';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class RefreshTokenService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async createRefreshToken(userId: string, db: Db = this.prisma): Promise<string> {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    // jti guarantees two tokens for the same user are never byte-identical —
    // without it, signing twice within the same wall-clock second (same
    // `iat`) for the same user/secret/TTL/issuer produces the exact same JWT
    // string, tripping the unique constraint on RefreshToken.token.
    const token = this.jwtService.sign(
      { sub: userId, type: 'REFRESH', jti: randomUUID() } as any,
      {
        secret: requireJwtSecret(this.configService, 'JWT_REFRESH_SECRET'),
        expiresIn: (this.configService.get<string>('JWT_REFRESH_TTL') ||
          '7d') as any,
        issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
      } as any,
    );

    await db.refreshToken.create({
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
        secret: requireJwtSecret(this.configService, 'JWT_REFRESH_SECRET'),
        issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
      });
    } catch {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    if (storedToken.revoked) {
      // This token was already rotated away by a legitimate refresh, so
      // seeing it presented again means it was copied/stolen and replayed.
      // Treat that as a compromise signal: kill every session for this
      // user (not just this token) rather than just rejecting the request.
      await this.revokeAllForUser(storedToken.userId);
      await this.prisma.user.update({
        where: { id: storedToken.userId },
        data: { sessionVersion: { increment: 1 } },
      });
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    if (new Date(storedToken.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }

    return payload;
  }

  async rotateRefreshToken(oldToken: string, userId: string): Promise<string> {
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: oldToken },
    });
    if (!existing) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Create the replacement before revoking the old one, atomically: if
    // either write fails, the transaction rolls back and the old token
    // stays valid instead of leaving the user with no working token.
    return this.prisma.$transaction(async (tx) => {
      const newToken = await this.createRefreshToken(userId, tx);
      await tx.refreshToken.update({
        where: { token: oldToken },
        data: { revoked: true },
      });
      return newToken;
    });
  }

  async revokeToken(token: string) {
    await this.prisma.refreshToken.updateMany({
      where: { token },
      data: { revoked: true },
    });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }
}
