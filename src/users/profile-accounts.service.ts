import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { CreateProfileAccountDto } from './dto/user-input.dto.js';
import { UserResponseDto } from './dto/user-response.dto.js';
import { UserEntity, UserRole } from './entities/user.entity.js';

@Injectable()
export class ProfileAccountsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  createTutorAccount(
    tenantId: string,
    tutorId: string,
    dto: CreateProfileAccountDto,
  ): Promise<UserResponseDto> {
    return this.createProfileAccount(tenantId, tutorId, dto, UserRole.Tutor);
  }

  createParentAccount(
    tenantId: string,
    parentId: string,
    dto: CreateProfileAccountDto,
  ): Promise<UserResponseDto> {
    return this.createProfileAccount(tenantId, parentId, dto, UserRole.Parent);
  }

  private async createProfileAccount(
    tenantId: string,
    profileId: string,
    dto: CreateProfileAccountDto,
    role: UserRole.Tutor | UserRole.Parent,
  ): Promise<UserResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const profile = await this.lockProfile(
          manager,
          tenantId,
          profileId,
          role,
        );

        if (profile.userId) {
          throw new ConflictException('Profile already has a login account');
        }
        if (profile.status !== EntityStatus.Active) {
          throw new ConflictException(
            'Inactive profiles cannot receive an account',
          );
        }

        const existing = await manager.findOne(UserEntity, {
          where: { email: dto.email },
        });
        if (existing) {
          throw new ConflictException('Email is already registered');
        }

        const user = manager.create(UserEntity, {
          tenantId,
          email: dto.email,
          passwordHash: await this.passwordHashService.hash(dto.password),
          role,
          status: EntityStatus.Active,
          lastLoginAt: null,
        });
        const savedUser = await manager.save(user);
        profile.userId = savedUser.id;
        await manager.save(profile);
        return UserResponseDto.fromEntity(savedUser);
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email or profile account already exists');
      }
      throw error;
    }
  }

  private async lockProfile(
    manager: EntityManager,
    tenantId: string,
    profileId: string,
    role: UserRole.Tutor | UserRole.Parent,
  ): Promise<TutorEntity | ParentEntity> {
    const entity = role === UserRole.Tutor ? TutorEntity : ParentEntity;
    const profile = await manager.findOne(entity, {
      where: { id: profileId, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) {
      throw new NotFoundException(
        role === UserRole.Tutor ? 'Tutor not found' : 'Parent not found',
      );
    }
    return profile;
  }
}
