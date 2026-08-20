import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenService } from './refresh-token.service';
import { CsrfTokenService } from './csrf.service';
import { EmailModule } from '../email/email.module';
import { RateLimitGuard } from '../common/guards/rate-limit.guard';

@Module({
  imports: [PassportModule, JwtModule.register({}), EmailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RefreshTokenService,
    CsrfTokenService,
    RateLimitGuard,
  ],
  exports: [AuthService, RefreshTokenService, CsrfTokenService],
})
export class AuthModule {}
