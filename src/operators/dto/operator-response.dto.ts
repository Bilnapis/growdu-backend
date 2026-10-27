import { ApiProperty } from '@nestjs/swagger';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { OperatorEntity } from '../entities/operator.entity.js';
import { getOperatorMenuPermissions, OperatorMenu } from '../menu-permissions.js';

export class OperatorResponseDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  tenantId: string;

  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  phoneNumber: string;

  @ApiProperty({ nullable: true, maxLength: 1000 })
  address: string | null;

  @ApiProperty({ format: 'email' })
  email: string;

  @ApiProperty({ enum: EntityStatus })
  status: EntityStatus;

  @ApiProperty({ enum: OperatorMenu, isArray: true })
  menuPermissions: OperatorMenu[];

  @ApiProperty({ format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date;

  static fromEntity(entity: OperatorEntity): OperatorResponseDto {
    return {
      id: entity.id,
      tenantId: entity.tenantId,
      userId: entity.userId,
      name: entity.name,
      address: entity.address ?? null,
      phoneNumber: entity.phoneNumber,
      email: entity.user.email,
      status: entity.status,
      menuPermissions: getOperatorMenuPermissions(entity.menuPermissions),
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
