import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { RoomEntity } from '../rooms/entities/room.entity.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { createPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassSessionStudentEntity } from './entities/class-session-student.entity.js';
import {
  SessionOverrideDto,
  SessionQueryDto,
  SessionRecordDto,
} from './dto/session-input.dto.js';

@Injectable()
export class ClassSessionsService {
  constructor(private readonly db: DataSource) {}
  async lockTenant(m: EntityManager, tenantId: string) {
    const tenant = await m.findOne(TenantEntity, {
      where: { id: tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tenant) throw new NotFoundException('Bimbel tidak ditemukan');
  }
  async list(user: AuthenticatedUser, query: SessionQueryDto) {
    if (query.from && query.to && query.from > query.to)
      throw new BadRequestException('Rentang tanggal tidak valid');
    const qb = this.db
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where('s.tenant_id=:tenant', { tenant: user.tenantId });
    if (user.role === 'tutor')
      qb.andWhere('s.tutor_id IN (SELECT id FROM tutors WHERE user_id=:user)', {
        user: user.id,
      });
    if (query.from) qb.andWhere('s.session_date>=:from', { from: query.from });
    if (query.to) qb.andWhere('s.session_date<=:to', { to: query.to });
    if (query.studyGroupId)
      qb.andWhere('s.study_group_id=:group', { group: query.studyGroupId });
    if (query.tutorId)
      qb.andWhere('s.tutor_id=:tutor', { tutor: query.tutorId });
    if (query.status) qb.andWhere('s.status=:status', { status: query.status });
    if (query.search)
      qb.andWhere('s.study_group_name LIKE :search', {
        search: '%' + query.search + '%',
      });
    if (query.attendanceStatus)
      qb.andWhere(
        query.attendanceStatus === 'saved'
          ? "s.status='completed'"
          : "s.status='scheduled'",
      );
    const [rows, total] = await qb
      .orderBy('s.session_date', 'ASC')
      .addOrderBy('s.start_time', 'ASC')
      .addOrderBy('s.id', 'ASC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const [tutors, rooms, counts] = rows.length
      ? await Promise.all([
          this.db.manager.findBy(TutorEntity, {
            id: In([...new Set(rows.map((s) => s.tutorId))]),
            tenantId: user.tenantId,
          }),
          this.db.manager.findBy(RoomEntity, {
            id: In(rows.flatMap((s) => (s.roomId ? [s.roomId] : []))),
            tenantId: user.tenantId,
          }),
          this.db
            .getRepository(ClassSessionStudentEntity)
            .createQueryBuilder('r')
            .select('r.session_id', 'id')
            .addSelect('COUNT(*)', 'count')
            .where('r.session_id IN (:...ids)', { ids: rows.map((s) => s.id) })
            .groupBy('r.session_id')
            .getRawMany<{ id: string; count: string }>(),
        ])
      : [[], [], []];
    const data = rows.map((s) => ({
      ...s,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      tutorName: tutors.find((t) => t.id === s.tutorId)?.name ?? '',
      roomName: rooms.find((r) => r.id === s.roomId)?.name ?? null,
      roomCode: rooms.find((r) => r.id === s.roomId)?.code ?? null,
      studentCount: Number(counts.find((c) => c.id === s.id)?.count ?? 0),
      attendanceStatus: s.status === 'completed' ? 'saved' : 'pending',
    }));
    return { data, meta: createPaginationMeta(query.page, query.limit, total) };
  }
  async require(m: EntityManager, user: AuthenticatedUser, id: string) {
    const session = await m.findOneBy(ClassSessionEntity, {
      id,
      tenantId: user.tenantId,
    });
    if (!session) throw new NotFoundException('Sesi tidak ditemukan');
    if (user.role === 'tutor') {
      const tutor = await m.findOneBy(TutorEntity, {
        id: session.tutorId,
        tenantId: user.tenantId,
        userId: user.id,
      });
      if (!tutor)
        throw new ForbiddenException('Anda tidak ditugaskan pada sesi ini');
    }
    return session;
  }
  async detail(user: AuthenticatedUser, id: string) {
    return this.present(
      this.db.manager,
      await this.require(this.db.manager, user, id),
      true,
    );
  }
  async present(
    m: EntityManager,
    s: ClassSessionEntity,
    withStudents: boolean,
  ) {
    const [tutor, room, students] = await Promise.all([
      m.findOneBy(TutorEntity, { id: s.tutorId, tenantId: s.tenantId }),
      s.roomId
        ? m.findOneBy(RoomEntity, { id: s.roomId, tenantId: s.tenantId })
        : null,
      m.find(ClassSessionStudentEntity, {
        where: { sessionId: s.id },
        order: { name: 'ASC' },
      }),
    ]);
    return {
      ...s,
      startTime: s.startTime.slice(0, 5),
      endTime: s.endTime.slice(0, 5),
      tutorName: tutor?.name ?? '',
      roomName: room?.name ?? null,
      roomCode: room?.code ?? null,
      dayOfWeek: new Date(s.sessionDate + 'T00:00:00Z').getUTCDay() || 7,
      studentCount: students.length,
      attendanceStatus:
        s.status === 'completed' ? ('saved' as const) : ('pending' as const),
      ...(withStudents ? { students } : {}),
    };
  }
  async assertAvailable(
    m: EntityManager,
    s: ClassSessionEntity,
    studentIds: string[],
  ) {
    if (s.startTime.slice(0, 5) >= s.endTime.slice(0, 5))
      throw new BadRequestException('Jam selesai harus setelah jam mulai');
    const tutor = await m.findOneBy(TutorEntity, {
      id: s.tutorId,
      tenantId: s.tenantId,
      status: EntityStatus.Active,
    });
    if (!tutor)
      throw new BadRequestException(
        'Tentor harus aktif dan berasal dari bimbel ini',
      );
    if (
      s.roomId &&
      !(await m.findOneBy(RoomEntity, {
        id: s.roomId,
        tenantId: s.tenantId,
        status: EntityStatus.Active,
      }))
    )
      throw new BadRequestException('Ruangan tidak tersedia');
    const qb = m
      .getRepository(ClassSessionEntity)
      .createQueryBuilder('s')
      .where(
        's.tenant_id=:tenant AND s.session_date=:date AND s.id<>:id AND s.status<>:cancelled',
        {
          tenant: s.tenantId,
          date: s.sessionDate,
          id: s.id,
          cancelled: 'cancelled',
        },
      )
      .andWhere('s.start_time<:end AND s.end_time>:start', {
        start: s.startTime,
        end: s.endTime,
      });
    const overlaps = await qb.getMany();
    for (const other of overlaps) {
      if (s.roomId && other.roomId === s.roomId)
        throw new ConflictException(
          'Ruangan sudah digunakan pada tanggal dan rentang waktu ini',
        );
      if (other.tutorId === s.tutorId || other.studyGroupId === s.studyGroupId)
        throw new ConflictException(
          'Jadwal bentrok dengan sesi lain pada tanggal ini',
        );
    }
    if (studentIds.length && overlaps.length) {
      const count = await m
        .getRepository(ClassSessionStudentEntity)
        .createQueryBuilder('r')
        .where('r.session_id IN (:...sessions)', {
          sessions: overlaps.map((s) => s.id),
        })
        .andWhere('r.student_id IN (:...students)', { students: studentIds })
        .getCount();
      if (count)
        throw new ConflictException('Siswa memiliki sesi lain pada waktu ini');
    }
  }
  checkVersion(s: ClassSessionEntity, version: number) {
    if (s.version !== version)
      throw new ConflictException('Sesi telah berubah. Muat ulang data.');
    if (s.lockedAt)
      throw new ConflictException('Sesi terkunci untuk penggajian');
  }
  async audit(
    m: EntityManager,
    s: ClassSessionEntity,
    userId: string,
    action: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    await m.query(
      'INSERT INTO class_session_audits (id,session_id,actor_id,action,reason,before_data,after_data) VALUES (?,?,?,?,?,?,?)',
      [
        randomUUID(),
        s.id,
        userId,
        action,
        reason ?? null,
        JSON.stringify(before),
        JSON.stringify(after),
      ],
    );
  }
  async record(user: AuthenticatedUser, id: string, dto: SessionRecordDto) {
    await this.db.transaction(async (m) => {
      await this.lockTenant(m, user.tenantId);
      const s = await this.require(m, user, id);
      this.checkVersion(s, dto.version);
      if (s.status === 'cancelled')
        throw new ConflictException('Sesi sudah dibatalkan');
      const roster = await m.findBy(ClassSessionStudentEntity, {
        sessionId: id,
      });
      const records = new Map(dto.attendance.map((r) => [r.studentId, r]));
      if (
        !roster.length ||
        records.size !== roster.length ||
        dto.attendance.length !== roster.length ||
        roster.some((r) => !records.has(r.studentId))
      )
        throw new BadRequestException(
          'Presensi harus memuat seluruh siswa sesi tepat satu kali',
        );
      const before = {
        session: { ...s },
        students: roster.map((r) => ({ ...r })),
      };
      for (const student of roster) {
        const record = records.get(student.studentId);
        if (!record) throw new BadRequestException('Presensi belum lengkap');
        student.status = record.status;
        student.note = record.note?.trim() || null;
      }
      s.topic = dto.topic;
      s.tutorNote = dto.tutorNote?.trim() || null;
      s.status = 'completed';
      s.completedAt = s.completedAt ?? new Date();
      s.completedBy = s.completedBy ?? user.id;
      s.version += 1;
      await m.save(roster);
      await m.save(s);
      await this.audit(m, s, user.id, 'record', before, {
        session: s,
        students: roster,
      });
    });
    return this.detail(user, id);
  }
  async override(user: AuthenticatedUser, id: string, dto: SessionOverrideDto) {
    if (user.role === 'tutor') throw new ForbiddenException();
    await this.db.transaction(async (m) => {
      await this.lockTenant(m, user.tenantId);
      const s = await this.require(m, user, id);
      this.checkVersion(s, dto.version);
      if (s.status !== 'scheduled')
        throw new ConflictException(
          'Hanya sesi belum selesai dapat dijadwal ulang atau dibatalkan',
        );
      const before = { ...s };
      if (dto.sessionDate) s.sessionDate = dto.sessionDate;
      if (dto.startTime) s.startTime = dto.startTime;
      if (dto.endTime) s.endTime = dto.endTime;
      if (dto.tutorId) s.tutorId = dto.tutorId;
      if (dto.roomId) s.roomId = dto.roomId;
      if (dto.status) s.status = dto.status;
      if (s.status !== 'cancelled') {
        const roster = await m.findBy(ClassSessionStudentEntity, {
          sessionId: id,
        });
        await this.assertAvailable(
          m,
          s,
          roster.map((r) => r.studentId),
        );
      }
      s.version += 1;
      await m.save(s);
      await this.audit(m, s, user.id, 'override', before, s, dto.reason);
    });
    return this.detail(user, id);
  }
}
