import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { RefreshTokenService } from './refresh-token.service';
import { LoginDto } from './dto/login.dto';
import { User } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { EmailService } from '../email/email.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private refreshTokenService: RefreshTokenService,
    private emailService: EmailService,
  ) {}

  async validateUser(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
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
    const refreshToken = await this.refreshTokenService.createRefreshToken(
      user.id,
    );

    return {
      user,
      accessToken,
      refreshToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') || '15m',
    };
  }

  async refreshTokens(refreshToken: string) {
    const payload =
      await this.refreshTokenService.validateRefreshToken(refreshToken);

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
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

    const newRefreshToken = await this.refreshTokenService.rotateRefreshToken(
      refreshToken,
      user.id,
    );

    const { password: _password, ...safeUser } = user;

    return {
      user: safeUser,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.configService.get<string>('JWT_ACCESS_TTL') || '15m',
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }
    const password = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { password } }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      }),
    ]);
    return { message: 'Password changed. Please sign in again.' };
  }

  async requestPasswordReset(emailInput: string) {
    const email = emailInput.trim().toLowerCase();
    const genericResponse = {
      message:
        'If an active account exists for this email, a password reset link has been sent.',
    };
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user?.isActive) return genericResponse;

    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetRecord = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({
        where: { userId: user.id, usedAt: null },
      });
      return tx.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        },
      });
    });
    const resetBaseUrl =
      this.configService.get<string>('PASSWORD_RESET_URL') ||
      `${this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000'}/reset-password`;
    const resetUrl = `${resetBaseUrl}?token=${encodeURIComponent(token)}`;
    try {
      await this.emailService.sendSystemEmail(
        user.email,
        'Reset your LMS password',
        `<p>Hello ${user.name},</p><p>Your password reset link is valid for 30 minutes:</p><p><a href="${resetUrl}">Reset password</a></p><p>If you did not request this, ignore this email.</p>`,
      );
    } catch (error) {
      await this.prisma.passwordResetToken.delete({
        where: { id: resetRecord.id },
      });
      this.logger.error(
        `Unable to send password reset email for user ${user.id}`,
        error,
      );
    }
    return genericResponse;
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (
      !resetToken ||
      resetToken.usedAt ||
      resetToken.expiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'Password reset token is invalid or expired',
      );
    }
    const password = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { password },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revoked: false },
        data: { revoked: true },
      }),
    ]);
    return { message: 'Password reset successfully. Please sign in.' };
  }

  async logout(refreshToken: string) {
    await this.refreshTokenService.revokeToken(refreshToken);
    return { message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.refreshTokenService.revokeAllForUser(userId);
    return { message: 'Logged out from all devices' };
  }

  private async generateAccessToken(
    user: Partial<User> & { id: string; email: string; role: any },
  ) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };

    const expiresIn = this.configService.get<string>('JWT_ACCESS_TTL') || '15m';

    return this.jwtService.sign(
      payload as any,
      {
        secret:
          this.configService.get<string>('JWT_ACCESS_SECRET') ||
          'access-secret',
        expiresIn: expiresIn as any,
        issuer: this.configService.get<string>('JWT_ISSUER') || 'lms-backend',
      } as any,
    );
  }
}
