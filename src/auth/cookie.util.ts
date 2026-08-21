import { ConfigService } from '@nestjs/config';
import { CookieOptions } from 'express';

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
export const CSRF_TOKEN_COOKIE = 'csrf_token';

const TTL_PATTERN = /^(\d+)(ms|s|m|h|d)?$/;
const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

export function parseTtlToMs(ttl: string): number {
  const match = TTL_PATTERN.exec(ttl.trim());
  if (!match) return UNIT_MS.m * 15;
  const [, value, unit = 's'] = match;
  return Number(value) * UNIT_MS[unit];
}

function baseCookieOptions(configService: ConfigService): CookieOptions {
  return {
    httpOnly: true,
    secure: configService.get<string>('NODE_ENV') === 'production',
    sameSite: 'lax',
    domain: configService.get<string>('COOKIE_DOMAIN') || undefined,
  };
}

export function buildAccessTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  return {
    ...baseCookieOptions(configService),
    path: '/',
    maxAge: parseTtlToMs(
      configService.get<string>('JWT_ACCESS_TTL') || '15m',
    ),
  };
}

export function buildRefreshTokenCookieOptions(
  configService: ConfigService,
): CookieOptions {
  return {
    ...baseCookieOptions(configService),
    path: '/auth',
    maxAge: parseTtlToMs(configService.get<string>('JWT_REFRESH_TTL') || '7d'),
  };
}

export function buildCsrfCookieOptions(
  configService: ConfigService,
): CookieOptions {
  return {
    ...baseCookieOptions(configService),
    httpOnly: false,
    path: '/',
    maxAge: parseTtlToMs(configService.get<string>('JWT_REFRESH_TTL') || '7d'),
  };
}

export function clearCookieOptions(options: CookieOptions): CookieOptions {
  const { maxAge: _maxAge, expires: _expires, ...rest } = options;
  return rest;
}
