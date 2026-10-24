import { ApiProperty } from '@nestjs/swagger';
import { StudentResponseDto } from './student-response.dto.js';

export class StudentRegistrationResponseDto {
  @ApiProperty({ type: StudentResponseDto })
  student: StudentResponseDto;

  @ApiProperty({ format: 'uuid' })
  parentId: string;
}
