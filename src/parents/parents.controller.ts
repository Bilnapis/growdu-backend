import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { CreateProfileAccountDto } from '../users/dto/user-input.dto.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ProfileAccountsService } from '../users/profile-accounts.service.js';
import {
  CreateParentDto,
  ParentsQueryDto,
  UpdateParentDto,
} from './dto/parent-input.dto.js';
import {
  ParentResponseDto,
  ParentStudentResponseDto,
} from './dto/parent-response.dto.js';
import { ParentsService } from './parents.service.js';

@ApiTags('Parents')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Admin)
@Controller('parents')
export class ParentsController {
  constructor(
    private readonly parentsService: ParentsService,
    private readonly profileAccountsService: ProfileAccountsService,
  ) {}

  @Get('me')
  @Roles(UserRole.Parent)
  @ApiOkResponse({ type: ParentResponseDto })
  findMe(@CurrentUser() user: AuthenticatedUser): Promise<ParentResponseDto> {
    return this.parentsService.findMe(user.tenantId, user.id);
  }

  @Get('me/students')
  @Roles(UserRole.Parent)
  @ApiOkResponse({ type: [ParentStudentResponseDto] })
  findMyStudents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ParentStudentResponseDto[]> {
    return this.parentsService.findMyStudents(user.tenantId, user.id);
  }

  @Get('me/students/:studentId')
  @Roles(UserRole.Parent)
  @ApiOkResponse({ type: ParentStudentResponseDto })
  findMyStudent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ): Promise<ParentStudentResponseDto> {
    return this.parentsService.findMyStudent(user.tenantId, user.id, studentId);
  }

  @Get()
  @ApiPaginatedResponse(ParentResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ParentsQueryDto,
  ): Promise<PaginatedResponse<ParentResponseDto>> {
    return this.parentsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: ParentResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ParentResponseDto> {
    return this.parentsService.findOne(user.tenantId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: ParentResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateParentDto,
  ): Promise<ParentResponseDto> {
    return this.parentsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ParentResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateParentDto,
  ): Promise<ParentResponseDto> {
    return this.parentsService.update(user.tenantId, id, dto);
  }

  @Post(':id/account')
  @Roles(UserRole.Owner)
  @ApiCreatedResponse({ type: UserResponseDto })
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProfileAccountDto,
  ): Promise<UserResponseDto> {
    return this.profileAccountsService.createParentAccount(
      user.tenantId,
      id,
      dto,
    );
  }
}
