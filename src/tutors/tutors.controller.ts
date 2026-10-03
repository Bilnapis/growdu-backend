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
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { PaginatedResponse } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { CreateProfileAccountDto } from '../users/dto/user-input.dto.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ProfileAccountsService } from '../users/profile-accounts.service.js';
import {
  CreateTutorDto,
  TutorsQueryDto,
  UpdateTutorDto,
} from './dto/tutor-input.dto.js';
import { TutorResponseDto } from './dto/tutor-response.dto.js';
import { TutorsService } from './tutors.service.js';

@ApiTags('Tutors')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator)
@TenantScoped()
@Controller('tutors')
export class TutorsController {
  constructor(
    private readonly tutorsService: TutorsService,
    private readonly profileAccountsService: ProfileAccountsService,
  ) {}

  @Get('me')
  @Roles(UserRole.Tutor)
  @ApiOkResponse({ type: TutorResponseDto })
  findMe(@CurrentUser() user: AuthenticatedUser): Promise<TutorResponseDto> {
    return this.tutorsService.findMe(user.tenantId, user.id);
  }

  @Get()
  @ApiPaginatedResponse(TutorResponseDto)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TutorsQueryDto,
  ): Promise<PaginatedResponse<TutorResponseDto>> {
    return this.tutorsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: TutorResponseDto })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TutorResponseDto> {
    return this.tutorsService.findOne(user.tenantId, id);
  }

  @Post()
  @ApiCreatedResponse({ type: TutorResponseDto })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTutorDto,
  ): Promise<TutorResponseDto> {
    return this.tutorsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: TutorResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTutorDto,
  ): Promise<TutorResponseDto> {
    return this.tutorsService.update(user.tenantId, id, dto);
  }

  @Post(':id/account')
  @Roles(UserRole.Owner)
  @ApiCreatedResponse({ type: UserResponseDto })
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProfileAccountDto,
  ): Promise<UserResponseDto> {
    return this.profileAccountsService.createTutorAccount(
      user.tenantId,
      id,
      dto,
    );
  }
}
