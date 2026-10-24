import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { UserRole } from '../users/entities/user.entity.js';
import { SchedulesRepository } from './repositories/schedules.repository.js';
import { SchedulesService } from './schedules.service.js';

describe('SchedulesService', () => {
  const repository = {
    findPage: vi.fn(),
    getSummary: vi.fn(),
  };
  let service: SchedulesService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        SchedulesService,
        { provide: SchedulesRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(SchedulesService);
  });

  it('returns a tenant-scoped paginated schedule list', async () => {
    const user = authenticatedUser(UserRole.Operator);
    repository.findPage.mockResolvedValue([[], 8]);

    const result = await service.findAll(user, { page: 2, limit: 6 });

    expect(repository.findPage).toHaveBeenCalledWith(
      user.tenantId,
      { page: 2, limit: 6 },
      undefined,
    );
    expect(result.meta).toEqual({ page: 2, limit: 6, total: 8, totalPages: 2 });
  });

  it('limits tutor results to the signed-in tutor account', async () => {
    const user = authenticatedUser(UserRole.Tutor);
    repository.findPage.mockResolvedValue([[], 0]);

    await service.findAll(user, { page: 1, limit: 6 });

    expect(repository.findPage).toHaveBeenCalledWith(
      user.tenantId,
      { page: 1, limit: 6 },
      user.id,
    );
  });

  it('reports attendance as pending until attendance data exists', async () => {
    const user = authenticatedUser(UserRole.Owner);
    repository.getSummary.mockResolvedValue({
      totalSchedules: 12,
      schedulesToday: 3,
    });

    await expect(service.getSummary(user)).resolves.toEqual({
      totalSchedules: 12,
      schedulesToday: 3,
      schedulesWithAttendance: 0,
      schedulesPendingAttendance: 12,
    });
  });
});

function authenticatedUser(role: UserRole): AuthenticatedUser {
  return {
    id: '1f293f5d-a9df-4f5f-9f93-f6f9cb65f5ad',
    sessionId: 'c80f2372-85af-433b-b938-ff81389d77f8',
    tenantId: '95d7b786-b3a1-4248-b861-9952ef75284e',
    email: 'user@example.com',
    role,
  };
}
