import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import { CSRF_TOKEN_COOKIE } from '../../auth/cookie.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const cookieToken = req.cookies?.[CSRF_TOKEN_COOKIE];
    const headerToken = req.headers['x-csrf-token'];

    if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') {
      throw new ForbiddenException('Missing CSRF token');
    }

    const a = Buffer.from(cookieToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
