import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CsrfTokenService {
  private readonly secret = process.env.JWT_ACCESS_SECRET || 'csrf-secret';
  private readonly issuedTokens = new Set<string>();

  generateToken(): string {
    const token = crypto.createHmac('sha256', this.secret).update(Date.now().toString() + Math.random().toString()).digest('hex');
    this.issuedTokens.add(token);
    return token;
  }

  validate(token: string): boolean {
    if (!token || token.length < 32) return false;
    const exists = this.issuedTokens.has(token);
    if (exists) {
      this.issuedTokens.delete(token);
    }
    return exists;
  }
}
