import { jakartaDate } from '../../class-sessions/session-dates.js';
import { ClassSessionEntity } from '../../class-sessions/entities/class-session.entity.js';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { RoomCapacityCategory, RoomsQueryDto } from '../dto/room-input.dto.js';
import {
  RoomListItemResponseDto,
  RoomsSummaryResponseDto,
  RoomStudyGroupResponseDto,
} from '../dto/room-response.dto.js';
import { RoomEntity } from '../entities/room.entity.js';

interface RoomAggregateRow {
  room_id: string;
  room_name: string;
  room_code: string;
  room_capacity: string;
  room_status: EntityStatus;
  active_group_count: string;
  active_student_count: string;
  today_session_count: string;
  today_start_time: string | null;
  today_end_time: string | null;
}

interface RoomGroupRow {
  group_id: string;
  group_name: string;
  student_count: string;
  schedule_id: string;
  tutor_id: string;
  tutor_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
}

@Injectable()
export class RoomsRepository {
  constructor(
    @InjectRepository(RoomEntity)
    private readonly repository: Repository<RoomEntity>,
  ) {}

  async findPage(
    tenantId: string,
    query: RoomsQueryDto,
    _today: number,
  ): Promise<[RoomListItemResponseDto[], number]> {
    const totalQuery = this.applyFilters(
      this.repository
        .createQueryBuilder('room')
        .where('room.tenant_id = :tenantId', { tenantId }),
      query,
    );
    const dataQuery = this.applyFilters(
      this.repository
        .createQueryBuilder('room')
        .leftJoin(
          'study_group_schedules',
          'schedule',
          'schedule.room_id = room.id AND schedule.tenant_id = room.tenant_id AND (schedule.configuration_id IS NULL OR schedule.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id=schedule.study_group_id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC,c.created_at DESC LIMIT 1))',
        )
        .leftJoin(
          'study_groups',
          'study_group',
          'study_group.id = schedule.study_group_id AND study_group.tenant_id = room.tenant_id AND study_group.status = :active',
          { active: EntityStatus.Active },
        )
        .leftJoin(
          'study_group_students',
          'member',
          'member.configuration_id = schedule.configuration_id AND member.tenant_id = room.tenant_id',
        )
        .where('room.tenant_id = :tenantId', { tenantId })
        .select('room.id', 'room_id')
        .addSelect('room.name', 'room_name')
        .addSelect('room.code', 'room_code')
        .addSelect('room.capacity', 'room_capacity')
        .addSelect('room.status', 'room_status')
        .addSelect('COUNT(DISTINCT study_group.id)', 'active_group_count')
        .addSelect('COUNT(DISTINCT member.student_id)', 'active_student_count')
        .addSelect(
          "(SELECT COUNT(*) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
          'today_session_count',
        )
        .addSelect(
          "(SELECT MIN(cs.start_time) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
          'today_start_time',
        )
        .addSelect(
          "(SELECT MAX(cs.end_time) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
          'today_end_time',
        )
        .setParameter('today', jakartaDate()),
      query,
    );

    const [rows, total] = await Promise.all([
      dataQuery
        .groupBy('room.id')
        .addGroupBy('room.tenant_id')
        .addGroupBy('room.name')
        .addGroupBy('room.code')
        .addGroupBy('room.capacity')
        .addGroupBy('room.status')
        .orderBy('room.name', 'ASC')
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany<RoomAggregateRow>(),
      totalQuery.getCount(),
    ]);

    return [rows.map((row) => this.toListItem(row)), total];
  }

  async getSummary(
    tenantId: string,
    _today: number,
  ): Promise<RoomsSummaryResponseDto> {
    const [roomRaw, sessionsToday] = await Promise.all([
      this.repository
        .createQueryBuilder('room')
        .select(
          "SUM(CASE WHEN room.status = 'active' THEN 1 ELSE 0 END)",
          'active_rooms',
        )
        .addSelect(
          "SUM(CASE WHEN room.status = 'active' THEN room.capacity ELSE 0 END)",
          'total_capacity',
        )
        .addSelect(
          "SUM(CASE WHEN room.status = 'inactive' THEN 1 ELSE 0 END)",
          'inactive_rooms',
        )
        .where('room.tenant_id = :tenantId', { tenantId })
        .getRawOne<{
          active_rooms: string | null;
          total_capacity: string | null;
          inactive_rooms: string | null;
        }>(),
      this.repository.manager
        .getRepository(ClassSessionEntity)
        .createQueryBuilder('session')
        .where(
          "session.tenant_id=:tenantId AND session.session_date=:today AND session.room_id IS NOT NULL AND session.status<>'cancelled'",
          { tenantId, today: jakartaDate() },
        )
        .getCount(),
    ]);

    return {
      activeRooms: Number(roomRaw?.active_rooms ?? 0),
      sessionsToday,
      totalCapacity: Number(roomRaw?.total_capacity ?? 0),
      inactiveRooms: Number(roomRaw?.inactive_rooms ?? 0),
    };
  }

  async findListItem(
    tenantId: string,
    roomId: string,
    _today: number,
  ): Promise<RoomListItemResponseDto | null> {
    const row = await this.repository
      .createQueryBuilder('room')
      .leftJoin(
        'study_group_schedules',
        'schedule',
        'schedule.room_id = room.id AND schedule.tenant_id = room.tenant_id AND (schedule.configuration_id IS NULL OR schedule.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id=schedule.study_group_id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC,c.created_at DESC LIMIT 1))',
      )
      .leftJoin(
        'study_groups',
        'study_group',
        'study_group.id = schedule.study_group_id AND study_group.tenant_id = room.tenant_id AND study_group.status = :active',
        { active: EntityStatus.Active },
      )
      .leftJoin(
        'study_group_students',
        'member',
        'member.configuration_id = schedule.configuration_id AND member.tenant_id = room.tenant_id',
      )
      .where('room.tenant_id = :tenantId AND room.id = :roomId', {
        tenantId,
        roomId,
      })
      .select('room.id', 'room_id')
      .addSelect('room.name', 'room_name')
      .addSelect('room.code', 'room_code')
      .addSelect('room.capacity', 'room_capacity')
      .addSelect('room.status', 'room_status')
      .addSelect('COUNT(DISTINCT study_group.id)', 'active_group_count')
      .addSelect('COUNT(DISTINCT member.student_id)', 'active_student_count')
      .addSelect(
        "(SELECT COUNT(*) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
        'today_session_count',
      )
      .addSelect(
        "(SELECT MIN(cs.start_time) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
        'today_start_time',
      )
      .addSelect(
        "(SELECT MAX(cs.end_time) FROM class_sessions cs WHERE cs.tenant_id=room.tenant_id AND cs.room_id=room.id AND cs.session_date=:today AND cs.status<>'cancelled')",
        'today_end_time',
      )
      .setParameter('today', jakartaDate())
      .groupBy('room.id')
      .addGroupBy('room.tenant_id')
      .addGroupBy('room.name')
      .addGroupBy('room.code')
      .addGroupBy('room.capacity')
      .addGroupBy('room.status')
      .getRawOne<RoomAggregateRow>();

    return row ? this.toListItem(row) : null;
  }

  findById(
    tenantId: string,
    id: string,
    manager: EntityManager = this.repository.manager,
  ): Promise<RoomEntity | null> {
    return manager.findOne(RoomEntity, { where: { tenantId, id } });
  }

  async findDetailGroups(
    tenantId: string,
    roomId: string,
  ): Promise<RoomStudyGroupResponseDto[]> {
    const rows = await this.repository.manager
      .createQueryBuilder()
      .from('study_group_schedules', 'schedule')
      .innerJoin(
        'study_groups',
        'study_group',
        'study_group.id = schedule.study_group_id AND study_group.tenant_id = schedule.tenant_id',
      )
      .innerJoin(
        'tutors',
        'tutor',
        'tutor.id = schedule.tutor_id AND tutor.tenant_id = schedule.tenant_id',
      )
      .leftJoin(
        'study_group_students',
        'member',
        'member.configuration_id = schedule.configuration_id AND member.tenant_id = schedule.tenant_id',
      )
      .select('study_group.id', 'group_id')
      .addSelect('study_group.name', 'group_name')
      .addSelect('COUNT(DISTINCT member.student_id)', 'student_count')
      .addSelect('schedule.id', 'schedule_id')
      .addSelect('tutor.id', 'tutor_id')
      .addSelect('tutor.name', 'tutor_name')
      .addSelect('schedule.day_of_week', 'day_of_week')
      .addSelect('schedule.start_time', 'start_time')
      .addSelect('schedule.end_time', 'end_time')
      .addSelect('schedule.sort_order', 'sort_order')
      .where('schedule.tenant_id = :tenantId', { tenantId })
      .andWhere('schedule.room_id = :roomId', { roomId })
      .andWhere('study_group.status = :active', {
        active: EntityStatus.Active,
      })
      .andWhere(
        '(schedule.configuration_id IS NULL OR schedule.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id=schedule.study_group_id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC,c.created_at DESC LIMIT 1))',
      )
      .groupBy('study_group.id')
      .addGroupBy('study_group.name')
      .addGroupBy('schedule.id')
      .addGroupBy('tutor.id')
      .addGroupBy('tutor.name')
      .addGroupBy('schedule.day_of_week')
      .addGroupBy('schedule.start_time')
      .addGroupBy('schedule.end_time')
      .addGroupBy('schedule.sort_order')
      .orderBy('study_group.name', 'ASC')
      .addOrderBy('schedule.sort_order', 'ASC')
      .getRawMany<RoomGroupRow>();

    const groups = new Map<string, RoomStudyGroupResponseDto>();
    for (const row of rows) {
      const group = groups.get(row.group_id) ?? {
        id: row.group_id,
        name: row.group_name,
        studentCount: Number(row.student_count),
        schedules: [],
      };
      group.schedules.push({
        id: row.schedule_id,
        tutorId: row.tutor_id,
        tutorName: row.tutor_name,
        dayOfWeek: Number(row.day_of_week),
        startTime: this.time(row.start_time) ?? '',
        endTime: this.time(row.end_time) ?? '',
      });
      groups.set(group.id, group);
    }

    return [...groups.values()];
  }

  async countScheduleReferences(
    tenantId: string,
    roomId: string,
  ): Promise<number> {
    return this.repository.manager
      .createQueryBuilder()
      .from('study_group_schedules', 'schedule')
      .where('schedule.tenant_id = :tenantId', { tenantId })
      .andWhere('schedule.room_id = :roomId', { roomId })
      .getCount();
  }

  save(room: RoomEntity): Promise<RoomEntity> {
    return this.repository.save(room);
  }

  create(input: Partial<RoomEntity>): RoomEntity {
    return this.repository.create(input);
  }

  async remove(room: RoomEntity): Promise<void> {
    await this.repository.remove(room);
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<RoomEntity>,
    query: RoomsQueryDto,
  ): SelectQueryBuilder<RoomEntity> {
    if (query.search) {
      queryBuilder.andWhere(
        '(room.name LIKE :search OR room.code LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.status) {
      queryBuilder.andWhere('room.status = :status', { status: query.status });
    }
    if (query.capacityCategory === RoomCapacityCategory.Small) {
      queryBuilder.andWhere('room.capacity <= 8');
    }
    if (query.capacityCategory === RoomCapacityCategory.Medium) {
      queryBuilder.andWhere('room.capacity BETWEEN 9 AND 15');
    }
    if (query.capacityCategory === RoomCapacityCategory.Large) {
      queryBuilder.andWhere('room.capacity > 15');
    }
    return queryBuilder;
  }

  private toListItem(row: RoomAggregateRow): RoomListItemResponseDto {
    return {
      id: row.room_id,
      name: row.room_name,
      code: row.room_code,
      capacity: Number(row.room_capacity),
      status: row.room_status,
      activeGroupCount: Number(row.active_group_count),
      activeStudentCount: Number(row.active_student_count),
      todaySessionCount: Number(row.today_session_count),
      todayStartTime: this.time(row.today_start_time),
      todayEndTime: this.time(row.today_end_time),
    };
  }

  private time(value: string | null): string | null {
    return value ? value.slice(0, 5) : null;
  }
}
