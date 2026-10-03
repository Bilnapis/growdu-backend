import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import authConfig from '../config/auth.config.js';
import { PlatformAdminLoginDto } from './dto/platform-admin-auth.dto.js';
import {
  PlatformAdminResponseDto,
  PlatformAdminTokenResponseDto,
} from './dto/platform-admin-response.dto.js';
import { PlatformAdminEntity } from './entities/platform-admin.entity.js';
import { PlatformAdminSessionEntity } from './entities/platform-admin-session.entity.js';
import type { PlatformAdminAuthenticated } from './types/platform-admin-authenticated.type.js';
import type { PlatformAdminJwtPayload } from './types/platform-admin-jwt-payload.type.js';

export interface PlatformAdminAuthResult {
  response: PlatformAdminTokenResponseDto;
  refreshToken: string;
}

@Injectable()
export class PlatformAdminAuthService {
  constructor(
    @InjectRepository(PlatformAdminEntity)
    private readonly platformAdminsRepository: Repository<PlatformAdminEntity>,
    @InjectRepository(PlatformAdminSessionEntity)
    private readonly sessionsRepository: Repository<PlatformAdminSessionEntity>,
    private readonly passwordHashService: PasswordHashService,
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async login(dto: PlatformAdminLoginDto): Promise<PlatformAdminAuthResult> {
    const admin = await this.platformAdminsRepository
      .createQueryBuilder('platformAdmin')
      .addSelect('platformAdmin.passwordHash')
      .where('platformAdmin.email = :email', { email: dto.email })
      .getOne();
    if (!admin) {
      await this.passwordHashService.hash(dto.password);
      throw this.invalidCredentials();
    }

    const passwordMatches = await this.passwordHashService.verify(
      admin.passwordHash,
      dto.password,
    );
    if (!passwordMatches || admin.status !== EntityStatus.Active) {
      throw this.invalidCredentials();
    }

    const { session, refreshToken } = await this.createSession(admin.id);
    admin.lastLoginAt = new Date();
    await this.platformAdminsRepository.save(admin);

    return {
      response: await this.createTokenResponse(admin, session.id),
      refreshToken,
    };
  }

  async refresh(refreshToken: string | undefined): Promise<PlatformAdminAuthResult> {
    const parsed = this.parseRefreshToken(refreshToken);
    const session = await this.sessionsRepository.findOne({
      where: { id: parsed.sessionId, revokedAt: IsNull() },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw this.invalidSession();
    }
    if (!this.hashesMatch(session.refreshTokenHash, this.hashSecret(parsed.secret))) {
      await this.revokeSession(session);
      throw this.invalidSession();
    }

    const admin = await this.platformAdminsRepository.findOne({
      where: { id: session.platformAdminId },
    });
    if (!admin || admin.status !== EntityStatus.Active) {
      await this.revokeSession(session);
      throw this.invalidSession();
    }

    const newSecret = randomBytes(48).toString('base64url');
    const update = await this.sessionsRepository
      .createQueryBuilder()
      .update(PlatformAdminSessionEntity)
      .set({
        refreshTokenHash: this.hashSecret(newSecret),
        expiresAt: this.refreshExpiry(),
      })
      .where('id = :id', { id: session.id })
      .andWhere('refresh_token_hash = :expectedHash', {
        expectedHash: session.refreshTokenHash,
      })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > :now', { now: new Date() })
      .execute();
    if (update.affected !== 1) {
      await this.revokeSession(session);
      throw this.invalidSession();
    }

    return {
      response: await this.createTokenResponse(admin, session.id),
      refreshToken: `${session.id}.${newSecret}`,
    };
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    let parsed: { sessionId: string; secret: string };
    try {
      parsed = this.parseRefreshToken(refreshToken);
    } catch {
      return;
    }

    const session = await this.sessionsRepository.findOne({
      where: { id: parsed.sessionId },
    });
    if (!session) return;
    if (!this.hashesMatch(session.refreshTokenHash, this.hashSecret(parsed.secret))) {
      await this.revokeSession(session);
      return;
    }
    await this.revokeSession(session);
  }

  async getMe(adminId: string): Promise<PlatformAdminResponseDto> {
    const admin = await this.platformAdminsRepository.findOne({
      where: { id: adminId },
    });
    if (!admin || admin.status !== EntityStatus.Active) throw this.invalidSession();
    return PlatformAdminResponseDto.fromEntity(admin);
  }

  async validateAccessToken(
    payload: PlatformAdminJwtPayload,
  ): Promise<PlatformAdminAuthenticated> {
    const [session, admin] = await Promise.all([
      this.sessionsRepository.findOne({
        where: { id: payload.sid, revokedAt: IsNull() },
      }),
      this.platformAdminsRepository.findOne({ where: { id: payload.sub } }),
    ]);
    if (
      !session ||
      !admin ||
      session.platformAdminId !== admin.id ||
      session.expiresAt.getTime() <= Date.now() ||
      admin.status !== EntityStatus.Active
    ) {
      throw this.invalidSession();
    }
    return { id: admin.id, sessionId: session.id, email: admin.email };
  }

  private async createSession(platformAdminId: string) {
    const secret = randomBytes(48).toString('base64url');
    const session = this.sessionsRepository.create({
      platformAdminId,
      refreshTokenHash: this.hashSecret(secret),
      expiresAt: this.refreshExpiry(),
      revokedAt: null,
    });
    const saved = await this.sessionsRepository.save(session);
    return { session: saved, refreshToken: `${saved.id}.${secret}` };
  }

  private async createTokenResponse(
    admin: PlatformAdminEntity,
    sessionId: string,
  ): Promise<PlatformAdminTokenResponseDto> {
    const payload: PlatformAdminJwtPayload = {
      sub: admin.id,
      sid: sessionId,
      kind: 'platform-admin',
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSeconds,
      admin: PlatformAdminResponseDto.fromEntity(admin),
    };
  }

  private async revokeSession(session: PlatformAdminSessionEntity): Promise<void> {
    if (session.revokedAt === null) {
      session.revokedAt = new Date();
      await this.sessionsRepository.save(session);
    }
  }

  private parseRefreshToken(token: string | undefined) {
    if (!token) throw this.invalidSession();
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) {
      throw this.invalidSession();
    }
    return { sessionId: token.slice(0, separator), secret: token.slice(separator + 1) };
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private hashesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000);
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired platform admin session');
  }
}
