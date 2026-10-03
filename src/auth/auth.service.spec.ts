import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, type TestingModule } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import authConfig from '../config/auth.config.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { OperatorEntity } from '../operators/entities/operator.entity.js';
import { OwnerEntity } from '../owners/entities/owner.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { AuthService } from './auth.service.js';
import { AuthSessionEntity } from './entities/auth-session.entity.js';
import { AuthSessionsRepository } from './repositories/auth-sessions.repository.js';

const authConfiguration = {
  accessTokenSecret: 'test-secret-that-is-at-least-32-chars',
  issuer: 'growdu-backend',
  audience: 'growdu-test',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 7,
  cookieName: 'growdu_refresh_token',
  cookieSameSite: 'lax' as const,
  cookieSecure: false,
  frontendOrigins: ['http://localhost:5174'],
};

function createActiveOwner(): UserEntity {
  return Object.assign(new UserEntity(), {
    id: 'user-id',
    tenantId: null,
    tenant: null,
    email: 'owner@example.com',
    passwordHash: 'stored-password-hash',
    role: UserRole.Owner,
    status: EntityStatus.Active,
    lastLoginAt: null,
  });
}

describe('AuthService', () => {
  let module: TestingModule;
  let service: AuthService;
  let activeSession: AuthSessionEntity | null;
  let usersService: {
    findForAuthenticationByEmail: ReturnType<typeof vi.fn>;
    findForAuthenticationById: ReturnType<typeof vi.fn>;
    saveEntity: ReturnType<typeof vi.fn>;
    revokeAllSessions: ReturnType<typeof vi.fn>;
  };
  let sessionsRepository: {
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    findActiveById: ReturnType<typeof vi.fn>;
    findById: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
  };
  let passwordHashService: {
    hash: ReturnType<typeof vi.fn>;
    verify: ReturnType<typeof vi.fn>;
  };
  let ownersRepository: { findOne: ReturnType<typeof vi.fn> };
  let jwtService: { signAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    activeSession = null;
    const user = createActiveOwner();
    usersService = {
      findForAuthenticationByEmail: vi.fn().mockResolvedValue(user),
      findForAuthenticationById: vi.fn().mockResolvedValue(user),
      saveEntity: vi.fn().mockImplementation((value: UserEntity) => value),
      revokeAllSessions: vi.fn().mockResolvedValue(undefined),
    };
    sessionsRepository = {
      create: vi.fn().mockImplementation((input: Partial<AuthSessionEntity>) =>
        Object.assign(new AuthSessionEntity(), input, {
          id: '00000000-0000-4000-8000-000000000001',
        }),
      ),
      save: vi.fn().mockImplementation((session: AuthSessionEntity) => {
        activeSession = session;
        return session;
      }),
      rotate: vi
        .fn()
        .mockImplementation(
          (
            id: string,
            expectedHash: string,
            newHash: string,
            expiresAt: Date,
          ) => {
            if (
              !activeSession ||
              activeSession.id !== id ||
              activeSession.refreshTokenHash !== expectedHash ||
              activeSession.revokedAt
            ) {
              return null;
            }
            activeSession.refreshTokenHash = newHash;
            activeSession.expiresAt = expiresAt;
            return activeSession;
          },
        ),
      findActiveById: vi.fn().mockImplementation(() => activeSession),
      findById: vi.fn().mockImplementation(() => activeSession),
      revoke: vi.fn().mockImplementation((session: AuthSessionEntity) => {
        session.revokedAt = new Date();
        activeSession = session;
      }),
    };
    passwordHashService = {
      hash: vi.fn().mockResolvedValue('dummy-hash'),
      verify: vi.fn().mockResolvedValue(true),
    };
    ownersRepository = {
      findOne: vi.fn().mockResolvedValue(
        Object.assign(new OwnerEntity(), {
          id: 'owner-profile-id',
          userId: user.id,
          name: 'Owner Test',
          status: EntityStatus.Active,
        }),
      ),
    };
    jwtService = { signAsync: vi.fn().mockResolvedValue('access-token') };

    module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: AuthSessionsRepository, useValue: sessionsRepository },
        { provide: PasswordHashService, useValue: passwordHashService },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: getRepositoryToken(TutorEntity),
          useValue: { findOne: vi.fn() } satisfies Partial<
            Repository<TutorEntity>
          >,
        },
        {
          provide: getRepositoryToken(ParentEntity),
          useValue: { findOne: vi.fn() } satisfies Partial<
            Repository<ParentEntity>
          >,
        },
        {
          provide: getRepositoryToken(OperatorEntity),
          useValue: { findOne: vi.fn() } satisfies Partial<
            Repository<OperatorEntity>
          >,
        },
        {
          provide: getRepositoryToken(OwnerEntity),
          useValue: ownersRepository satisfies Partial<Repository<OwnerEntity>>,
        },
        { provide: authConfig.KEY, useValue: authConfiguration },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  afterEach(async () => {
    await module.close();
  });

  it('returns the same generic error for unknown email and bad password', async () => {
    usersService.findForAuthenticationByEmail.mockResolvedValueOnce(null);
    const unknownEmail = service.login({
      email: 'unknown@example.com',
      password: 'a password value',
    });
    await expect(unknownEmail).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
    expect(passwordHashService.hash).toHaveBeenCalled();

    passwordHashService.verify.mockResolvedValueOnce(false);
    const wrongPassword = service.login({
      email: 'owner@example.com',
      password: 'wrong password',
    });
    await expect(wrongPassword).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(wrongPassword).rejects.toMatchObject({
      message: 'Invalid email or password',
    });
  });

  it('rotates the refresh secret and revokes the session when the old token is reused', async () => {
    const login = await service.login({
      email: 'owner@example.com',
      password: 'valid password',
    });
    const oldToken = login.refreshToken;
    const oldHash = activeSession?.refreshTokenHash;

    const refreshed = await service.refresh(oldToken);

    expect(refreshed.refreshToken).not.toBe(oldToken);
    expect(activeSession?.refreshTokenHash).not.toBe(oldHash);
    const [, newSecret] = refreshed.refreshToken.split('.');
    expect(activeSession?.refreshTokenHash).toBe(
      createHash('sha256').update(newSecret).digest('hex'),
    );

    await expect(service.refresh(oldToken)).rejects.toMatchObject({
      message: 'Invalid or expired session',
    });
    expect(sessionsRepository.revoke).toHaveBeenCalledOnce();
    expect(activeSession?.revokedAt).toBeInstanceOf(Date);
  });

  it('signs owner access tokens without tenant data', async () => {
    await service.login({
      email: 'owner@example.com',
      password: 'valid password',
    });

    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: 'user-id',
      sid: '00000000-0000-4000-8000-000000000001',
      role: UserRole.Owner,
    });
  });

  it('rejects an inactive owner profile before creating a session', async () => {
    const user = createActiveOwner();
    usersService.findForAuthenticationByEmail.mockResolvedValueOnce(user);
    ownersRepository.findOne.mockResolvedValueOnce(null);

    await expect(
      service.login({
        email: user.email,
        password: 'valid password',
      }),
    ).rejects.toMatchObject({ message: 'Invalid email or password' });
    expect(sessionsRepository.create).not.toHaveBeenCalled();
  });
});
