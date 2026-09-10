import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { ACCESS_TOKEN_COOKIE } from './cookie.util';
import { requireJwtSecret } from './jwt-secrets.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: (req: Request) => req?.cookies?.[ACCESS_TOKEN_COOKIE] ?? null,
      ignoreExpiration: false,
      secretOrKey: requireJwtSecret(configService, 'JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    if (typeof payload.sub !== 'string') {
      throw new UnauthorizedException('Invalid access token');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        name: true,
        isActive: true,
        sessionVersion: true,
      },
    });
    if (!user?.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }
    // Tokens issued before this field existed are version 0, preserving
    // existing sessions until the user explicitly revokes all sessions.
    const tokenSessionVersion = payload.sessionVersion ?? 0;
    if (tokenSessionVersion !== user.sessionVersion) {
      throw new UnauthorizedException('Session has been revoked');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      exp: payload.exp,
    };
  }
}
