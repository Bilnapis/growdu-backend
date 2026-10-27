import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '../users/entities/user.entity.js';
import {
  AnnouncementStatus,
  AnnouncementTargetRole,
  announcementStatus,
  announcementTargetForRole,
} from './announcement.types.js';
import { AnnouncementsService } from './announcements.service.js';
import {
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/announcement-input.dto.js';
import { AnnouncementEntity } from './entities/announcement.entity.js';
import { AnnouncementsRepository } from './repositories/announcements.repository.js';

const startsAt = new Date('2026-10-27T01:00:00.000Z');
const endsAt = new Date('2026-10-27T02:00:00.000Z');

describe('Announcement scheduling', () => {
  it('handles draft, future, inclusive start and exclusive end', () => {
    expect(announcementStatus(null, null, startsAt)).toBe(
      AnnouncementStatus.Draft,
    );
    expect(
      announcementStatus(startsAt, endsAt, new Date(startsAt.getTime() - 1)),
    ).toBe(AnnouncementStatus.Scheduled);
    expect(announcementStatus(startsAt, endsAt, startsAt)).toBe(
      AnnouncementStatus.Active,
    );
    expect(
      announcementStatus(startsAt, endsAt, new Date(endsAt.getTime() - 1)),
    ).toBe(AnnouncementStatus.Active);
    expect(announcementStatus(startsAt, endsAt, endsAt)).toBe(
      AnnouncementStatus.Expired,
    );
    expect(announcementStatus(startsAt, null, endsAt)).toBe(
      AnnouncementStatus.Active,
    );
  });

  it.each([
    [UserRole.Owner, AnnouncementTargetRole.Admin],
    [UserRole.Operator, AnnouncementTargetRole.Admin],
    [UserRole.Tutor, AnnouncementTargetRole.Tutor],
    [UserRole.Parent, AnnouncementTargetRole.Parent],
  ])('maps recipient %s to %s', (role, target) => {
    expect(announcementTargetForRole(role)).toBe(target);
  });

  it.each([
    '2026-10-27',
    '2026-10-27T08:00:00',
    '2026-02-30T08:00:00+07:00',
    'invalid',
  ])('rejects invalid or unzoned dates: %s', async (value) => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: 'Judul',
      content: 'Isi',
      targetRole: 'all',
      startsAt: value,
    });
    expect(
      (await validate(dto)).some((error) => error.property === 'startsAt'),
    ).toBe(true);
  });

  it('trims text, accepts zoned dates and rejects null non-date updates', async () => {
    const dto = plainToInstance(CreateAnnouncementDto, {
      title: ' Judul ',
      content: ' Isi ',
      targetRole: 'all',
      startsAt: '2026-10-27T08:00:00+07:00',
      endsAt: null,
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.title).toBe('Judul');
    const errors = await validate(
      plainToInstance(UpdateAnnouncementDto, {
        title: null,
        content: null,
        targetRole: null,
      }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      'content',
      'targetRole',
      'title',
    ]);
  });
});

describe('AnnouncementsService', () => {
  const repository = {
    findPage: vi.fn(),
    findActivePage: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  };
  let service: AnnouncementsService;
  let entity: AnnouncementEntity;

  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(startsAt);
    entity = Object.assign(new AnnouncementEntity(), {
      id: 'record',
      tenantId: 'tenant',
      title: 'Judul',
      content: 'Isi',
      targetRole: AnnouncementTargetRole.All,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      createdAt: startsAt,
      updatedAt: startsAt,
    });
    repository.findById.mockResolvedValue(entity);
    repository.create.mockImplementation((input: Partial<AnnouncementEntity>) =>
      Object.assign(new AnnouncementEntity(), entity, input),
    );
    repository.save.mockImplementation(
      async (value: AnnouncementEntity) => value,
    );
    const module = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        { provide: AnnouncementsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(AnnouncementsService);
  });

  afterEach(() => vi.useRealTimers());

  it('normalizes WIB to UTC without relying on server timezone', async () => {
    const result = await service.create('tenant', {
      title: 'Judul',
      content: 'Isi',
      targetRole: AnnouncementTargetRole.All,
      startsAt: '2026-10-27T08:00:00+07:00',
    });
    expect(result.startsAt).toBe(startsAt.toISOString());
    expect(result.endsAt).toBeNull();
    expect(result.status).toBe(AnnouncementStatus.Active);
  });

  it('preserves omitted fields and clears dates explicitly to return to draft', async () => {
    expect(
      (await service.update('tenant', 'record', { title: 'Baru' })).startsAt,
    ).toBe(startsAt.toISOString());
    const result = await service.update('tenant', 'record', {
      startsAt: null,
      endsAt: null,
    });
    expect(result.status).toBe(AnnouncementStatus.Draft);
    expect(result.title).toBe('Baru');
    expect(repository.findById).toHaveBeenCalledWith('tenant', 'record');
  });

  it.each([
    { startsAt: null, endsAt: endsAt.toISOString() },
    { startsAt: startsAt.toISOString(), endsAt: startsAt.toISOString() },
    { startsAt: endsAt.toISOString(), endsAt: startsAt.toISOString() },
  ])(
    'rejects invalid schedule combinations on create and patch',
    async (dates) => {
      await expect(
        service.create('tenant', {
          title: 'Judul',
          content: 'Isi',
          targetRole: AnnouncementTargetRole.All,
          ...dates,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(service.update('tenant', 'record', dates)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.save).not.toHaveBeenCalled();
    },
  );

  it('rejects clearing start while retaining an existing end', async () => {
    await expect(
      service.update('tenant', 'record', { startsAt: null }),
    ).rejects.toThrow(BadRequestException);
  });

  it('scopes active data by tenant, recipient, and a single request time', async () => {
    repository.findActivePage.mockResolvedValue([[entity], 1]);
    const query = { page: 1, limit: 5 };
    const result = await service.findActive('tenant', UserRole.Tutor, query);
    expect(repository.findActivePage).toHaveBeenCalledWith(
      'tenant',
      AnnouncementTargetRole.Tutor,
      query,
      startsAt,
    );
    expect(result.meta).toEqual({ page: 1, limit: 5, total: 1, totalPages: 1 });
  });

  it('does not expose or mutate records absent from the requested tenant', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.findOne('other', 'record')).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.update('other', 'record', { title: 'Baru' }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.remove('other', 'record')).rejects.toThrow(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
