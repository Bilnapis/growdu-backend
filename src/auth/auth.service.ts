import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import authConfig from '../config/auth.config.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { ChangePasswordDto, LoginDto } from './dto/auth-input.dto.js';
import {
  AuthUserResponseDto,
  TokenResponseDto,
} from './dto/auth-response.dto.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';
import { AuthenticatedUser } from './types/authenticated-user.type.js';
import { JwtPayload } from './types/jwt-payload.type.js';

export interface AuthResult {
  response: TokenResponseDto;
  refreshToken: string;
}

interface ProfileSummary {
  id: string;
  name: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly sessionsRepository: AuthSessionsRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly jwtService: JwtService,
    @InjectRepository(TutorEntity)
    private readonly tutorsRepository: Repository<TutorEntity>,
    @InjectRepository(ParentEntity)
    private readonly parentsRepository: Repository<ParentEntity>,
    @InjectRepository(OperatorEntity)
    private readonly operatorsRepository: Repository<OperatorEntity>,
    @InjectRepository(OwnerEntity)
    private readonly ownersRepository: Repository<OwnerEntity>,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findForAuthenticationByEmail(
      dto.email,
    );
    if (!user) {
      await this.passwordHashService.hash(dto.password);
      throw this.invalidCredentials();
    }

    const passwordMatches = await this.passwordHashService.verify(
      user.passwordHash,
      dto.password,
    );
    if (!passwordMatches) {
      throw this.invalidCredentials();
    }

    const profile = await this.assertAccountActive(user);
    const { session, refreshToken } = await this.createSession(user.id);
    user.lastLoginAt = new Date();
    await this.usersService.saveEntity(user);

    return {
      response: await this.createTokenResponse(user, session.id, profile),
      refreshToken,
    };
  }

  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    const parsed = this.parseRefreshToken(refreshToken);
    const session = await this.sessionsRepository.findActiveById(
      parsed.sessionId,
    );
    if (!session) {
      throw this.invalidSession();
    }

    if (
      session.expiresAt.getTime() <= Date.now() ||
      !this.hashesMatch(
        session.refreshTokenHash,
        this.hashSecret(parsed.secret),
      )
    ) {
      await this.sessionsRepository.revoke(session);
      throw this.invalidSession();
    }

    const user = await this.usersService.findForAuthenticationById(
      session.userId,
    );
    if (!user) {
      await this.sessionsRepository.revoke(session);
      throw this.invalidSession();
    }

    let profile: ProfileSummary | null;
    try {
      profile = await this.assertAccountActive(user);
    } catch {
      await this.sessionsRepository.revoke(session);
      throw this.invalidSession();
    }

    const newSecret = randomBytes(48).toString('base64url');
    const rotatedSession = await this.sessionsRepository.rotate(
      session.id,
      session.refreshTokenHash,
      this.hashSecret(newSecret),
      this.refreshExpiry(),
    );
    if (!rotatedSession) {
      await this.sessionsRepository.revoke(session);
      throw this.invalidSession();
    }

    return {
      response: await this.createTokenResponse(
        user,
        rotatedSession.id,
        profile,
      ),
      refreshToken: `${rotatedSession.id}.${newSecret}`,
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

    const session = await this.sessionsRepository.findById(parsed.sessionId);
    if (!session) return;
    if (
      !this.hashesMatch(
        session.refreshTokenHash,
        this.hashSecret(parsed.secret),
      )
    ) {
      await this.sessionsRepository.revoke(session);
      return;
    }
    await this.sessionsRepository.revoke(session);
  }

  logoutAll(userId: string): Promise<void> {
    return this.usersService.revokeAllSessions(userId);
  }

  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
  ): Promise<void> {
    const entity = await this.usersService.findWithPassword(user.id);
    if (
      !entity ||
      !(await this.passwordHashService.verify(
        entity.passwordHash,
        dto.currentPassword,
      ))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    entity.passwordHash = await this.passwordHashService.hash(dto.newPassword);
    await this.usersService.saveEntity(entity);
    await this.usersService.revokeAllSessions(entity.id);
  }

  async getMe(user: AuthenticatedUser): Promise<AuthUserResponseDto> {
    const entity = await this.usersService.findForAuthenticationById(user.id);
    if (!entity) throw this.invalidSession();
    const profile = await this.assertAccountActive(entity);
    return this.toAuthUser(entity, profile);
  }

  async validateAccessToken(payload: JwtPayload): Promise<AuthenticatedUser> {
    const [session, user] = await Promise.all([
      this.sessionsRepository.findActiveById(payload.sid),
      this.usersService.findForAuthenticationById(payload.sub),
    ]);
    if (
      !session ||
      !user ||
      session.userId !== user.id ||
      session.expiresAt.getTime() <= Date.now() ||
      user.role !== payload.role
    ) {
      throw this.invalidSession();
    }
    await this.assertAccountActive(user);
    return {
      id: user.id,
      sessionId: session.id,
      tenantId: user.tenantId ?? '',
      email: user.email,
      role: user.role,
    };
  }

  private async createSession(userId: string) {
    const secret = randomBytes(48).toString('base64url');
    const session = this.sessionsRepository.create({
      userId,
      refreshTokenHash: this.hashSecret(secret),
      expiresAt: this.refreshExpiry(),
      revokedAt: null,
    });
    const saved = await this.sessionsRepository.save(session);
    return { session: saved, refreshToken: `${saved.id}.${secret}` };
  }

  private async createTokenResponse(
    user: UserEntity,
    sessionId: string,
    profile: ProfileSummary | null,
  ): Promise<TokenResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      sid: sessionId,
      role: user.role,
    };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.accessTokenTtlSeconds,
      user: this.toAuthUser(user, profile),
    };
  }

  private toAuthUser(
    user: UserEntity,
    profile: ProfileSummary | null,
  ): AuthUserResponseDto {
    return {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
      status: user.status,
      tenantName: user.tenant?.name ?? null,
      profileId: profile?.id ?? null,
      profileName: profile?.name ?? null,
    };
  }

  private async assertAccountActive(
    user: UserEntity,
  ): Promise<ProfileSummary | null> {
    if (user.status !== EntityStatus.Active) {
      throw this.invalidCredentials();
    }

    if (user.role === UserRole.Owner) {
      const owner = await this.ownersRepository.findOne({
        where: { userId: user.id, status: EntityStatus.Active },
      });
      if (!owner) throw this.invalidCredentials();
      return { id: owner.id, name: owner.name };
    }

    const tenantId = user.tenantId;
    if (
      !tenantId ||
      !user.tenant ||
      user.tenant.status !== EntityStatus.Active
    ) {
      throw this.invalidCredentials();
    }

    if (user.role === UserRole.Operator) {
      const operator = await this.operatorsRepository.findOne({
        where: {
          userId: user.id,
          tenantId,
          status: EntityStatus.Active,
        },
      });
      if (!operator) throw this.invalidCredentials();
      return { id: operator.id, name: operator.name };
    }

    if (user.role === UserRole.Tutor) {
      const tutor = await this.tutorsRepository.findOne({
        where: {
          userId: user.id,
          tenantId,
          status: EntityStatus.Active,
        },
      });
      if (!tutor) throw this.invalidCredentials();
      return { id: tutor.id, name: tutor.name };
    }

    if (user.role === UserRole.Parent) {
      const parent = await this.parentsRepository.findOne({
        where: {
          userId: user.id,
          tenantId,
          status: EntityStatus.Active,
        },
      });
      if (!parent) throw this.invalidCredentials();
      return { id: parent.id, name: parent.name };
    }

    return null;
  }

  private parseRefreshToken(token: string | undefined) {
    if (!token) throw this.invalidSession();
    const separator = token.indexOf('.');
    if (separator <= 0 || separator === token.length - 1) {
      throw this.invalidSession();
    }
    return {
      sessionId: token.slice(0, separator),
      secret: token.slice(separator + 1),
    };
  }

  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }

  private hashesMatch(expected: string, actual: string): boolean {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private refreshExpiry(): Date {
    return new Date(
      Date.now() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000,
    );
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('Invalid email or password');
  }

  private invalidSession(): UnauthorizedException {
    return new UnauthorizedException('Invalid or expired session');
  }
}
