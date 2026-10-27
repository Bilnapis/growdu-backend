import { ApiProperty } from '@nestjs/swagger';
import { StudentGender } from '../entities/student.entity.js';

export class TutorStudentGroupResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;
}

export class TutorStudentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  school: string;

  @ApiProperty()
  educationLevel: string;

  @ApiProperty({ type: [TutorStudentGroupResponseDto] })
  studyGroups: TutorStudentGroupResponseDto[];
}

export class TutorStudentDetailResponseDto extends TutorStudentResponseDto {
  @ApiProperty({ enum: StudentGender })
  gender: StudentGender;
}
