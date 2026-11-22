import { ApiProperty } from '@nestjs/swagger';
import type {
  ReportContent,
  ReportSnapshot,
  ReportSession,
  ReportStudent,
  ReportStatus,
} from '../report-types.js';

export class ReportContentDto implements ReportContent {
  @ApiProperty() material: string;
  @ApiProperty() progress: string;
  @ApiProperty() followUp: string;
  @ApiProperty() parentNote: string;
}
export class ReportStudentDto implements ReportStudent {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() school: string;
  @ApiProperty() educationLevel: string;
  @ApiProperty({
    type: String,
    nullable: true,
    enum: ['present', 'excused', 'sick', 'absent'],
  })
  status: ReportStudent['status'];
}
export class ReportSessionDto implements ReportSession {
  @ApiProperty() id: string;
  @ApiProperty() version: number;
  @ApiProperty() date: string;
  @ApiProperty({ enum: ['scheduled', 'completed'] })
  status: ReportSession['status'];
  @ApiProperty({ type: [ReportStudentDto] }) students: ReportStudentDto[];
}
export class ReportSnapshotDto implements ReportSnapshot {
  @ApiProperty() tenantName: string;
  @ApiProperty() groupName: string;
  @ApiProperty() tutorName: string;
  @ApiProperty() subject: string;
  @ApiProperty({ type: [ReportSessionDto] }) sessions: ReportSessionDto[];
}
export class ReportNoteDto {
  @ApiProperty() studentId: string;
  @ApiProperty() note: string;
}
export class ReportRevisionDto {
  @ApiProperty() id: string;
  @ApiProperty() number: number;
  @ApiProperty({ type: ReportContentDto }) content: ReportContentDto;
  @ApiProperty({ type: ReportSnapshotDto, nullable: true })
  snapshot: ReportSnapshotDto | null;
  @ApiProperty({ type: Date, nullable: true }) publishedAt: Date | null;
  @ApiProperty({ type: [ReportNoteDto] }) notes: ReportNoteDto[];
}
export class ReportAttendanceDto {
  @ApiProperty() present: number;
  @ApiProperty() excused: number;
  @ApiProperty() sick: number;
  @ApiProperty() absent: number;
  @ApiProperty() pending: number;
  @ApiProperty() sessions: number;
  @ApiProperty() recorded: number;
  @ApiProperty({ type: Number, nullable: true }) percentage: number | null;
}
export class ReportHistoryDto {
  @ApiProperty() number: number;
  @ApiProperty({ type: Date, nullable: true }) publishedAt: Date | null;
}
export class ReportEventDto {
  @ApiProperty() action: string;
  @ApiProperty({ type: String, nullable: true }) reason: string | null;
  @ApiProperty() revision: number;
  @ApiProperty() createdAt: Date;
}
export class ReportContributionDto {
  @ApiProperty() required: boolean;
  @ApiProperty({ type: String, nullable: true }) id: string | null;
  @ApiProperty() tutorId: string;
  @ApiProperty() tutorName: string;
  @ApiProperty() version: number;
  @ApiProperty() canEdit: boolean;
  @ApiProperty() revising: boolean;
  @ApiProperty() sourceChanged: boolean;
  @ApiProperty({ type: ReportSnapshotDto, nullable: true })
  live: ReportSnapshotDto | null;
  @ApiProperty({ type: ReportAttendanceDto }) attendance: ReportAttendanceDto;
  @ApiProperty({ type: ReportRevisionDto, nullable: true })
  draft: ReportRevisionDto | null;
  @ApiProperty({ type: ReportRevisionDto, nullable: true })
  published: ReportRevisionDto | null;
  @ApiProperty({ type: [ReportHistoryDto] }) history: ReportHistoryDto[];
  @ApiProperty({ type: [ReportEventDto] }) events: ReportEventDto[];
}
export class ReportGroupDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() period: string;
  @ApiProperty({
    enum: ['unfilled', 'draft', 'partially_published', 'published'],
  })
  status: ReportStatus;
  @ApiProperty() required: number;
  @ApiProperty() published: number;
  @ApiProperty() tutorNames: string;
  @ApiProperty() studentCount: number;
  @ApiProperty() sessionCount: number;
}
export class ReportGroupDetailDto {
  @ApiProperty() studentCount: number;
  @ApiProperty() sessionCount: number;
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() period: string;
  @ApiProperty({
    enum: ['unfilled', 'draft', 'partially_published', 'published'],
  })
  status: ReportStatus;
  @ApiProperty() required: number;
  @ApiProperty() published: number;
  @ApiProperty({ type: [ReportContributionDto] })
  contributions: ReportContributionDto[];
}
export class ReportSummaryDto {
  @ApiProperty() total: number;
  @ApiProperty() published: number;
  @ApiProperty() pending: number;
}
export class ReportMutationDto {
  @ApiProperty() id: string;
  @ApiProperty() version: number;
}
export class ReportGenerationDto {
  @ApiProperty() period: string;
  @ApiProperty() created: number;
  @ApiProperty() skipped: number;
}
export class ReportGenerationResultDto extends ReportGenerationDto {
  @ApiProperty() processedAt: Date;
}
export class ReportSettingsDto {
  @ApiProperty() enabled: boolean;
  @ApiProperty() generationDay: number;
  @ApiProperty() version: number;
  @ApiProperty({ type: String, nullable: true }) nextRunDate: string | null;
  @ApiProperty({ type: Date, nullable: true }) lastRunAt: Date | null;
  @ApiProperty({ type: ReportGenerationResultDto, nullable: true })
  lastResult: ReportGenerationResultDto | null;
}
