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
  UpdateStudentRegistrationDto,
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

  async update(
    tenantId: string,
    studentId: string,
    dto: UpdateStudentRegistrationDto,
  ): Promise<StudentRegistrationResponseDto> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const student = await manager.findOne(StudentEntity, {
          where: { id: studentId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!student) throw new NotFoundException('Student not found');

        const relation = await manager.findOne(StudentParentEntity, {
          where: { studentId, tenantId, isPrimary: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (!relation) {
          throw new NotFoundException('Primary parent not found');
        }

        const parent = await manager.findOne(ParentEntity, {
          where: { id: relation.parentId, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!parent) throw new NotFoundException('Parent not found');

        const { parent: parentInput, ...studentInput } = dto;
        Object.assign(student, studentInput);
        parent.name = parentInput.name;
        parent.phoneNumber = parentInput.phoneNumber;
        parent.contactEmail = parentInput.email;

        if (parent.userId) {
          const conflictingUser = await manager.findOne(UserEntity, {
            where: { email: parentInput.email },
          });
          if (conflictingUser && conflictingUser.id !== parent.userId) {
            throw new ConflictException('Email is already registered');
          }
          const user = await manager.findOne(UserEntity, {
            where: { id: parent.userId, tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!user) throw new NotFoundException('Parent account not found');
          user.email = parentInput.email;
          await manager.save(user);
        }

        const savedStudent = await manager.save(student);
        const savedParent = await manager.save(parent);
        return {
          student: StudentResponseDto.fromEntity(savedStudent),
          parentId: savedParent.id,
        };
      });
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }
}
