import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager, In, IsNull, Not } from 'typeorm';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import { ClassSessionStudentEntity } from '../class-sessions/entities/class-session-student.entity.js';
import { StudyGroupEntity } from '../study-groups/entities/study-group.entity.js';
import { TenantEntity } from '../tenants/entities/tenant.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { LearningReportEntity } from './entities/learning-report.entity.js';
import { shiftMonth } from './report-rules.js';
import type { ReportSnapshot } from './report-types.js';

@Injectable()
export class ReportSourceService {
  constructor(readonly db: DataSource) {}
  async lock(m: EntityManager, tenantId: string) {
    const tenant = await m.findOne(TenantEntity, {
      where: { id: tenantId },
      select: { id: true },
      lock: { mode: 'pessimistic_write' },
    });
    if (!tenant) throw new NotFoundException('Bimbel tidak ditemukan.');
  }
  async myTutor(user: AuthenticatedUser, m = this.db.manager) {
    const tutor = await m.findOne(TutorEntity, {
      where: { tenantId: user.tenantId, userId: user.id },
      select: { id: true },
    });
    if (!tutor) throw new ForbiddenException('Profil tentor tidak tersedia.');
    return tutor.id;
  }
  async authorize(
    user: AuthenticatedUser,
    groupId: string,
    period: string,
    m = this.db.manager,
  ) {
    const group = await m.findOne(StudyGroupEntity, {
      where: { id: groupId, tenantId: user.tenantId },
      select: { id: true, name: true },
    });
    if (!group) throw new NotFoundException('Kelompok tidak ditemukan.');
    if (user.role === 'tutor') {
      const tutorId = await this.myTutor(user, m);
      const session = await this.sessions(m, user.tenantId, groupId, period)
        .andWhere('s.tutor_id=:tutorId', { tutorId })
        .getExists();
      const report = await m.existsBy(LearningReportEntity, {
        tenantId: user.tenantId,
        studyGroupId: groupId,
        period,
        tutorId,
        publishedRevisionId: Not(IsNull()),
      });
      if (!session && !report)
        throw new ForbiddenException(
          'Anda tidak ditugaskan pada kelompok dan periode ini.',
        );
    }
    return group;
  }
  sessions(
    m: EntityManager,
    tenantId: string,
    groupId: string,
    period: string,
  ) {
    return m
      .createQueryBuilder(ClassSessionEntity, 's')
      .where('s.tenant_id=:tenantId AND s.study_group_id=:groupId', {
        tenantId,
        groupId,
      })
      .andWhere('s.session_date>=:start AND s.session_date<:end', {
        start: period + '-01',
        end: shiftMonth(period, 1) + '-01',
      })
      .andWhere("s.status<>'cancelled'");
  }
  async load(
    m: EntityManager,
    tenantId: string,
    groupId: string,
    period: string,
  ) {
    const [group, tenant, sessions, reports] = await Promise.all([
      m.findOne(StudyGroupEntity, {
        where: { id: groupId, tenantId },
        select: { id: true, name: true },
      }),
      m.findOne(TenantEntity, {
        where: { id: tenantId },
        select: { id: true, name: true },
      }),
      this.sessions(m, tenantId, groupId, period)
        .select([
          's.id',
          's.tutorId',
          's.version',
          's.sessionDate',
          's.status',
          's.subject',
        ])
        .orderBy('s.sessionDate', 'ASC')
        .addOrderBy('s.id', 'ASC')
        .getMany(),
      m.find(LearningReportEntity, {
        where: { tenantId, studyGroupId: groupId, period },
        select: { tutorId: true },
      }),
    ]);
    if (!group || !tenant)
      throw new NotFoundException('Kelompok tidak ditemukan.');
    const tutorIds = [
      ...new Set([
        ...sessions.map((s) => s.tutorId),
        ...reports.map((r) => r.tutorId),
      ]),
    ];
    const [students, tutors] = await Promise.all([
      sessions.length
        ? m.find(ClassSessionStudentEntity, {
            where: { sessionId: In(sessions.map((s) => s.id)) },
            select: {
              sessionId: true,
              studentId: true,
              name: true,
              school: true,
              educationLevel: true,
              status: true,
            },
            order: { studentId: 'ASC' },
          })
        : [],
      tutorIds.length
        ? m.find(TutorEntity, {
            where: { tenantId, id: In(tutorIds) },
            select: { id: true, name: true },
            order: { name: 'ASC' },
          })
        : [],
    ]);
    const bySession = new Map<string, ClassSessionStudentEntity[]>();
    for (const student of students) {
      const roster = bySession.get(student.sessionId) ?? [];
      roster.push(student);
      bySession.set(student.sessionId, roster);
    }
    const snapshots = new Map<string, ReportSnapshot>();
    for (const tutor of tutors) {
      const own = sessions.filter((s) => s.tutorId === tutor.id);
      snapshots.set(tutor.id, {
        tenantName: tenant.name,
        groupName: group.name,
        tutorName: tutor.name,
        subject: [
          ...new Set(own.flatMap((s) => (s.subject ? [s.subject] : []))),
        ].join(', '),
        sessions: own.map((s) => ({
          id: s.id,
          version: s.version,
          date: s.sessionDate,
          status: s.status === 'completed' ? 'completed' : 'scheduled',
          students: (bySession.get(s.id) ?? []).map((student) => ({
            id: student.studentId,
            name: student.name,
            school: student.school,
            educationLevel: student.educationLevel,
            status: student.status,
          })),
        })),
      });
    }
    return { groupName: group.name, tutors, snapshots };
  }
}
