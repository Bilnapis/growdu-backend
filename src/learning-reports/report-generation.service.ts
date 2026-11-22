import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { jakartaDate } from '../common/jakarta-date.js';
import { ClassSessionEntity } from '../class-sessions/entities/class-session.entity.js';
import {
  LearningReportEntity,
  LearningReportGenerationEntity,
  LearningReportSettingsEntity,
} from './entities/learning-report.entity.js';
import { ReportsService } from './reports.service.js';
import {
  generationDate,
  initialGenerationDate,
  shiftMonth,
} from './report-rules.js';
import type { ReportSettingsInputDto } from './dto/report-input.dto.js';

@Injectable()
export class ReportGenerationService {
  constructor(private readonly reports: ReportsService) {}
  private async ensure(m: EntityManager, tenantId: string, now: Date) {
    const setting = await m.findOneBy(LearningReportSettingsEntity, {
      tenantId,
    });
    return (
      setting ??
      m.save(
        LearningReportSettingsEntity,
        m.create(LearningReportSettingsEntity, {
          tenantId,
          enabled: true,
          generationDay: 1,
          nextRunDate: initialGenerationDate(jakartaDate(now), 1),
          lastRunAt: null,
          version: 1,
        }),
      )
    );
  }
  async settings(tenantId: string, now = new Date()) {
    return this.reports.source.db.transaction(async (m) => {
      await this.reports.source.lock(m, tenantId);
      const setting = await this.ensure(m, tenantId, now);
      const lastResult = await m.findOne(LearningReportGenerationEntity, {
        where: { tenantId },
        order: { processedAt: 'DESC', period: 'DESC' },
      });
      return {
        enabled: setting.enabled,
        generationDay: setting.generationDay,
        version: setting.version,
        nextRunDate: setting.enabled ? setting.nextRunDate : null,
        lastRunAt: setting.lastRunAt,
        lastResult: lastResult
          ? {
              period: lastResult.period,
              created: lastResult.created,
              skipped: lastResult.skipped,
              processedAt: lastResult.processedAt,
            }
          : null,
      };
    });
  }
  async update(
    tenantId: string,
    dto: ReportSettingsInputDto,
    now = new Date(),
  ) {
    await this.reports.source.db.transaction(async (m) => {
      await this.reports.source.lock(m, tenantId);
      const setting = await this.ensure(m, tenantId, now);
      if (setting.version !== dto.version)
        throw new ConflictException(
          'Pengaturan telah berubah. Muat ulang data.',
        );
      if (
        setting.generationDay !== dto.generationDay ||
        (!setting.enabled && dto.enabled)
      ) {
        const month = jakartaDate(now).slice(0, 7);
        const processed = await m.findOneBy(LearningReportGenerationEntity, {
          tenantId,
          period: shiftMonth(month, -1),
        });
        const pendingMonth =
          setting.enabled &&
          dto.enabled &&
          setting.nextRunDate.slice(0, 7) < month
            ? setting.nextRunDate.slice(0, 7)
            : month;
        setting.nextRunDate = generationDate(
          pendingMonth === month && processed?.automaticAt
            ? shiftMonth(month, 1)
            : pendingMonth,
          dto.generationDay,
        );
      }
      setting.enabled = dto.enabled;
      setting.generationDay = dto.generationDay;
      setting.version++;
      await m.save(setting);
    });
    return this.settings(tenantId, now);
  }
  private async generateWithin(
    m: EntityManager,
    tenantId: string,
    period: string,
    actorId: string | null,
    now: Date,
    automatic: boolean,
  ) {
    const pairs = await m
      .createQueryBuilder(ClassSessionEntity, 's')
      .select('s.studyGroupId', 'groupId')
      .addSelect('s.tutorId', 'tutorId')
      .distinct(true)
      .where(
        "s.tenant_id=:tenantId AND s.session_date>=:start AND s.session_date<:end AND s.status<>'cancelled'",
        { tenantId, start: period + '-01', end: shiftMonth(period, 1) + '-01' },
      )
      .getRawMany<{ groupId: string; tutorId: string }>();
    const existing = await m.find(LearningReportEntity, {
      where: { tenantId, period },
      select: { studyGroupId: true, tutorId: true },
    });
    const keys = new Set(existing.map((r) => r.studyGroupId + ':' + r.tutorId));
    let created = 0;
    for (const pair of pairs) {
      if (keys.has(pair.groupId + ':' + pair.tutorId)) continue;
      await this.reports.createDraft(
        m,
        tenantId,
        pair.groupId,
        period,
        pair.tutorId,
        actorId,
      );
      created++;
    }
    const previous = await m.findOneBy(LearningReportGenerationEntity, {
      tenantId,
      period,
    });
    await m.save(
      LearningReportGenerationEntity,
      m.create(LearningReportGenerationEntity, {
        tenantId,
        period,
        created,
        skipped: pairs.length - created,
        processedAt: now,
        automaticAt: automatic ? now : (previous?.automaticAt ?? null),
      }),
    );
    return { period, created, skipped: pairs.length - created };
  }
  async generate(
    tenantId: string,
    period: string,
    actorId: string,
    now = new Date(),
  ) {
    return this.reports.source.db.transaction(async (m) => {
      await this.reports.source.lock(m, tenantId);
      return this.generateWithin(m, tenantId, period, actorId, now, false);
    });
  }
  async processDue(tenantId: string, now = new Date()) {
    return this.reports.source.db.transaction(async (m) => {
      await this.reports.source.lock(m, tenantId);
      const setting = await this.ensure(m, tenantId, now);
      const results: { period: string; created: number; skipped: number }[] =
        [];
      for (
        let i = 0;
        i < 24 && setting.enabled && setting.nextRunDate <= jakartaDate(now);
        i++
      ) {
        const month = setting.nextRunDate.slice(0, 7);
        results.push(
          await this.generateWithin(
            m,
            tenantId,
            shiftMonth(month, -1),
            null,
            now,
            true,
          ),
        );
        setting.nextRunDate = generationDate(
          shiftMonth(month, 1),
          setting.generationDay,
        );
        setting.lastRunAt = now;
      }
      if (results.length) await m.save(setting);
      return results;
    });
  }
}
