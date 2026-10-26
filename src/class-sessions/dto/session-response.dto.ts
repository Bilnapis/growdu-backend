import { ApiProperty } from '@nestjs/swagger';

export class SessionStudentResponseDto {
  @ApiProperty({ type: String }) studentId: string;
  @ApiProperty({ type: String }) name: string;
  @ApiProperty({ type: String }) school: string;
  @ApiProperty({ type: String }) educationLevel: string;
  @ApiProperty({ type: String, nullable: true }) status:
    'present' | 'excused' | 'sick' | 'absent' | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
}
export class SessionListItemResponseDto {
  @ApiProperty({ type: String }) id: string;
  @ApiProperty({ type: String }) tenantId: string;
  @ApiProperty({ type: String }) studyGroupId: string;
  @ApiProperty({ type: String }) configurationId: string;
  @ApiProperty({ type: String }) scheduleRuleId: string;
  @ApiProperty({ type: String }) seriesId: string;
  @ApiProperty({ type: String }) occurrenceDate: string;
  @ApiProperty({ type: String }) sessionDate: string;
  @ApiProperty({ type: String }) startTime: string;
  @ApiProperty({ type: String }) endTime: string;
  @ApiProperty({ type: String }) tutorId: string;
  @ApiProperty({ type: String }) tutorName: string;
  @ApiProperty({ type: String, nullable: true }) roomId: string | null;
  @ApiProperty({ type: String, nullable: true }) roomName: string | null;
  @ApiProperty({ type: String, nullable: true }) roomCode: string | null;
  @ApiProperty({ type: String }) studyGroupName: string;
  @ApiProperty({ type: String, nullable: true }) subject: string | null;
  @ApiProperty({ type: String }) status:
    'scheduled' | 'completed' | 'cancelled';
  @ApiProperty({ type: String }) attendanceStatus: 'pending' | 'saved';
  @ApiProperty({ type: Number }) studentCount: number;
  @ApiProperty({ type: String, nullable: true }) topic: string | null;
  @ApiProperty({ type: String, nullable: true }) tutorNote: string | null;
  @ApiProperty({ type: Date, nullable: true }) completedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) completedBy: string | null;
  @ApiProperty({ type: Date, nullable: true }) lockedAt: Date | null;
  @ApiProperty({ type: String, nullable: true }) lockReason: string | null;
  @ApiProperty({ type: Number }) version: number;
}
export class SessionResponseDto extends SessionListItemResponseDto {
  @ApiProperty({ type: [SessionStudentResponseDto] })
  students: SessionStudentResponseDto[];
}
export class SessionPageMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
  @ApiProperty() totalPages: number;
}
export class SessionPageResponseDto {
  @ApiProperty({ type: [SessionListItemResponseDto] })
  data: SessionListItemResponseDto[];
  @ApiProperty({ type: SessionPageMetaDto }) meta: SessionPageMetaDto;
}
export class ConfigurationMutationResponseDto {
  @ApiProperty() configurationId: string;
  @ApiProperty({ description: 'Number of newly generated session rows' })
  created: number;
  @ApiProperty({ description: 'Number of unrecorded session rows replaced' })
  updated: number;
  @ApiProperty({
    description: 'Number of preserved final, locked, or overridden sessions',
  })
  skipped: number;
}
