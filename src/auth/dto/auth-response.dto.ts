import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { UserRole } from '../../users/entities/user.entity.js';

export class AuthUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  tenantId: string | null;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiPropertyOptional({ nullable: true })
  tenantName: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  profileId: string | null;

  @ApiPropertyOptional({ nullable: true })
  profileName: string | null;
}

export class TokenResponseDto {
  @ApiProperty()
  accessToken: string;

  @ApiProperty({ example: 'Bearer' })
  tokenType: 'Bearer';

  @ApiProperty({ example: 900 })
  expiresIn: number;

  @ApiProperty({ type: AuthUserResponseDto })
  user: AuthUserResponseDto;
}
