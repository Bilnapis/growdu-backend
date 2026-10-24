import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { getJakartaDayOfWeek } from '../common/datetime/jakarta-date.util.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import {
  CreateRoomDto,
  RoomsQueryDto,
  UpdateRoomDto,
} from './dto/room-input.dto.js';
import {
  RoomDetailResponseDto,
  RoomListItemResponseDto,
  RoomsSummaryResponseDto,
} from './dto/room-response.dto.js';
import { RoomEntity } from './entities/room.entity.js';
import { RoomsRepository } from './repositories/rooms.repository.js';

@Injectable()
export class RoomsService {
  constructor(private readonly roomsRepository: RoomsRepository) {}

  async findAll(
    tenantId: string,
    query: RoomsQueryDto,
  ): Promise<PaginatedResponse<RoomListItemResponseDto>> {
    const [data, total] = await this.roomsRepository.findPage(
      tenantId,
      query,
      getJakartaDayOfWeek(),
    );

    return {
      data,
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  getSummary(tenantId: string): Promise<RoomsSummaryResponseDto> {
    return this.roomsRepository.getSummary(tenantId, getJakartaDayOfWeek());
  }

  async findOne(tenantId: string, id: string): Promise<RoomDetailResponseDto> {
    const room = await this.requireRoom(tenantId, id);
    const [item, studyGroups] = await Promise.all([
      this.roomsRepository.findListItem(
        tenantId,
        room.id,
        getJakartaDayOfWeek(),
      ),
      this.roomsRepository.findDetailGroups(tenantId, room.id),
    ]);

    if (!item) throw new NotFoundException('Ruangan tidak ditemukan');

    return {
      ...item,
      tenantId: room.tenantId,
      studyGroups,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  async create(
    tenantId: string,
    dto: CreateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    const room = this.roomsRepository.create({
      tenantId,
      name: dto.name,
      code: dto.code,
      capacity: dto.capacity,
      status: EntityStatus.Active,
    });

    return this.save(room);
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateRoomDto,
  ): Promise<RoomDetailResponseDto> {
    const room = await this.requireRoom(tenantId, id);
    if (dto.name !== undefined) room.name = dto.name;
    if (dto.code !== undefined) room.code = dto.code;
    if (dto.capacity !== undefined) room.capacity = dto.capacity;

    return this.save(room);
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: EntityStatus,
  ): Promise<RoomDetailResponseDto> {
    const room = await this.requireRoom(tenantId, id);
    room.status = status;
    await this.roomsRepository.save(room);
    return this.findOne(tenantId, room.id);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const room = await this.requireRoom(tenantId, id);
    const references = await this.roomsRepository.countScheduleReferences(
      tenantId,
      room.id,
    );
    if (references > 0) {
      throw new ConflictException(
        'Ruangan masih digunakan oleh jadwal. Nonaktifkan ruangan untuk menjaga riwayat data.',
      );
    }

    await this.roomsRepository.remove(room);
  }

  private async save(room: RoomEntity): Promise<RoomDetailResponseDto> {
    try {
      const saved = await this.roomsRepository.save(room);
      return this.findOne(saved.tenantId, saved.id);
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'Kode ruangan sudah digunakan pada bimbel ini.',
        );
      }
      throw error;
    }
  }

  private async requireRoom(tenantId: string, id: string): Promise<RoomEntity> {
    const room = await this.roomsRepository.findById(tenantId, id);
    if (!room) throw new NotFoundException('Ruangan tidak ditemukan');
    return room;
  }
}
