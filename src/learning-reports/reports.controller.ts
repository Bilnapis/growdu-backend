import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import {
  CreateReportDto,
  ReportGroupQueryDto,
  ReportPdfQueryDto,
  ReportPeriodDto,
  ReportSettingsInputDto,
  ReportVersionDto,
  ReviseReportDto,
  SaveReportDto,
} from './dto/report-input.dto.js';
import {
  ReportGenerationDto,
  ReportGroupDetailDto,
  ReportGroupDto,
  ReportMutationDto,
  ReportSettingsDto,
  ReportSummaryDto,
} from './dto/report-response.dto.js';
import { ReportsService } from './reports.service.js';
import { ReportGenerationService } from './report-generation.service.js';
import { ReportPdfService } from './report-pdf.service.js';

@ApiTags('Learning reports')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@TenantScoped()
@RequireMenuAccess(OperatorMenu.Reports)
@Roles(UserRole.Owner, UserRole.Operator, UserRole.Tutor)
@Controller('learning-reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly generation: ReportGenerationService,
    private readonly pdf: ReportPdfService,
  ) {}
  @Get('groups')
  @ApiPaginatedResponse(ReportGroupDto)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportGroupQueryDto,
  ) {
    return this.reports.list(user, query);
  }
  @Get('summary')
  @ApiOkResponse({ type: ReportSummaryDto })
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportGroupQueryDto,
  ) {
    return this.reports.summary(user, query);
  }
  @Get('settings')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiOkResponse({ type: ReportSettingsDto })
  settings(@CurrentUser() user: AuthenticatedUser) {
    return this.generation.settings(user.tenantId);
  }
  @Patch('settings')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiOkResponse({ type: ReportSettingsDto })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReportSettingsInputDto,
  ) {
    return this.generation.update(user.tenantId, dto);
  }
  @Post('generations')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiCreatedResponse({ type: ReportGenerationDto })
  @ApiOperation({
    summary:
      'Create missing monthly drafts without overwriting existing reports.',
  })
  generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReportPeriodDto,
  ) {
    return this.generation.generate(user.tenantId, dto.period, user.id);
  }
  @Get('groups/:groupId/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ReportPdfQueryDto,
    @Res() res: Response,
  ) {
    const pdf = await this.pdf.generate(
      user,
      groupId,
      query.period,
      query.studentId,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="' + pdf.filename + '"',
    );
    res.type('application/pdf').send(pdf.buffer);
  }
  @Get('groups/:groupId')
  @ApiOkResponse({ type: ReportGroupDetailDto })
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('groupId', ParseUUIDPipe) groupId: string,
    @Query() query: ReportPeriodDto,
  ) {
    return this.reports.detail(user, groupId, query.period);
  }
  @Post()
  @ApiCreatedResponse({ type: ReportMutationDto })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReportDto) {
    return this.reports.create(user, dto);
  }
  @Patch(':id')
  @ApiOkResponse({ type: ReportMutationDto })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveReportDto,
  ) {
    return this.reports.save(user, id, dto);
  }
  @Post(':id/publications')
  @ApiCreatedResponse({ type: ReportMutationDto })
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportVersionDto,
  ) {
    return this.reports.publish(user, id, dto.version);
  }
  @Post(':id/revisions')
  @Roles(UserRole.Owner, UserRole.Operator)
  @ApiCreatedResponse({ type: ReportMutationDto })
  revise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviseReportDto,
  ) {
    return this.reports.revise(user, id, dto);
  }
}
