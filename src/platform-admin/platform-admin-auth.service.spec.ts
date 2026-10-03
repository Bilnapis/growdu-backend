import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import type { PasswordHashService } from '../common/security/password-hash.service.js';
import { PlatformAdminEntity } from './entities/platform-admin.entity.js';
import { PlatformAdminSessionEntity } from './entities/platform-admin-session.entity.js';
import { PlatformAdminAuthService } from './platform-admin-auth.service.js';

describe('PlatformAdminAuthService', () => {
  it('creates an isolated platform-admin session on successful login', async () => {
    const admin = Object.assign(new PlatformAdminEntity(), {
      id: 'platform-admin-id',
      email: 'admin@bimbelkit.test',
      passwordHash: 'stored-password-hash',
      status: EntityStatus.Active,
      lastLoginAt: null,
    });
    const session = Object.assign(new PlatformAdminSessionEntity(), {
      id: 'platform-admin-session-id',
      platformAdminId: admin.id,
      refreshTokenHash: 'a'.repeat(64),
      expiresAt: new Date('2026-10-10T00:00:00Z'),
      revokedAt: null,
    });
    const queryBuilder = {
      addSelect: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getOne: vi.fn().mockResolvedValue(admin),
    };
    const platformAdminsRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(queryBuilder),
      save: vi.fn().mockImplementation(async (entity: PlatformAdminEntity) => entity),
    } as unknown as Repository<PlatformAdminEntity>;
    const sessionsRepository = {
      create: vi.fn().mockReturnValue(session),
      save: vi.fn().mockResolvedValue(session),
    } as unknown as Repository<PlatformAdminSessionEntity>;
    const passwordHashService = {
      verify: vi.fn().mockResolvedValue(true),
    } as unknown as PasswordHashService;
    const jwtService = {
      signAsync: vi.fn().mockResolvedValue('platform-admin-access-token'),
    } as unknown as JwtService;
    const service = new PlatformAdminAuthService(
      platformAdminsRepository,
      sessionsRepository,
      passwordHashService,
      jwtService,
      {
        accessTokenTtlSeconds: 900,
        refreshTokenTtlDays: 7,
      } as never,
    );

    const result = await service.login({
      email: admin.email,
      password: 'correct-password',
    });

    expect(result.response.accessToken).toBe('platform-admin-access-token');
    expect(result.response.admin.email).toBe(admin.email);
    expect(result.refreshToken).toMatch(/^platform-admin-session-id\./);
    expect(passwordHashService.verify).toHaveBeenCalledWith(
      admin.passwordHash,
      'correct-password',
    );
    expect(platformAdminsRepository.save).toHaveBeenCalledWith(admin);
  });
});
