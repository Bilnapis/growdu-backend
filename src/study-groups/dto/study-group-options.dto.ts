import { ApiProperty } from '@nestjs/swagger';
import { SchedulingOptionsDto, TutorOptionDto } from '../../class-sessions/dto/scheduling-options.dto.js';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';

export class StudyGroupStudentOptionDto extends TutorOptionDto {
  @ApiProperty()
  school: string;

  @ApiProperty()
  educationLevel: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;
}

export class StudyGroupStudentPickerDto extends StudyGroupStudentOptionDto {
  @ApiProperty()
  address: string;
}

export class StudyGroupFormOptionsDto extends SchedulingOptionsDto {
  @ApiProperty({ type: [StudyGroupStudentPickerDto] })
  students: StudyGroupStudentPickerDto[];
}
