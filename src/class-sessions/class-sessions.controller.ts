import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import {
  SessionResponseDto,
  SessionPageResponseDto,
  ConfigurationMutationResponseDto,
} from './dto/session-response.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { SchedulingOptionsDto } from './dto/scheduling-options.dto.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ClassSessionsService } from './class-sessions.service.js';
import { ConfigurationsService } from './configurations.service.js';
import {
  ConfigurationInputDto,
  SessionOverrideDto,
  SessionQueryDto,
  SessionRecordDto,
} from './dto/session-input.dto.js';

@ApiTags('Class sessions')
@ApiBearerAuth()
@TenantScoped()
@Roles(UserRole.Owner, UserRole.Operator, UserRole.Tutor)
@Controller('class-sessions')
@RequireMenuAccess(OperatorMenu.Schedule)
@ApiForbiddenResponse({
  description: 'Role or session assignment does not permit access',
})
@ApiNotFoundResponse({
  description: 'Session not found in the selected tenant',
})
@ApiBadRequestResponse({
  description: 'Invalid input or incomplete attendance',
})
export class ClassSessionsController {
  constructor(private readonly service: ClassSessionsService) {}
  @Get('form-options')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiOperation({ summary: 'Get active tutor and room choices for rescheduling' })
  @ApiOkResponse({ type: SchedulingOptionsDto })
  formOptions(@CurrentUser() user: AuthenticatedUser): Promise<SchedulingOptionsDto> {
    return this.service.getSchedulingOptions(user.tenantId);
  }
  @Get()
  @ApiOperation({ summary: 'List dated sessions assigned to the current user' })
  @ApiOkResponse({ type: SessionPageResponseDto })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SessionQueryDto,
  ) {
    return this.service.list(user, query);
  }
  @Get(':id')
  @ApiOkResponse({ type: SessionResponseDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.detail(user, id);
  }
  @Patch(':id')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiConflictResponse({
    description: 'Version mismatch, locked session, or schedule conflict',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  override(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionOverrideDto,
  ) {
    return this.service.override(user, id, dto);
  }
  @Put(':id/record')
  @ApiConflictResponse({ description: 'Version mismatch or locked session' })
  @ApiOkResponse({
    type: SessionResponseDto,
    description: 'Attendance and notes saved atomically',
  })
  record(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SessionRecordDto,
  ) {
    return this.service.record(user, id, dto);
  }
}
@ApiTags('Study group configurations')
@ApiBearerAuth()
@TenantScoped()
@Roles(UserRole.Owner, UserRole.Operator)
@Controller('study-groups/:id/configurations')
@RequireMenuAccess(OperatorMenu.StudyGroups)
export class ConfigurationsController {
  constructor(private readonly service: ConfigurationsService) {}
  @Get() history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.history(user, id);
  }
  @Post('preview') preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigurationInputDto,
  ) {
    return this.service.preview(user, id, dto);
  }
  @Post()
  @ApiCreatedResponse({ type: ConfigurationMutationResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfigurationInputDto,
  ) {
    return this.service.create(user, id, dto);
  }
}
