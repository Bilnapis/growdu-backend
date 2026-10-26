import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { RoomEntity } from '../rooms/entities/room.entity.js';
import { StudyGroupEntity } from '../study-groups/entities/study-group.entity.js';
import { StudyGroupScheduleEntity } from '../study-groups/entities/study-group-schedule.entity.js';
import { StudyGroupStudentEntity } from '../study-groups/entities/study-group-student.entity.js';
import { ClassSessionsService } from './class-sessions.service.js';
import { ConfigurationInputDto } from './dto/session-input.dto.js';
import { StudyGroupConfigurationEntity } from './entities/study-group-configuration.entity.js';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassSessionStudentEntity } from './entities/class-session-student.entity.js';
import { sessionDates, shiftDate } from './session-dates.js';

@Injectable()
export class ConfigurationsService {
  constructor(
    private readonly db: DataSource,
    private readonly sessions: ClassSessionsService,
  ) {}
  async history(user: AuthenticatedUser, id: string) {
    if (
      !(await this.db.manager.findOneBy(StudyGroupEntity, {
        id,
        tenantId: user.tenantId,
      }))
    )
      throw new NotFoundException();
    const configs = await this.db.manager.find(StudyGroupConfigurationEntity, {
      where: { studyGroupId: id, tenantId: user.tenantId },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    if (!configs.length) return [];
    const [rules, members] = await Promise.all([
      this.db.manager.findBy(StudyGroupScheduleEntity, {
        configurationId: In(configs.map((c) => c.id)),
      }),
      this.db.manager.findBy(StudyGroupStudentEntity, {
        configurationId: In(configs.map((c) => c.id)),
      }),
    ]);
    return configs.map((c) => ({
      ...c,
      schedules: rules.filter((r) => r.configurationId === c.id),
      studentIds: members
        .filter((s) => s.configurationId === c.id)
        .map((s) => s.studentId),
    }));
  }
  async preview(
    user: AuthenticatedUser,
    id: string,
    dto: ConfigurationInputDto,
  ) {
    this.validateRange(dto);
    if (
      !(await this.db.manager.findOneBy(StudyGroupEntity, {
        id,
        tenantId: user.tenantId,
      }))
    )
      throw new NotFoundException('Kelompok tidak ditemukan');
    const existing = await this.affected(
      this.db.manager,
      user.tenantId,
      id,
      dto.effectiveFrom,
    );
    const withAttendance = await this.attendanceSessionIds(
      this.db.manager,
      existing,
    );
    const protectedSessions = existing.filter(
      (s) => this.protected(s) || withAttendance.has(s.id),
    );
    return {
      created: dto.schedules.reduce(
        (n, r) =>
          n +
          sessionDates(dto.effectiveFrom, dto.effectiveUntil, r.dayOfWeek)
            .length,
        0,
      ),
      updated: existing.length - protectedSessions.length,
      skipped: protectedSessions.length,
      estimated: true,
    };
  }
  validateRange(dto: ConfigurationInputDto) {
    if (
      dto.effectiveFrom > dto.effectiveUntil ||
      !dto.schedules.length ||
      dto.schedules.some(
        (s) => s.dayOfWeek < 1 || s.dayOfWeek > 7 || s.startTime >= s.endTime,
      )
    )
      throw new BadRequestException('Tanggal atau jadwal tidak valid');
    if (
      new Date(dto.effectiveUntil).getTime() -
        new Date(dto.effectiveFrom).getTime() >
      366 * 5 * 86400000
    )
      throw new BadRequestException('Rentang maksimal lima tahun');
  }
  protected(s: ClassSessionEntity) {
    return (
      s.status !== 'scheduled' ||
      Boolean(s.lockedAt || s.topic || s.tutorNote) ||
      s.version > 1
    );
  }
  async attendanceSessionIds(m: EntityManager, existing: ClassSessionEntity[]) {
    const rows = existing.length
      ? await m
          .getRepository(ClassSessionStudentEntity)
          .createQueryBuilder('r')
          .select('r.session_id', 'id')
          .where('r.session_id IN (:...ids)', {
            ids: existing.map((s) => s.id),
          })
          .andWhere('(r.status IS NOT NULL OR r.note IS NOT NULL)')
          .getRawMany<{ id: string }>()
      : [];
    return new Set(rows.map((r) => r.id));
  }
  affected(m: EntityManager, tenantId: string, id: string, from: string) {
    return m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where(
        's.tenant_id=:tenantId AND s.study_group_id=:id AND (s.session_date>=:from OR s.occurrence_date>=:from)',
        { tenantId, id, from },
      )
      .getMany();
  }
  async create(
    user: AuthenticatedUser,
    id: string,
    dto: ConfigurationInputDto,
  ) {
    return this.db.transaction(async (m) => {
      await this.sessions.lockTenant(m, user.tenantId);
      return this.save(m, user, id, dto);
    });
  }
  async save(
    m: EntityManager,
    user: AuthenticatedUser,
    id: string,
    dto: ConfigurationInputDto,
  ) {
    this.validateRange(dto);
    const group = await m.findOneBy(StudyGroupEntity, {
      id,
      tenantId: user.tenantId,
    });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan');
    if (group.status !== EntityStatus.Active)
      throw new ConflictException(
        'Aktifkan kelompok sebelum menambah konfigurasi',
      );
    const configs = await m.find(StudyGroupConfigurationEntity, {
      where: {
        studyGroupId: id,
        tenantId: user.tenantId,
        supersededAt: IsNull(),
      },
      order: { effectiveFrom: 'DESC', createdAt: 'DESC' },
    });
    const students = dto.studentIds.length
      ? await m.findBy(StudentEntity, {
          id: In(dto.studentIds),
          tenantId: user.tenantId,
          status: EntityStatus.Active,
        })
      : [];
    if (students.length !== dto.studentIds.length)
      throw new BadRequestException(
        'Siswa harus aktif dan berasal dari bimbel ini',
      );
    const previous = configs.find((c) => c.effectiveUntil >= dto.effectiveFrom);
    const config = m.create(StudyGroupConfigurationEntity, {
      tenantId: user.tenantId,
      studyGroupId: id,
      effectiveFrom: dto.effectiveFrom,
      effectiveUntil: dto.effectiveUntil,
      supersedesId: previous?.id ?? configs[0]?.id ?? null,
      createdBy: user.id,
    });
    for (const old of configs.filter(
      (c) => c.effectiveUntil >= dto.effectiveFrom,
    )) {
      if (old.effectiveFrom >= dto.effectiveFrom) old.supersededAt = new Date();
      else old.effectiveUntil = shiftDate(dto.effectiveFrom, -1);
      await m.save(old);
    }
    if (dto.name) {
      group.name = dto.name;
      await m.save(group);
    }
    await m.save(config);
    const existing = await this.affected(
      m,
      user.tenantId,
      id,
      dto.effectiveFrom,
    );
    const protectedSessions = existing.filter((s) => this.protected(s));
    const replaceable = existing.filter((s) => !this.protected(s));
    // Rows with attendance are protected even if a legacy import omitted completion metadata.
    const withAttendance = await this.attendanceSessionIds(m, existing);
    const removable = replaceable.filter((s) => !withAttendance.has(s.id));
    protectedSessions.push(
      ...replaceable.filter((s) => withAttendance.has(s.id)),
    );
    if (removable.length) {
      await m.delete(ClassSessionStudentEntity, {
        sessionId: In(removable.map((s) => s.id)),
      });
      await m.delete(ClassSessionEntity, {
        id: In(removable.map((s) => s.id)),
      });
    }
    await m.save(
      StudyGroupStudentEntity,
      students.map((s) =>
        m.create(StudyGroupStudentEntity, {
          tenantId: user.tenantId,
          studyGroupId: id,
          configurationId: config.id,
          studentId: s.id,
        }),
      ),
    );
    let created = 0;
    for (const [index, input] of dto.schedules.entries()) {
      const tutor = await m.findOneBy(TutorEntity, {
        id: input.tutorId,
        tenantId: user.tenantId,
        status: EntityStatus.Active,
      });
      if (!tutor) throw new BadRequestException('Tentor tidak valid');
      if (
        input.roomId &&
        !(await m.findOneBy(RoomEntity, {
          id: input.roomId,
          tenantId: user.tenantId,
          status: EntityStatus.Active,
        }))
      )
        throw new BadRequestException(
          'Ruangan harus aktif dan berasal dari bimbel ini',
        );
      const oldRule = input.id
        ? await m.findOneBy(StudyGroupScheduleEntity, {
            id: input.id,
            studyGroupId: id,
            tenantId: user.tenantId,
          })
        : configs[0]
          ? await m.findOneBy(StudyGroupScheduleEntity, {
              configurationId: configs[0].id,
              sortOrder: index,
            })
          : null;
      if (input.id && !oldRule)
        throw new BadRequestException(
          'Rule jadwal tidak berasal dari kelompok ini',
        );
      const rule = m.create(StudyGroupScheduleEntity, {
        seriesId: oldRule?.seriesId ?? randomUUID(),
        tenantId: user.tenantId,
        studyGroupId: id,
        configurationId: config.id,
        tutorId: input.tutorId,
        roomId: input.roomId ?? null,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        sortOrder: index,
      });
      await m.save(rule);
      for (const date of sessionDates(
        dto.effectiveFrom,
        dto.effectiveUntil,
        input.dayOfWeek,
      )) {
        // Keep the identity of an overridden occurrence even when it moved to another date.
        const monday = (value: string) =>
          shiftDate(
            value,
            1 - (new Date(value + 'T00:00:00Z').getUTCDay() || 7),
          );
        const preserved = protectedSessions.some(
          (s) =>
            (s.seriesId === rule.seriesId &&
              monday(s.occurrenceDate) === monday(date)) ||
            (s.sessionDate === date &&
              s.startTime.slice(0, 5) === input.startTime),
        );
        if (preserved) continue;
        const session = m.create(ClassSessionEntity, {
          id: randomUUID(),
          tenantId: user.tenantId,
          studyGroupId: id,
          configurationId: config.id,
          scheduleRuleId: rule.id,
          seriesId: rule.seriesId,
          occurrenceDate: date,
          sessionDate: date,
          startTime: input.startTime,
          endTime: input.endTime,
          tutorId: rule.tutorId,
          roomId: rule.roomId,
          studyGroupName: group.name,
          subject: tutor.expertise,
          status: 'scheduled',
          version: 1,
        });
        await this.sessions.assertAvailable(m, session, dto.studentIds);
        await m.save(session);
        await m.save(
          ClassSessionStudentEntity,
          students.map((s) =>
            m.create(ClassSessionStudentEntity, {
              sessionId: session.id,
              studentId: s.id,
              name: s.name,
              school: s.school,
              educationLevel: s.educationLevel,
              status: null,
              note: null,
            }),
          ),
        );
        created++;
      }
    }
    return {
      configurationId: config.id,
      created,
      updated: removable.length,
      skipped: protectedSessions.length,
    };
  }
}
