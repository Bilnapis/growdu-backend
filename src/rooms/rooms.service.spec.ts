import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { RoomEntity } from './entities/room.entity.js';
import { RoomsRepository } from './repositories/rooms.repository.js';
import { RoomsService } from './rooms.service.js';

function room(overrides: Partial<RoomEntity> = {}): RoomEntity {
  return Object.assign(new RoomEntity(), {
    id: '43d9e8ea-06fd-4d5e-9fbf-6d84a90df78c',
    tenantId: '952096fd-b0c0-4780-a1e8-6008acdebc74',
    name: 'Ruang Galileo',
    code: 'R-01',
    capacity: 12,
    status: EntityStatus.Active,
    createdAt: new Date('2026-10-24T00:00:00.000Z'),
    updatedAt: new Date('2026-10-24T00:00:00.000Z'),
    ...overrides,
  });
}

function listItem(entity: RoomEntity) {
  return {
    id: entity.id,
    name: entity.name,
    code: entity.code,
    capacity: entity.capacity,
    status: entity.status,
    activeGroupCount: 0,
    activeStudentCount: 0,
    todaySessionCount: 0,
    todayStartTime: null,
    todayEndTime: null,
  };
}

describe('RoomsService', () => {
  const repository = {
    findPage: vi.fn(),
    getSummary: vi.fn(),
    findById: vi.fn(),
    findListItem: vi.fn(),
    findDetailGroups: vi.fn(),
    countScheduleReferences: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
  let service: RoomsService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: RoomsRepository, useValue: repository },
      ],
    }).compile();
    service = module.get(RoomsService);
  });

  it('returns a tenant-scoped paginated list', async () => {
    const entity = room();
    repository.findPage.mockResolvedValue([[listItem(entity)], 1]);

    const result = await service.findAll(entity.tenantId, {
      page: 1,
      limit: 5,
    });

    expect(repository.findPage).toHaveBeenCalledWith(
      entity.tenantId,
      { page: 1, limit: 5 },
      expect.any(Number),
    );
    expect(result.meta).toEqual({ page: 1, limit: 5, total: 1, totalPages: 1 });
  });

  it('creates rooms as active and returns their detail', async () => {
    const entity = room();
    repository.create.mockReturnValue(entity);
    repository.save.mockResolvedValue(entity);
    repository.findById.mockResolvedValue(entity);
    repository.findListItem.mockResolvedValue(listItem(entity));
    repository.findDetailGroups.mockResolvedValue([]);

    const result = await service.create(entity.tenantId, {
      name: entity.name,
      code: entity.code,
      capacity: entity.capacity,
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: EntityStatus.Active }),
    );
    expect(result).toMatchObject({ id: entity.id, code: entity.code });
  });

  it('maps duplicate room codes to a public conflict error', async () => {
    const entity = room();
    repository.create.mockReturnValue(entity);
    repository.save.mockRejectedValue({ code: 'ER_DUP_ENTRY' });

    await expect(
      service.create(entity.tenantId, {
        name: entity.name,
        code: entity.code,
        capacity: entity.capacity,
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('does not reveal rooms from another tenant', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(
      service.findOne(
        '50bedf06-3953-4494-ad89-e8ed68bc1bec',
        '43d9e8ea-06fd-4d5e-9fbf-6d84a90df78c',
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns the tenant summary from the aggregate repository query', async () => {
    const entity = room();
    repository.getSummary.mockResolvedValue({
      activeRooms: 2,
      sessionsToday: 3,
      totalCapacity: 24,
      inactiveRooms: 1,
    });

    await expect(service.getSummary(entity.tenantId)).resolves.toEqual({
      activeRooms: 2,
      sessionsToday: 3,
      totalCapacity: 24,
      inactiveRooms: 1,
    });
    expect(repository.getSummary).toHaveBeenCalledWith(
      entity.tenantId,
      expect.any(Number),
    );
  });

  it('changes status while keeping the room tenant-scoped', async () => {
    const entity = room();
    repository.findById.mockResolvedValue(entity);
    repository.save.mockResolvedValue(entity);
    repository.findListItem.mockImplementation(async () => listItem(entity));
    repository.findDetailGroups.mockResolvedValue([]);

    const result = await service.updateStatus(
      entity.tenantId,
      entity.id,
      EntityStatus.Inactive,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: EntityStatus.Inactive }),
    );
    expect(result.status).toBe(EntityStatus.Inactive);
  });

  it('rejects permanent deletion when a schedule references the room', async () => {
    const entity = room();
    repository.findById.mockResolvedValue(entity);
    repository.countScheduleReferences.mockResolvedValue(1);

    await expect(service.remove(entity.tenantId, entity.id)).rejects.toThrow(
      ConflictException,
    );
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it('deletes an unused room', async () => {
    const entity = room();
    repository.findById.mockResolvedValue(entity);
    repository.countScheduleReferences.mockResolvedValue(0);

    await service.remove(entity.tenantId, entity.id);

    expect(repository.remove).toHaveBeenCalledWith(entity);
  });
});
