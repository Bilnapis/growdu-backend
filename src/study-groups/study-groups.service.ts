import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { RoomEntity } from '../rooms/entities/room.entity.js';
import {
  CreateStudyGroupDto,
  StudyGroupsQueryDto,
  UpdateStudyGroupDto,
} from './dto/study-group-input.dto.js';
import {
  StudyGroupListItemResponseDto,
  StudyGroupResponseDto,
  StudyGroupScheduleResponseDto,
  StudyGroupsSummaryResponseDto,
} from './dto/study-group-response.dto.js';
import { StudyGroupScheduleEntity } from './entities/study-group-schedule.entity.js';
import { StudyGroupStudentEntity } from './entities/study-group-student.entity.js';
import { StudyGroupEntity } from './entities/study-group.entity.js';

@Injectable()
export class StudyGroupsService {
  constructor(private readonly dataSource: DataSource) {}
  async findAll(
    tenantId: string,
    query: StudyGroupsQueryDto,
  ): Promise<PaginatedResponse<StudyGroupListItemResponseDto>> {
    const groups = this.dataSource
      .getRepository(StudyGroupEntity)
      .createQueryBuilder('group')
      .where('group.tenant_id = :tenantId', { tenantId });
    if (query.search)
      groups.andWhere(
        '(group.name LIKE :search OR EXISTS (SELECT 1 FROM study_group_schedules s INNER JOIN tutors t ON t.id = s.tutor_id WHERE s.study_group_id = group.id AND t.name LIKE :search))',
        { search: `%${query.search}%` },
      );
    if (query.status)
      groups.andWhere('group.status = :status', { status: query.status });
    if (query.tutorId)
      groups.andWhere(
        'EXISTS (SELECT 1 FROM study_group_schedules s WHERE s.study_group_id = group.id AND s.tutor_id = :tutorId)',
        { tutorId: query.tutorId },
      );
    if (query.dayOfWeek)
      groups.andWhere(
        'EXISTS (SELECT 1 FROM study_group_schedules s WHERE s.study_group_id = group.id AND s.day_of_week = :dayOfWeek)',
        { dayOfWeek: query.dayOfWeek },
      );
    const [entities, total] = await groups
      .orderBy('group.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const data = await this.toListItems(tenantId, entities);
    return { data, meta: createPaginationMeta(query.page, query.limit, total) };
  }
  async getSummary(tenantId: string): Promise<StudyGroupsSummaryResponseDto> {
    const raw = await this.dataSource
      .getRepository(StudyGroupEntity)
      .createQueryBuilder('group')
      .select('COUNT(*)', 'total')
      .addSelect("SUM(group.status = 'active')", 'active')
      .addSelect("SUM(group.status = 'inactive')", 'inactive')
      .where('group.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ total: string; active: string; inactive: string }>();
    const day = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(new Date());
    const weekday =
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day) || 7;
    const schedulesToday = await this.dataSource
      .getRepository(StudyGroupScheduleEntity)
      .createQueryBuilder('schedule')
      .innerJoin(
        StudyGroupEntity,
        'group',
        'group.id = schedule.study_group_id',
      )
      .where(
        'schedule.tenant_id = :tenantId AND schedule.day_of_week = :weekday AND group.status = :status',
        { tenantId, weekday, status: EntityStatus.Active },
      )
      .getCount();
    return {
      total: Number(raw?.total ?? 0),
      active: Number(raw?.active ?? 0),
      inactive: Number(raw?.inactive ?? 0),
      schedulesToday,
    };
  }
  async findOne(tenantId: string, id: string): Promise<StudyGroupResponseDto> {
    const group = await this.requireGroup(tenantId, id);
    const item = (await this.toListItems(tenantId, [group]))[0];
    const students = await this.dataSource
      .getRepository(StudyGroupStudentEntity)
      .find({ where: { tenantId, studyGroupId: id } });
    return {
      ...item,
      tenantId: group.tenantId,
      studentIds: students.map((student) => student.studentId),
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
  create(
    tenantId: string,
    dto: CreateStudyGroupDto,
  ): Promise<StudyGroupResponseDto> {
    return this.save(tenantId, null, dto);
  }
  update(
    tenantId: string,
    id: string,
    dto: UpdateStudyGroupDto,
  ): Promise<StudyGroupResponseDto> {
    return this.save(tenantId, id, dto);
  }
  async updateStatus(
    tenantId: string,
    id: string,
    status: EntityStatus,
  ): Promise<StudyGroupResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      const group = await this.requireGroup(tenantId, id, manager);
      if (status === EntityStatus.Active) {
        const detail = await this.loadInput(manager, tenantId, id);
        await this.validate(
          manager,
          tenantId,
          id,
          detail.schedules,
          detail.studentIds,
        );
      }
      group.status = status;
      await manager.save(group);
    });
    return this.findOne(tenantId, id);
  }
  private async save(
    tenantId: string,
    id: string | null,
    dto: CreateStudyGroupDto,
  ): Promise<StudyGroupResponseDto> {
    let savedGroupId: string | null = null;
    await this.dataSource.transaction(async (manager) => {
      this.assertScheduleTimes(dto);
      const group = id
        ? await this.requireGroup(tenantId, id, manager)
        : manager.create(StudyGroupEntity, {
            tenantId,
            name: dto.name,
            status: EntityStatus.Active,
          });
      await this.validate(
        manager,
        tenantId,
        id,
        dto.schedules,
        dto.studentIds ?? [],
      );
      group.name = dto.name;
      await manager.save(group);
      savedGroupId = group.id;
      if (id) {
        await manager.delete(StudyGroupScheduleEntity, {
          tenantId,
          studyGroupId: id,
        });
        await manager.delete(StudyGroupStudentEntity, {
          tenantId,
          studyGroupId: id,
        });
      }
      await manager.save(
        StudyGroupScheduleEntity,
        dto.schedules.map((s, index) =>
          manager.create(StudyGroupScheduleEntity, {
            tenantId,
            studyGroupId: group.id,
            tutorId: s.tutorId,
            roomId: s.roomId ?? null,
            dayOfWeek: s.dayOfWeek,
            startTime: `${s.startTime}:00`,
            endTime: `${s.endTime}:00`,
            sortOrder: index,
          }),
        ),
      );
      if (dto.studentIds?.length)
        await manager.save(
          StudyGroupStudentEntity,
          dto.studentIds.map((studentId) =>
            manager.create(StudyGroupStudentEntity, {
              tenantId,
              studyGroupId: group.id,
              studentId,
            }),
          ),
        );
    });
    if (!savedGroupId)
      throw new NotFoundException('Kelompok belajar tidak ditemukan');
    return this.findOne(tenantId, savedGroupId);
  }
  private async validate(
    manager: EntityManager,
    tenantId: string,
    selfId: string | null,
    schedules: CreateStudyGroupDto['schedules'],
    studentIds: string[],
  ): Promise<void> {
    const tutorIds = [...new Set(schedules.map((s) => s.tutorId))];
    const tutors = tutorIds.length
      ? await manager.find(TutorEntity, {
          where: { tenantId, id: In(tutorIds), status: EntityStatus.Active },
        })
      : [];
    if (tutors.length !== tutorIds.length)
      throw new BadRequestException(
        'Tentor harus aktif dan berasal dari bimbel ini',
      );
    const roomIds = [
      ...new Set(
        schedules
          .map((s) => s.roomId)
          .filter((roomId): roomId is string => Boolean(roomId)),
      ),
    ];
    const rooms = roomIds.length
      ? await manager.find(RoomEntity, {
          where: { tenantId, id: In(roomIds), status: EntityStatus.Active },
        })
      : [];
    if (rooms.length !== roomIds.length)
      throw new BadRequestException(
        'Ruangan harus aktif dan berasal dari bimbel ini',
      );
    const students = studentIds.length
      ? await manager.find(StudentEntity, {
          where: { tenantId, id: In(studentIds), status: EntityStatus.Active },
        })
      : [];
    if (students.length !== studentIds.length)
      throw new BadRequestException(
        'Siswa harus aktif dan berasal dari bimbel ini',
      );
    for (let i = 0; i < schedules.length; i += 1)
      for (let j = i + 1; j < schedules.length; j += 1)
        if (
          schedules[i].dayOfWeek === schedules[j].dayOfWeek &&
          this.overlaps(
            schedules[i].startTime,
            schedules[i].endTime,
            schedules[j].startTime,
            schedules[j].endTime,
          )
        )
          throw new ConflictException(
            schedules[i].tutorId === schedules[j].tutorId
              ? 'Tentor memiliki jadwal yang bentrok di kelompok ini'
              : 'Jadwal kelompok tidak boleh saling bertabrakan',
          );
    for (const schedule of schedules) {
      const existing = await manager
        .getRepository(StudyGroupScheduleEntity)
        .createQueryBuilder('schedule')
        .innerJoin(
          StudyGroupEntity,
          'group',
          'group.id = schedule.study_group_id',
        )
        .where(
          'schedule.tenant_id = :tenantId AND schedule.tutor_id = :tutorId AND schedule.day_of_week = :day AND group.status = :status',
          {
            tenantId,
            tutorId: schedule.tutorId,
            day: schedule.dayOfWeek,
            status: EntityStatus.Active,
          },
        )
        .andWhere(selfId ? 'schedule.study_group_id <> :selfId' : '1=1', {
          selfId,
        })
        .getMany();
      if (
        existing.some((row) =>
          this.overlaps(
            schedule.startTime,
            schedule.endTime,
            row.startTime.slice(0, 5),
            row.endTime.slice(0, 5),
          ),
        )
      )
        throw new ConflictException(
          'Tentor sudah memiliki jadwal pada waktu tersebut',
        );
    }
    if (roomIds.length) {
      const roomSchedules = await manager
        .getRepository(StudyGroupScheduleEntity)
        .createQueryBuilder('schedule')
        .innerJoin(
          StudyGroupEntity,
          'group',
          'group.id = schedule.study_group_id',
        )
        .where(
          'schedule.tenant_id = :tenantId AND schedule.room_id IN (:...roomIds) AND schedule.day_of_week IN (:...days) AND group.status = :status',
          {
            tenantId,
            roomIds,
            days: [
              ...new Set(
                schedules.filter((s) => s.roomId).map((s) => s.dayOfWeek),
              ),
            ],
            status: EntityStatus.Active,
          },
        )
        .andWhere(selfId ? 'schedule.study_group_id <> :selfId' : '1=1', {
          selfId,
        })
        .getMany();
      for (const schedule of schedules)
        if (
          schedule.roomId &&
          roomSchedules.some(
            (row) =>
              row.roomId === schedule.roomId &&
              row.dayOfWeek === schedule.dayOfWeek &&
              this.overlaps(
                schedule.startTime,
                schedule.endTime,
                row.startTime.slice(0, 5),
                row.endTime.slice(0, 5),
              ),
          )
        )
          throw new ConflictException(
            'Ruangan sudah digunakan pada rentang waktu ini. Pilih ruangan atau jam lain.',
          );
    }
    if (studentIds.length)
      for (const schedule of schedules) {
        const rows = await manager
          .getRepository(StudyGroupScheduleEntity)
          .createQueryBuilder('schedule')
          .innerJoin(
            StudyGroupEntity,
            'group',
            'group.id = schedule.study_group_id',
          )
          .innerJoin(
            StudyGroupStudentEntity,
            'member',
            'member.study_group_id = schedule.study_group_id AND member.tenant_id = schedule.tenant_id',
          )
          .where(
            'schedule.tenant_id = :tenantId AND schedule.day_of_week = :day AND member.student_id IN (:...studentIds) AND group.status = :status',
            {
              tenantId,
              day: schedule.dayOfWeek,
              studentIds,
              status: EntityStatus.Active,
            },
          )
          .andWhere(selfId ? 'schedule.study_group_id <> :selfId' : '1=1', {
            selfId,
          })
          .getMany();
        if (
          rows.some((row) =>
            this.overlaps(
              schedule.startTime,
              schedule.endTime,
              row.startTime.slice(0, 5),
              row.endTime.slice(0, 5),
            ),
          )
        )
          throw new ConflictException(
            'Salah satu siswa sudah memiliki jadwal pada waktu tersebut',
          );
      }
  }
  private assertScheduleTimes(dto: CreateStudyGroupDto) {
    if (!dto.schedules.length)
      throw new BadRequestException('Minimal satu jadwal diperlukan');
    if (dto.schedules.some((s) => s.startTime >= s.endTime))
      throw new BadRequestException('Jam selesai harus setelah jam mulai');
  }
  private overlaps(a: string, b: string, c: string, d: string) {
    return a < d && c < b;
  }
  private async requireGroup(
    tenantId: string,
    id: string,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<StudyGroupEntity> {
    const group = await manager.findOne(StudyGroupEntity, {
      where: { tenantId, id },
    });
    if (!group) throw new NotFoundException('Kelompok belajar tidak ditemukan');
    return group;
  }
  private async loadInput(
    manager: EntityManager,
    tenantId: string,
    groupId: string,
  ) {
    const schedules = await manager.find(StudyGroupScheduleEntity, {
      where: { tenantId, studyGroupId: groupId },
    });
    const members = await manager.find(StudyGroupStudentEntity, {
      where: { tenantId, studyGroupId: groupId },
    });
    return {
      schedules: schedules.map((s) => ({
        tutorId: s.tutorId,
        roomId: s.roomId ?? undefined,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime.slice(0, 5),
        endTime: s.endTime.slice(0, 5),
      })),
      studentIds: members.map((s) => s.studentId),
    };
  }
  private async toListItems(
    tenantId: string,
    groups: StudyGroupEntity[],
  ): Promise<StudyGroupListItemResponseDto[]> {
    if (!groups.length) return [];
    const ids = groups.map((g) => g.id);
    const schedules = await this.dataSource
      .getRepository(StudyGroupScheduleEntity)
      .find({
        where: { tenantId, studyGroupId: In(ids) },
        relations: { tutor: true, room: true },
        order: { sortOrder: 'ASC' },
      });
    const members = await this.dataSource
      .getRepository(StudyGroupStudentEntity)
      .find({ where: { tenantId, studyGroupId: In(ids) } });
    return groups.map((group) => {
      const groupSchedules: StudyGroupScheduleResponseDto[] = schedules
        .filter((s) => s.studyGroupId === group.id)
        .map((s) => ({
          id: s.id,
          tutorId: s.tutorId,
          tutorName: s.tutor.name,
          tutorExpertise: s.tutor.expertise,
          roomId: s.roomId,
          roomName: s.room?.name ?? null,
          roomCode: s.room?.code ?? null,
          dayOfWeek: s.dayOfWeek,
          startTime: s.startTime.slice(0, 5),
          endTime: s.endTime.slice(0, 5),
        }));
      return {
        id: group.id,
        name: group.name,
        subjects: [
          ...new Set(
            groupSchedules
              .map((s) => s.tutorExpertise)
              .filter((v): v is string => Boolean(v)),
          ),
        ],
        schedules: groupSchedules,
        studentCount: members.filter((m) => m.studyGroupId === group.id).length,
        status: group.status,
      };
    });
  }
}
