import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import {
  CreateStudentRegistrationDto,
  StudentParentSource,
} from './dto/student-registration-input.dto.js';
import { StudentRegistrationResponseDto } from './dto/student-registration-response.dto.js';
import { StudentResponseDto } from './dto/student-response.dto.js';
import {
  ParentRelationship,
  StudentParentEntity,
} from './entities/student-parent.entity.js';
import { StudentEntity } from './entities/student.entity.js';

@Injectable()
export class StudentRegistrationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly passwordHashService: PasswordHashService,
  ) {}

  async create(
    tenantId: string,
    dto: CreateStudentRegistrationDto,
  ): Promise<StudentRegistrationResponseDto> {
    const passwordHash = dto.newParent
      ? await this.passwordHashService.hash(dto.newParent.password)
      : null;

    try {
      return await this.dataSource.transaction(async (manager) => {
        let parent: ParentEntity;

        if (dto.parentSource === StudentParentSource.New) {
          const input = dto.newParent;
          if (!input || !passwordHash) {
            throw new ConflictException('New parent data is required');
          }

          const email = input.email.trim().toLowerCase();
          const existingUser = await manager.findOne(UserEntity, {
            where: { email },
          });
          if (existingUser) {
            throw new ConflictException('Email is already registered');
          }

          const user = await manager.save(
            manager.create(UserEntity, {
              tenantId,
              email,
              passwordHash,
              role: UserRole.Parent,
              status: EntityStatus.Active,
              lastLoginAt: null,
            }),
          );
          parent = await manager.save(
            manager.create(ParentEntity, {
              tenantId,
              userId: user.id,
              name: input.name.trim(),
              phoneNumber: input.phoneNumber.trim(),
              contactEmail: email,
              status: EntityStatus.Active,
            }),
          );
        } else {
          const existingParent = await manager.findOne(ParentEntity, {
            where: {
              id: dto.parentId,
              tenantId,
              status: EntityStatus.Active,
            },
          });
          if (!existingParent) {
            throw new NotFoundException('Active parent not found');
          }
          parent = existingParent;
        }

        const student = await manager.save(
          manager.create(StudentEntity, {
            tenantId,
            studentCode: `STD-${randomUUID().slice(0, 8).toUpperCase()}`,
            name: dto.name.trim(),
            gender: dto.gender,
            educationLevel: dto.educationLevel.trim(),
            school: dto.school.trim(),
            phoneNumber: dto.phoneNumber?.trim() || null,
            address: dto.address.trim(),
            status: dto.status ?? EntityStatus.Active,
          }),
        );

        await manager.save(
          manager.create(StudentParentEntity, {
            tenantId,
            studentId: student.id,
            parentId: parent.id,
            relationship: dto.relationship ?? ParentRelationship.Guardian,
            isPrimary: true,
            accessStatus: EntityStatus.Active,
          }),
        );

        return {
          student: StudentResponseDto.fromEntity(student),
          parentId: parent.id,
        };
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException(
          'Student code, parent profile, or email already exists',
        );
      }
      throw error;
    }
  }
}
