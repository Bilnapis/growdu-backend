import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateTutorBankAccountDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Bank BCA' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  bankName: string;

  @ApiProperty({ minLength: 3, maxLength: 50 })
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  accountNumber: string;

  @ApiProperty({ minLength: 2, maxLength: 150 })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  accountName: string;
}
