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
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import {
  PaginatedResponse,
  PaginationQueryDto,
} from '../common/dto/pagination-query.dto.js';
import {
  TutorStudentDetailResponseDto,
  TutorStudentResponseDto,
} from './dto/tutor-student-response.dto.js';
import { TutorStudentsService } from './tutor-students.service.js';
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
  StudentListItemResponseDto,
  StudentParentResponseDto,
  StudentResponseDto,
  StudentsSummaryResponseDto,
} from './dto/student-response.dto.js';
import {
  CreateStudentRegistrationDto,
  UpdateStudentRegistrationDto,
} from './dto/student-registration-input.dto.js';
import { StudentRegistrationResponseDto } from './dto/student-registration-response.dto.js';
import { StudentRegistrationService } from './student-registration.service.js';
import { StudentsService } from './students.service.js';

@ApiTags('Students')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator)
@TenantScoped()
@Controller('students')
@RequireMenuAccess(OperatorMenu.Students)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly studentRegistrationService: StudentRegistrationService,
    private readonly tutorStudentsService: TutorStudentsService,
  ) {}

  @Get('mine')
  @Roles(UserRole.Tutor)
  @ApiPaginatedResponse(TutorStudentResponseDto)
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<PaginatedResponse<TutorStudentResponseDto>> {
    return this.tutorStudentsService.findAll(user.tenantId, user.id, query);
  }

  @Get('mine/:id')
  @Roles(UserRole.Tutor)
  @ApiOkResponse({ type: TutorStudentDetailResponseDto })
  findMyStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TutorStudentDetailResponseDto> {
    return this.tutorStudentsService.findOne(user.tenantId, user.id, id);
  }

  @Get()
  @ApiPaginatedResponse(StudentListItemResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: StudentsQueryDto,
  ): Promise<PaginatedResponse<StudentListItemResponseDto>> {
    return this.studentsService.findAll(user.tenantId, query);
  }

  @Get('summary')
  @ApiOkResponse({ type: StudentsSummaryResponseDto })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentsSummaryResponseDto> {
    return this.studentsService.getSummary(user.tenantId);
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

  @Post('registrations')
  @Roles(UserRole.Owner)
  @ApiCreatedResponse({ type: StudentRegistrationResponseDto })
  createRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateStudentRegistrationDto,
  ): Promise<StudentRegistrationResponseDto> {
    return this.studentRegistrationService.create(user.tenantId, dto);
  }

  @Patch(':id/registration')
  @Roles(UserRole.Owner)
  @ApiOkResponse({ type: StudentRegistrationResponseDto })
  updateRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentRegistrationDto,
  ): Promise<StudentRegistrationResponseDto> {
    return this.studentRegistrationService.update(user.tenantId, id, dto);
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
