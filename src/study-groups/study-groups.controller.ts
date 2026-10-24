import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { UserRole } from '../users/entities/user.entity.js';
import { CreateStudyGroupDto, StudyGroupsQueryDto, UpdateStudyGroupDto, UpdateStudyGroupStatusDto } from './dto/study-group-input.dto.js';
import { StudyGroupListItemResponseDto, StudyGroupResponseDto, StudyGroupsSummaryResponseDto } from './dto/study-group-response.dto.js';
import { StudyGroupsService } from './study-groups.service.js';

@ApiTags('Study groups') @ApiBearerAuth() @ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator) @TenantScoped() @Controller('study-groups')
export class StudyGroupsController {
  constructor(private readonly studyGroupsService: StudyGroupsService) {}
  @Get() @ApiPaginatedResponse(StudyGroupListItemResponseDto)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: StudyGroupsQueryDto): Promise<PaginatedResponse<StudyGroupListItemResponseDto>> { return this.studyGroupsService.findAll(user.tenantId, query); }
  @Get('summary') @ApiOkResponse({ type: StudyGroupsSummaryResponseDto })
  getSummary(@CurrentUser() user: AuthenticatedUser): Promise<StudyGroupsSummaryResponseDto> { return this.studyGroupsService.getSummary(user.tenantId); }
  @Get(':id') @ApiOkResponse({ type: StudyGroupResponseDto })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string): Promise<StudyGroupResponseDto> { return this.studyGroupsService.findOne(user.tenantId, id); }
  @Post() @ApiCreatedResponse({ type: StudyGroupResponseDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateStudyGroupDto): Promise<StudyGroupResponseDto> { return this.studyGroupsService.create(user.tenantId, dto); }
  @Patch(':id') @ApiOkResponse({ type: StudyGroupResponseDto })
  update(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudyGroupDto): Promise<StudyGroupResponseDto> { return this.studyGroupsService.update(user.tenantId, id, dto); }
  @Patch(':id/status') @ApiOkResponse({ type: StudyGroupResponseDto })
  updateStatus(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStudyGroupStatusDto): Promise<StudyGroupResponseDto> { return this.studyGroupsService.updateStatus(user.tenantId, id, dto.status); }
}
