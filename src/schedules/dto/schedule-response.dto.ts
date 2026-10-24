import { ApiProperty } from '@nestjs/swagger';

export class ScheduleListItemResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) studyGroupId: string;
  @ApiProperty() studyGroupName: string;
  @ApiProperty({ nullable: true }) subject: string | null;
  @ApiProperty({ format: 'uuid' }) tutorId: string;
  @ApiProperty() tutorName: string;
  @ApiProperty({ format: 'uuid', nullable: true }) roomId: string | null;
  @ApiProperty({ nullable: true }) roomName: string | null;
  @ApiProperty({ nullable: true }) roomCode: string | null;
  @ApiProperty({ minimum: 1, maximum: 7 }) dayOfWeek: number;
  @ApiProperty({ example: '15:00' }) startTime: string;
  @ApiProperty({ example: '16:00' }) endTime: string;
  @ApiProperty() studentCount: number;
  @ApiProperty({
    enum: ['unavailable'],
    description:
      'Attendance remains unavailable until the attendance domain is implemented.',
  })
  attendanceStatus: 'unavailable';
}

export class SchedulesSummaryResponseDto {
  @ApiProperty() totalSchedules: number;
  @ApiProperty() schedulesWithAttendance: number;
  @ApiProperty() schedulesPendingAttendance: number;
  @ApiProperty() schedulesToday: number;
}
