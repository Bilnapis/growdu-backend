import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { OperatorMenu } from '../menu-permissions.js';

export class UpdateOperatorMenuPermissionsDto {
  @ApiProperty({
    enum: OperatorMenu,
    isArray: true,
    description: 'Replaces all menu access. An empty array removes all access.',
    example: [OperatorMenu.Dashboard, OperatorMenu.Students],
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(Object.values(OperatorMenu).length)
  @IsEnum(OperatorMenu, { each: true })
  menuPermissions: OperatorMenu[];
}
