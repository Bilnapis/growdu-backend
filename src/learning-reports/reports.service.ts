import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { createPaginationMeta } from '../common/dto/pagination-query.dto.js';
import { StudyGroupEntity } from '../study-groups/entities/study-group.entity.js';
import {
  LearningReportEntity,
  LearningReportEventEntity,
  LearningReportRevisionEntity,
  LearningReportStudentNoteEntity,
} from './entities/learning-report.entity.js';
import type {
  CreateReportDto,
  ReportGroupQueryDto,
  ReviseReportDto,
  SaveReportDto,
} from './dto/report-input.dto.js';
import { ReportSourceService } from './report-source.service.js';
import {
  attendance,
  readyToPublish,
  reportStatus,
  shiftMonth,
  sourceFingerprint,
} from './report-rules.js';
import { emptyContent } from './report-types.js';

type GroupRow = {
  id: string;
  name: string;
  tutorNames: string;
  required: number | string;
  drafts: number | string;
  published: number | string;
  studentCount: number | string;
  sessionCount: number | string;
};

@Injectable()
export class ReportsService {
  constructor(readonly source: ReportSourceService) {}
  private async groupQuery(
    user: AuthenticatedUser,
    query: ReportGroupQueryDto,
  ) {
    // Aggregate assignments before pagination; never load monthly rosters for a list.
    const assignments =
      "SELECT study_group_id group_id,tutor_id,1 expected,0 drafts,0 published FROM class_sessions WHERE tenant_id=:tenantId AND session_date>=:start AND session_date<:end AND status<>'cancelled' UNION ALL SELECT study_group_id group_id,tutor_id,IF(published_revision_id IS NULL,0,1) expected,IF(draft_revision_id IS NULL,0,1),IF(published_revision_id IS NULL,0,1) FROM learning_reports WHERE tenant_id=:tenantId AND period=:period";
    const tutors =
      'SELECT group_id,tutor_id,MAX(expected) expected,MAX(drafts) drafts,MAX(published) published FROM (' +
      assignments +
      ') assignments GROUP BY group_id,tutor_id';
    const stats =
      "SELECT group_id,SUM(expected) required,SUM(drafts) drafts,SUM(published) published,GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR ', ') tutorNames,MAX(IF(tutor_id=:myTutor AND expected=1,1,0)) own FROM (" +
      tutors +
      ') a JOIN tutors t ON t.id=a.tutor_id AND t.tenant_id=:tenantId GROUP BY group_id';
    const myTutor =
      user.role === 'tutor' ? await this.source.myTutor(user) : '';
    const qb = this.source.db
      .createQueryBuilder(StudyGroupEntity, 'g')
      .innerJoin('(' + stats + ')', 'stats', 'stats.group_id=g.id')
      .where('g.tenant_id=:tenantId', {
        tenantId: user.tenantId,
        period: query.period,
        start: query.period + '-01',
        end: shiftMonth(query.period, 1) + '-01',
        myTutor,
      });
    if (myTutor) qb.andWhere('stats.own=1');
    if (query.search)
      qb.andWhere('(g.name LIKE :search OR stats.tutorNames LIKE :search)', {
        search: '%' + query.search + '%',
      });
    if (query.status === 'published')
      qb.andWhere('stats.required>0 AND stats.published=stats.required');
    if (query.status === 'partially_published')
      qb.andWhere('stats.published>0 AND stats.published<stats.required');
    if (query.status === 'draft')
      qb.andWhere('stats.published=0 AND stats.drafts>0');
    if (query.status === 'unfilled')
      qb.andWhere('stats.published=0 AND stats.drafts=0');
    return qb;
  }
  async list(user: AuthenticatedUser, query: ReportGroupQueryDto) {
    const qb = await this.groupQuery(user, query);
    const total = await qb.clone().getCount();
    const rows = await qb
      .select('g.id', 'id')
      .addSelect('g.name', 'name')
      .addSelect('stats.tutorNames', 'tutorNames')
      .addSelect('stats.required', 'required')
      .addSelect('stats.drafts', 'drafts')
      .addSelect('stats.published', 'published')
      .addSelect(
        "(SELECT COUNT(DISTINCT roster.student_id) FROM class_sessions cs JOIN class_session_students roster ON roster.session_id=cs.id WHERE cs.tenant_id=:tenantId AND cs.study_group_id=g.id AND cs.session_date>=:start AND cs.session_date<:end AND cs.status<>'cancelled')",
        'studentCount',
      )
      .addSelect(
        "(SELECT COUNT(*) FROM class_sessions cs WHERE cs.tenant_id=:tenantId AND cs.study_group_id=g.id AND cs.session_date>=:start AND cs.session_date<:end AND cs.status<>'cancelled')",
        'sessionCount',
      )
      .orderBy('g.name', 'ASC')
      .addOrderBy('g.id', 'ASC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<GroupRow>();
    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        period: query.period,
        tutorNames: row.tutorNames,
        required: Number(row.required),
        published: Number(row.published),
        studentCount: Number(row.studentCount),
        sessionCount: Number(row.sessionCount),
        status: reportStatus(
          Number(row.required),
          Number(row.drafts),
          Number(row.published),
        ),
      })),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }
  async summary(user: AuthenticatedUser, query: ReportGroupQueryDto) {
    const qb = await this.groupQuery(user, {
      ...query,
      search: undefined,
      status: undefined,
    });
    qb.andWhere('stats.required>0');
    const row = await qb
      .select('COUNT(*)', 'total')
      .addSelect(
        'COALESCE(SUM(stats.required>0 AND stats.published=stats.required),0)',
        'published',
      )
      .getRawOne<{ total: string; published: string }>();
    return {
      total: Number(row?.total ?? 0),
      published: Number(row?.published ?? 0),
      pending: Number(row?.total ?? 0) - Number(row?.published ?? 0),
    };
  }
  async detail(user: AuthenticatedUser, groupId: string, period: string) {
    const m = this.source.db.manager;
    await this.source.authorize(user, groupId, period);
    const myTutor =
      user.role === 'tutor' ? await this.source.myTutor(user) : null;
    const [scope, reports] = await Promise.all([
      this.source.load(m, user.tenantId, groupId, period),
      m.find(LearningReportEntity, {
        where: { tenantId: user.tenantId, studyGroupId: groupId, period },
        order: { tutorId: 'ASC' },
      }),
    ]);
    const reportIds = reports.map((r) => r.id);
    const revisionIds = reports.flatMap((r) =>
      [r.draftRevisionId, r.publishedRevisionId].filter(
        (id): id is string => id !== null,
      ),
    );
    const revisions = revisionIds.length
      ? await m.find(LearningReportRevisionEntity, {
          where: { id: In(revisionIds) },
          order: { number: 'ASC' },
        })
      : [];
    const history = reportIds.length
      ? await m.find(LearningReportRevisionEntity, {
          where: { reportId: In(reportIds) },
          select: { reportId: true, number: true, publishedAt: true },
          order: { number: 'DESC' },
          take: 1000,
        })
      : [];
    const readable = revisions.filter(
      (rev) =>
        rev.publishedAt ||
        reports.some(
          (r) =>
            r.id === rev.reportId &&
            (myTutor === null || myTutor === r.tutorId),
        ),
    );
    const notes = readable.length
      ? await m.find(LearningReportStudentNoteEntity, {
          where: { revisionId: In(readable.map((r) => r.id)) },
          order: { studentId: 'ASC' },
        })
      : [];
    const events = reportIds.length
      ? await m.find(LearningReportEventEntity, {
          where: { reportId: In(reportIds) },
          order: { createdAt: 'DESC' },
          take: 1000,
        })
      : [];
    const contributions = scope.tutors.map((tutor) => {
      const report = reports.find((r) => r.tutorId === tutor.id);
      const live = scope.snapshots.get(tutor.id);
      if (!live) throw new NotFoundException('Data tentor tidak ditemukan.');
      const canEdit = myTutor === null || myTutor === tutor.id;
      const revision = (id: string | null | undefined) => {
        const rev = readable.find((r) => r.id === id);
        return rev
          ? {
              id: rev.id,
              number: rev.number,
              content: rev.content,
              snapshot: rev.snapshot,
              publishedAt: rev.publishedAt,
              notes: notes
                .filter((n) => n.revisionId === rev.id)
                .map((n) => ({ studentId: n.studentId, note: n.note })),
            }
          : null;
      };
      const published = revision(report?.publishedRevisionId);
      const draft = canEdit ? revision(report?.draftRevisionId) : null;
      return {
        id: report?.id ?? null,
        tutorId: tutor.id,
        tutorName: tutor.name,
        required: live.sessions.length > 0 || Boolean(published),
        version: report?.version ?? 0,
        canEdit,
        revising: Boolean(
          report?.publishedRevisionId && report?.draftRevisionId,
        ),
        live: canEdit ? live : null,
        attendance: attendance(live.sessions),
        draft,
        published,
        sourceChanged: Boolean(
          published?.snapshot &&
          sourceFingerprint(published.snapshot) !== sourceFingerprint(live),
        ),
        history: history
          .filter((r) => r.reportId === report?.id && r.publishedAt)
          .map((r) => ({ number: r.number, publishedAt: r.publishedAt })),
        events: events
          .filter(
            (e) =>
              e.reportId === report?.id &&
              (canEdit || e.action === 'published'),
          )
          .map((e) => ({
            action: e.action,
            reason: e.details.reason ?? null,
            revision: e.details.revision,
            createdAt: e.createdAt,
          })),
      };
    });
    const publishedCount = reports.filter((r) => r.publishedRevisionId).length;
    const required = contributions.filter((c) => c.required).length;
    const allSessions = [...scope.snapshots.values()].flatMap(
      (s) => s.sessions,
    );
    const studentCount = new Set(
      allSessions.flatMap((s) => s.students.map((student) => student.id)),
    ).size;
    return {
      id: groupId,
      name: scope.groupName,
      period,
      studentCount,
      sessionCount: allSessions.length,
      status: reportStatus(
        required,
        reports.filter((r) => r.draftRevisionId).length,
        publishedCount,
      ),
      required,
      published: publishedCount,
      contributions,
    };
  }
  async event(
    m: EntityManager,
    reportId: string,
    actorId: string | null,
    action: string,
    revision: number,
    reason?: string,
  ) {
    await m.save(
      LearningReportEventEntity,
      m.create(LearningReportEventEntity, {
        reportId,
        actorId,
        action,
        details: { revision, ...(reason ? { reason } : {}) },
      }),
    );
  }
  async createDraft(
    m: EntityManager,
    tenantId: string,
    groupId: string,
    period: string,
    tutorId: string,
    actorId: string | null,
  ) {
    const existing = await m.findOneBy(LearningReportEntity, {
      tenantId,
      studyGroupId: groupId,
      period,
      tutorId,
    });
    if (existing) return { report: existing, created: false };
    const report = await m.save(
      LearningReportEntity,
      m.create(LearningReportEntity, {
        tenantId,
        studyGroupId: groupId,
        period,
        tutorId,
        draftRevisionId: null,
        publishedRevisionId: null,
        version: 1,
      }),
    );
    const rev = await m.save(
      LearningReportRevisionEntity,
      m.create(LearningReportRevisionEntity, {
        reportId: report.id,
        number: 1,
        content: emptyContent(),
        snapshot: null,
        publishedAt: null,
      }),
    );
    report.draftRevisionId = rev.id;
    await m.save(report);
    await this.event(
      m,
      report.id,
      actorId,
      actorId ? 'created' : 'generated',
      1,
    );
    return { report, created: true };
  }
  async create(user: AuthenticatedUser, dto: CreateReportDto) {
    return this.source.db.transaction(async (m) => {
      await this.source.lock(m, user.tenantId);
      await this.source.authorize(user, dto.studyGroupId, dto.period, m);
      if (
        user.role === 'tutor' &&
        (await this.source.myTutor(user, m)) !== dto.tutorId
      )
        throw new ForbiddenException();
      const assigned = await this.source
        .sessions(m, user.tenantId, dto.studyGroupId, dto.period)
        .andWhere('s.tutor_id=:tutorId', { tutorId: dto.tutorId })
        .getExists();
      if (!assigned)
        throw new BadRequestException(
          'Tentor tidak memiliki sesi pada periode ini.',
        );
      const { report } = await this.createDraft(
        m,
        user.tenantId,
        dto.studyGroupId,
        dto.period,
        dto.tutorId,
        user.id,
      );
      return { id: report.id, version: report.version };
    });
  }
  private async mutable(
    m: EntityManager,
    user: AuthenticatedUser,
    id: string,
    version: number,
  ) {
    await this.source.lock(m, user.tenantId);
    const report = await m.findOneBy(LearningReportEntity, {
      id,
      tenantId: user.tenantId,
    });
    if (!report) throw new NotFoundException('Laporan tidak ditemukan.');
    if (
      user.role === 'tutor' &&
      (await this.source.myTutor(user, m)) !== report.tutorId
    )
      throw new ForbiddenException();
    if (version !== report.version)
      throw new ConflictException(
        'Laporan telah berubah. Muat ulang sebelum menyimpan.',
      );
    return report;
  }
  private async draft(m: EntityManager, report: LearningReportEntity) {
    if (!report.draftRevisionId)
      throw new ConflictException(
        'Laporan telah terbit. Minta admin membuka revisi.',
      );
    return m.findOneByOrFail(LearningReportRevisionEntity, {
      id: report.draftRevisionId,
      reportId: report.id,
    });
  }
  private validateNotes(ids: string[], rosterIds: Set<string>) {
    if (ids.some((id) => !rosterIds.has(id)))
      throw new BadRequestException(
        'Catatan hanya boleh ditujukan kepada siswa dalam sesi tentor pada periode ini.',
      );
  }
  async save(user: AuthenticatedUser, id: string, dto: SaveReportDto) {
    return this.source.db.transaction(async (m) => {
      const report = await this.mutable(m, user, id, dto.version);
      const revision = await this.draft(m, report);
      const scope = await this.source.load(
        m,
        report.tenantId,
        report.studyGroupId,
        report.period,
      );
      const snapshot = scope.snapshots.get(report.tutorId);
      this.validateNotes(
        dto.notes.map((n) => n.studentId),
        new Set(
          snapshot?.sessions.flatMap((s) =>
            s.students.map((student) => student.id),
          ) ?? [],
        ),
      );
      revision.content = {
        material: dto.material.trim(),
        progress: dto.progress.trim(),
        followUp: dto.followUp.trim(),
        parentNote: dto.parentNote.trim(),
      };
      await m.save(revision);
      await m.delete(LearningReportStudentNoteEntity, {
        revisionId: revision.id,
      });
      if (dto.notes.length)
        await m.save(
          LearningReportStudentNoteEntity,
          dto.notes.map((n) =>
            m.create(LearningReportStudentNoteEntity, {
              revisionId: revision.id,
              studentId: n.studentId,
              note: n.note,
            }),
          ),
        );
      report.version++;
      await m.save(report);
      return { id, version: report.version };
    });
  }
  async publish(user: AuthenticatedUser, id: string, version: number) {
    return this.source.db.transaction(async (m) => {
      const report = await this.mutable(m, user, id, version);
      const revision = await this.draft(m, report);
      const scope = await this.source.load(
        m,
        report.tenantId,
        report.studyGroupId,
        report.period,
      );
      const snapshot = scope.snapshots.get(report.tutorId);
      if (!snapshot || !readyToPublish(revision.content, snapshot.sessions))
        throw new BadRequestException(
          'Lengkapi materi, perkembangan, tindak lanjut, dan presensi seluruh sesi sebelum menerbitkan.',
        );
      const notes = await m.findBy(LearningReportStudentNoteEntity, {
        revisionId: revision.id,
      });
      this.validateNotes(
        notes.map((n) => n.studentId),
        new Set(
          snapshot.sessions.flatMap((s) =>
            s.students.map((student) => student.id),
          ),
        ),
      );
      revision.snapshot = snapshot;
      revision.publishedAt = new Date();
      await m.save(revision);
      report.publishedRevisionId = revision.id;
      report.draftRevisionId = null;
      report.version++;
      await m.save(report);
      await this.event(m, id, user.id, 'published', revision.number);
      return { id, version: report.version };
    });
  }
  async revise(user: AuthenticatedUser, id: string, dto: ReviseReportDto) {
    if (user.role === 'tutor')
      throw new ForbiddenException(
        'Hanya owner/operator dapat membuka revisi.',
      );
    return this.source.db.transaction(async (m) => {
      const report = await this.mutable(m, user, id, dto.version);
      if (!report.publishedRevisionId || report.draftRevisionId)
        throw new ConflictException(
          'Revisi sudah dibuka atau laporan belum terbit.',
        );
      const previous = await m.findOneByOrFail(LearningReportRevisionEntity, {
        id: report.publishedRevisionId,
      });
      const revision = await m.save(
        LearningReportRevisionEntity,
        m.create(LearningReportRevisionEntity, {
          reportId: id,
          number: previous.number + 1,
          content: previous.content,
          snapshot: null,
          publishedAt: null,
        }),
      );
      const notes = await m.findBy(LearningReportStudentNoteEntity, {
        revisionId: previous.id,
      });
      if (notes.length)
        await m.save(
          LearningReportStudentNoteEntity,
          notes.map((n) =>
            m.create(LearningReportStudentNoteEntity, {
              revisionId: revision.id,
              studentId: n.studentId,
              note: n.note,
            }),
          ),
        );
      report.draftRevisionId = revision.id;
      report.version++;
      await m.save(report);
      await this.event(
        m,
        id,
        user.id,
        'revision_opened',
        revision.number,
        dto.reason,
      );
      return { id, version: report.version };
    });
  }
}
