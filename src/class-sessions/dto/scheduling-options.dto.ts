import { ApiProperty } from '@nestjs/swagger';

export class TutorOptionDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class RoomOptionDto extends TutorOptionDto {
  @ApiProperty()
  code: string;

  @ApiProperty()
  capacity: number;
}

export class SchedulingOptionsDto {
  @ApiProperty({ type: [TutorOptionDto] })
  tutors: TutorOptionDto[];

  @ApiProperty({ type: [RoomOptionDto] })
  rooms: RoomOptionDto[];
}
