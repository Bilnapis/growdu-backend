import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
export class StudyGroupScheduleResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() tutorId: string;
  @ApiProperty() tutorName: string;
  @ApiProperty({ nullable: true }) tutorExpertise: string | null;
  @ApiProperty({ nullable: true }) roomId: string | null;
  @ApiProperty({ nullable: true }) roomName: string | null;
  @ApiProperty({ nullable: true }) roomCode: string | null;
  @ApiProperty() dayOfWeek: number;
  @ApiProperty() startTime: string;
  @ApiProperty() endTime: string;
}
export class StudyGroupListItemResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: [String] }) subjects: string[];
  @ApiProperty({ type: [StudyGroupScheduleResponseDto] })
  schedules: StudyGroupScheduleResponseDto[];
  @ApiProperty() studentCount: number;
  @ApiProperty({ enum: EntityStatus }) status: EntityStatus;
}
export class StudyGroupResponseDto extends StudyGroupListItemResponseDto {
  @ApiProperty() tenantId: string;
  @ApiProperty({ type: [String] }) studentIds: string[];
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}
export class StudyGroupsSummaryResponseDto {
  @ApiProperty() total: number;
  @ApiProperty() active: number;
  @ApiProperty() inactive: number;
  @ApiProperty() schedulesToday: number;
}
