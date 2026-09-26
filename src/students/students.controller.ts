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
import {
  CreateStudentDto,
  StudentsQueryDto,
  UpdateStudentDto,
} from './dto/student-input.dto.js';
import {
  AddStudentParentDto,
  UpdateStudentParentDto,
} from './dto/student-parent-input.dto.js';
import {
  StudentParentResponseDto,
  StudentResponseDto,
} from './dto/student-response.dto.js';
import { StudentsService } from './students.service.js';

@ApiTags('Students')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Admin)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get()
  @ApiPaginatedResponse(StudentResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StudentsQueryDto,
  ): Promise<PaginatedResponse<StudentResponseDto>> {
    return this.studentsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StudentResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentResponseDto> {
    return this.studentsService.findOne(user.tenantId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: StudentResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.studentsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StudentResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentResponseDto> {
    return this.studentsService.update(user.tenantId, id, dto);
  }

  @Get(':id/parents')
  @ApiOkResponse({ type: [StudentParentResponseDto] })
  findParents(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentParentResponseDto[]> {
    return this.studentsService.findParents(user.tenantId, id);
  }

  @Post(':id/parents')
  @ApiCreatedResponse({ type: StudentParentResponseDto })
  addParent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddStudentParentDto,
  ): Promise<StudentParentResponseDto> {
    return this.studentsService.addParent(user.tenantId, id, dto);
  }

  @Patch(':studentId/parents/:parentId')
  @ApiOkResponse({ type: StudentParentResponseDto })
  updateParent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Body() dto: UpdateStudentParentDto,
  ): Promise<StudentParentResponseDto> {
    return this.studentsService.updateParent(
      user.tenantId,
      studentId,
      parentId,
      dto,
    );
  }

  @Delete(':studentId/parents/:parentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Relasi parent dilepas dari student.' })
  async removeParent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('parentId', ParseUUIDPipe) parentId: string,
  ): Promise<void> {
    await this.studentsService.removeParent(user.tenantId, studentId, parentId);
  }
}
