import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ConfigurationsService } from '../class-sessions/configurations.service.js';
import { ClassSessionsService } from '../class-sessions/class-sessions.service.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import { StudyGroupConfigurationEntity } from '../class-sessions/entities/study-group-configuration.entity.js';
import { jakartaDate, legacyEndDate } from '../class-sessions/session-dates.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
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
import { StudentEntity } from '../students/entities/student.entity.js';
import { StudyGroupFormOptionsDto, StudyGroupStudentOptionDto } from './dto/study-group-options.dto.js';

@Injectable()
export class StudyGroupsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly configurations: ConfigurationsService,
    private readonly sessions: ClassSessionsService,
  ) {}

  async getFormOptions(tenantId: string): Promise<StudyGroupFormOptionsDto> {
    const [scheduling, students] = await Promise.all([
      this.sessions.getSchedulingOptions(tenantId),
      this.dataSource.manager.find(StudentEntity, {
        where: { tenantId, status: EntityStatus.Active },
        select: { id: true, name: true, educationLevel: true, school: true, address: true, status: true },
        order: { name: 'ASC' },
        take: 100,
      }),
    ]);
    return {
      ...scheduling,
      students: students.map(({ id, name, educationLevel, school, address, status }) => ({
        id, name, educationLevel, school, address, status,
      })),
    };
  }

  async getStudents(tenantId: string, id: string): Promise<StudyGroupStudentOptionDto[]> {
    const group = await this.findOne(tenantId, id);
    if (group.studentIds.length === 0) return [];
    const students = await this.dataSource.manager.find(StudentEntity, {
      where: { tenantId, id: In(group.studentIds) },
      select: { id: true, name: true, educationLevel: true, school: true, status: true },
      order: { name: 'ASC' },
    });
    return students.map(({ id: studentId, name, educationLevel, school, status }) => ({
      id: studentId, name, educationLevel, school, status,
    }));
  }
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
        '(group.name LIKE :search OR EXISTS (SELECT 1 FROM study_group_schedules s INNER JOIN tutors t ON t.id = s.tutor_id WHERE s.study_group_id = group.id AND s.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id = group.id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC, c.created_at DESC LIMIT 1) AND t.name LIKE :search))',
        { search: `%${query.search}%` },
      );
    if (query.status)
      groups.andWhere('group.status = :status', { status: query.status });
    if (query.tutorId)
      groups.andWhere(
        'EXISTS (SELECT 1 FROM study_group_schedules s WHERE s.study_group_id = group.id AND s.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id = group.id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC, c.created_at DESC LIMIT 1) AND s.tutor_id = :tutorId)',
        { tutorId: query.tutorId },
      );
    if (query.dayOfWeek)
      groups.andWhere(
        'EXISTS (SELECT 1 FROM study_group_schedules s WHERE s.study_group_id = group.id AND s.configuration_id = (SELECT c.id FROM study_group_configurations c WHERE c.study_group_id = group.id AND c.superseded_at IS NULL ORDER BY c.effective_from DESC, c.created_at DESC LIMIT 1) AND s.day_of_week = :dayOfWeek)',
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
    const today = jakartaDate();
    const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
    const raw = await this.dataSource
      .getRepository(StudyGroupEntity)
      .createQueryBuilder('group')
      .select('COUNT(*)', 'total')
      .addSelect('SUM(group.created_at < :monthStart)', 'previousMonthTotal')
      .setParameter('monthStart', monthStart)
      .addSelect("SUM(group.status = 'active')", 'active')
      .addSelect("SUM(group.status = 'inactive')", 'inactive')
      .where('group.tenant_id = :tenantId', { tenantId })
      .getRawOne<{
        total: string;
        previousMonthTotal: string | null;
        active: string;
        inactive: string;
      }>();
    const schedulesToday = await this.dataSource
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('session')
      .where(
        'session.tenant_id = :tenantId AND session.session_date = :today AND session.status <> :cancelled',
        { tenantId, today, cancelled: 'cancelled' },
      )
      .getCount();
    return {
      total: Number(raw?.total ?? 0),
      previousMonthTotal: Number(raw?.previousMonthTotal ?? 0),
      active: Number(raw?.active ?? 0),
      inactive: Number(raw?.inactive ?? 0),
      schedulesToday,
    };
  }
  async findOne(tenantId: string, id: string): Promise<StudyGroupResponseDto> {
    const group = await this.requireGroup(tenantId, id);
    const item = (await this.toListItems(tenantId, [group]))[0];
    const latest = await this.dataSource.manager.findOne(
      StudyGroupConfigurationEntity,
      {
        where: { tenantId, studyGroupId: id, supersededAt: IsNull() },
        order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
      },
    );
    const students = await this.dataSource
      .getRepository(StudyGroupStudentEntity)
      .find({
        where: {
          tenantId,
          studyGroupId: id,
          ...(latest ? { configurationId: latest.id } : {}),
        },
      });
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
    actor: AuthenticatedUser,
  ): Promise<StudyGroupResponseDto> {
    return this.save(tenantId, null, dto, actor);
  }
  update(
    tenantId: string,
    id: string,
    dto: UpdateStudyGroupDto,
    actor: AuthenticatedUser,
  ): Promise<StudyGroupResponseDto> {
    return this.save(tenantId, id, dto, actor);
  }
  async updateStatus(
    tenantId: string,
    id: string,
    status: EntityStatus,
  ): Promise<StudyGroupResponseDto> {
    await this.dataSource.transaction(async (manager) => {
      await this.sessions.lockTenant(manager, tenantId);
      const group = await this.requireGroup(tenantId, id, manager);
      group.status = status;
      await manager.save(group);
    });
    return this.findOne(tenantId, id);
  }
  private async save(
    tenantId: string,
    id: string | null,
    dto: CreateStudyGroupDto,
    actor: AuthenticatedUser,
  ): Promise<StudyGroupResponseDto> {
    const savedGroupId = await this.dataSource.transaction(async (manager) => {
      await this.sessions.lockTenant(manager, tenantId);
      const group = id
        ? await this.requireGroup(tenantId, id, manager)
        : manager.create(StudyGroupEntity, {
            tenantId,
            name: dto.name,
            status: EntityStatus.Active,
          });
      await manager.save(group);
      const effectiveFrom = dto.effectiveFrom ?? jakartaDate();
      await this.configurations.save(manager, actor, group.id, {
        name: dto.name,
        effectiveFrom,
        effectiveUntil: dto.effectiveUntil ?? legacyEndDate(effectiveFrom),
        schedules: dto.schedules,
        studentIds: dto.studentIds ?? [],
      });
      return group.id;
    });
    return this.findOne(tenantId, savedGroupId);
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
  private async toListItems(
    tenantId: string,
    groups: StudyGroupEntity[],
  ): Promise<StudyGroupListItemResponseDto[]> {
    if (!groups.length) return [];
    const ids = groups.map((g) => g.id);
    const configurations = await this.dataSource.manager.find(
      StudyGroupConfigurationEntity,
      {
        where: { tenantId, studyGroupId: In(ids), supersededAt: IsNull() },
        order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
      },
    );
    const selected = new Map<string, string>();
    for (const c of configurations)
      if (!selected.has(c.studyGroupId)) selected.set(c.studyGroupId, c.id);
    const configurationIds = [...selected.values()];
    const schedules = await this.dataSource
      .getRepository(StudyGroupScheduleEntity)
      .find({
        where: {
          tenantId,
          studyGroupId: In(ids),
          ...(configurationIds.length
            ? { configurationId: In(configurationIds) }
            : {}),
        },
        relations: { tutor: true, room: true },
        order: { sortOrder: 'ASC' },
      });
    const members = await this.dataSource
      .getRepository(StudyGroupStudentEntity)
      .find({
        where: {
          tenantId,
          studyGroupId: In(ids),
          ...(configurationIds.length
            ? { configurationId: In(configurationIds) }
            : {}),
        },
      });
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
