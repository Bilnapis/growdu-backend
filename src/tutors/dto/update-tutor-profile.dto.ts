import { Transform } from 'class-transformer';
import { IsString, MaxLength } from 'class-validator';
import { ApiProperty, PickType } from '@nestjs/swagger';
import { CreateTutorDto } from './tutor-input.dto.js';

export class UpdateTutorProfileDto extends PickType(CreateTutorDto, [
  'name',
  'email',
  'address',
  'expertise',
  'education',
] as const) {
  @ApiProperty({ maxLength: 20, description: 'May be empty when not provided' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(20)
  phoneNumber: string;
}
