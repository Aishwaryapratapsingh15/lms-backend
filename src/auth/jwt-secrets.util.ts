import { ConfigService } from '@nestjs/config';

// Refuse to sign or verify anything with a hardcoded fallback secret — an
// unset env var should fail loudly at startup, not silently fall back to a
// literal string every deployment of this codebase shares.
export function requireJwtSecret(
  config: ConfigService,
  key: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET',
): string {
  const value = config.get<string>(key);
  if (!value) {
    throw new Error(
      `${key} must be set in the environment — refusing to start with a hardcoded fallback secret.`,
    );
  }
  return value;
}
