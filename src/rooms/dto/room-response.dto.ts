import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';

export class RoomListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  capacity: number;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty()
  activeGroupCount: number;

  @ApiProperty()
  activeStudentCount: number;

  @ApiProperty()
  todaySessionCount: number;

  @ApiPropertyOptional({ nullable: true, example: '15:00' })
  todayStartTime: string | null;

  @ApiPropertyOptional({ nullable: true, example: '19:30' })
  todayEndTime: string | null;
}

export class RoomsSummaryResponseDto {
  @ApiProperty()
  activeRooms: number;

  @ApiProperty()
  sessionsToday: number;

  @ApiProperty()
  totalCapacity: number;

  @ApiProperty()
  inactiveRooms: number;
}

export class RoomScheduleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tutorId: string;

  @ApiProperty()
  tutorName: string;

  @ApiProperty()
  dayOfWeek: number;

  @ApiProperty({ example: '15:00' })
  startTime: string;

  @ApiProperty({ example: '16:30' })
  endTime: string;
}

export class RoomStudyGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  studentCount: number;

  @ApiProperty({ type: [RoomScheduleResponseDto] })
  schedules: RoomScheduleResponseDto[];
}

export class RoomDetailResponseDto extends RoomListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty({ type: [RoomStudyGroupResponseDto] })
  studyGroups: RoomStudyGroupResponseDto[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;
}
