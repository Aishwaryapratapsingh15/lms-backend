import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const now = new Date();
    const route = request.route?.path ?? request.path;
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const key = `${request.method}:${route}:${ip}`;
    const resetAt = new Date(now.getTime() + options.windowSeconds * 1000);

    // Single atomic upsert, backed by Postgres rather than in-process
    // memory, so counters survive process restarts and stay consistent
    // across multiple backend instances sharing this database.
    const [bucket] = await this.prisma.$queryRaw<
      { count: number; resetAt: Date }[]
    >(Prisma.sql`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${resetAt}
          ELSE "RateLimitBucket"."resetAt"
        END
      RETURNING "count", "resetAt"
    `);

    // Opportunistic cleanup of long-expired rows (fire-and-forget, low
    // probability) — replaces the old in-memory map's size-based pruning.
    if (Math.random() < 0.01) {
      this.prisma.rateLimitBucket
        .deleteMany({ where: { resetAt: { lt: new Date(now.getTime() - 60_000) } } })
        .catch(() => undefined);
    }

    const remaining = Math.max(0, options.limit - bucket.count);
    const retryAfter = Math.max(
      1,
      Math.ceil((bucket.resetAt.getTime() - now.getTime()) / 1000),
    );
    response.setHeader('X-RateLimit-Limit', options.limit);
    response.setHeader('X-RateLimit-Remaining', remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(bucket.resetAt.getTime() / 1000),
    );

    if (bucket.count > options.limit) {
      response.setHeader('Retry-After', retryAfter);
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
