import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LearningReportEntity,
  LearningReportEventEntity,
  LearningReportGenerationEntity,
  LearningReportRevisionEntity,
  LearningReportSettingsEntity,
  LearningReportStudentNoteEntity,
} from './entities/learning-report.entity.js';
import { ReportSourceService } from './report-source.service.js';
import { ReportsService } from './reports.service.js';
import { ReportGenerationService } from './report-generation.service.js';
import { ReportAutomationService } from './report-automation.service.js';
import { ReportPdfService } from './report-pdf.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningReportEntity,
      LearningReportRevisionEntity,
      LearningReportStudentNoteEntity,
      LearningReportEventEntity,
      LearningReportSettingsEntity,
      LearningReportGenerationEntity,
    ]),
  ],
  controllers: [ReportsController],
  providers: [
    ReportSourceService,
    ReportsService,
    ReportGenerationService,
    ReportAutomationService,
    ReportPdfService,
  ],
})
export class ReportsModule {}
