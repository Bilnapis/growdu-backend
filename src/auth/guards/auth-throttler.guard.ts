import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected getTracker(request: Record<string, unknown>): Promise<string> {
    const ip = typeof request.ip === 'string' ? request.ip : 'unknown';
    const body = request.body;
    const email =
      typeof body === 'object' &&
      body !== null &&
      'email' in body &&
      typeof body.email === 'string'
        ? body.email.trim().toLowerCase()
        : '';
    return Promise.resolve(email ? `${ip}:${email}` : ip);
  }
}
