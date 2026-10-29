import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricHistoryStateEntity } from './entities/metric-history-state.entity.js';
import { MetricStatusHistoryEntity } from './entities/metric-status-history.entity.js';
import { MetricsHistoryService } from './metrics-history.service.js';

describe('MetricsHistoryService', () => {
  const state = { findOneBy: vi.fn() };
  const query = {
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getCount: vi.fn(),
  };
  const history = { createQueryBuilder: vi.fn(() => query) };
  let service: MetricsHistoryService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        MetricsHistoryService,
        {
          provide: getRepositoryToken(MetricStatusHistoryEntity),
          useValue: history,
        },
        {
          provide: getRepositoryToken(MetricHistoryStateEntity),
          useValue: state,
        },
      ],
    }).compile();
    service = module.get(MetricsHistoryService);
  });

  it('does not invent a baseline before tracking began', async () => {
    state.findOneBy.mockResolvedValue({
      startedAt: new Date('2026-10-15T00:00:00Z'),
    });
    await expect(
      service.getPreviousMonthActive(
        'tenant',
        'student',
        new Date('2026-10-29T00:00:00Z'),
      ),
    ).resolves.toBeNull();
    expect(history.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns unavailable when the tracking marker is missing', async () => {
    state.findOneBy.mockResolvedValue(null);
    await expect(
      service.getPreviousMonthActive('tenant', 'tutor'),
    ).resolves.toBeNull();
  });

  it('uses the Jakarta month boundary and isolates entity type and tenant', async () => {
    state.findOneBy.mockResolvedValue({
      startedAt: new Date('2026-01-01T00:00:00Z'),
    });
    query.getCount.mockResolvedValue(0);
    await expect(
      service.getPreviousMonthActive(
        'tenant-a',
        'tutor',
        new Date('2026-03-31T18:00:00Z'),
      ),
    ).resolves.toBe(0);
    expect(query.where).toHaveBeenCalledWith('history.tenant_id = :tenantId', {
      tenantId: 'tenant-a',
    });
    expect(query.andWhere).toHaveBeenCalledWith(
      'history.entity_type = :entityType',
      { entityType: 'tutor' },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'history.recorded_at < :cutoff',
      { cutoff: new Date('2026-03-31T17:00:00Z') },
    );
  });
});
