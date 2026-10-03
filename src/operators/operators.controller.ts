import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { OperatorsService } from './operators.service.js';
import {
  OperatorsQueryDto,
  CreateOperatorDto,
  UpdateOperatorDto,
} from './dto/operator-input.dto.js';
import { OperatorResponseDto } from './dto/operator-response.dto.js';

@ApiTags('Operators')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner)
@Controller('tenants/:tenantId/operators')
export class OperatorsController {
  constructor(private readonly operatorsService: OperatorsService) {}

  @Get()
  @ApiPaginatedResponse(OperatorResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: OperatorsQueryDto,
  ): Promise<PaginatedResponse<OperatorResponseDto>> {
    return this.operatorsService.findAll(user.id, tenantId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: OperatorResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OperatorResponseDto> {
    return this.operatorsService.findOne(user.id, tenantId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: OperatorResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: CreateOperatorDto,
  ): Promise<OperatorResponseDto> {
    return this.operatorsService.create(user.id, tenantId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: OperatorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOperatorDto,
  ): Promise<OperatorResponseDto> {
    return this.operatorsService.update(user.id, tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Operator dan akun loginnya dihapus.' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.operatorsService.remove(user.id, tenantId, id);
  }
}
