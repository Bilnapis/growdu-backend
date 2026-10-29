import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MetricsHistoryService } from '../metrics-history/metrics-history.service.js';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import { isDuplicateEntryError } from '../common/database/database-error.util.js';
import {
  createPaginationMeta,
  PaginatedResponse,
} from '../common/dto/pagination-query.dto.js';
import { EntityStatus } from '../common/enums/entity-status.enum.js';
import { PasswordHashService } from '../common/security/password-hash.service.js';
import { UserEntity, UserRole } from '../users/entities/user.entity.js';
import {
  CreateTutorDto,
  TutorFormOptionsDto,
  TutorsQueryDto,
  UpdateTutorDto,
} from './dto/tutor-input.dto.js';
import {
  TutorResponseDto,
  TutorsSummaryResponseDto,
} from './dto/tutor-response.dto.js';
import { TutorEntity } from './entities/tutor.entity.js';
import { TutorsRepository } from './repositories/tutors.repository.js';
import { UpdateTutorBankAccountDto } from './dto/update-tutor-bank-account.dto.js';
import { UpdateTutorProfileDto } from './dto/update-tutor-profile.dto.js';

@Injectable()
export class TutorsService {
  constructor(
    private readonly tutorsRepository: TutorsRepository,
    private readonly passwordHashService: PasswordHashService,
    private readonly dataSource: DataSource,
    private readonly metricsHistory: MetricsHistoryService,
  ) {}

  async getSummary(tenantId: string): Promise<TutorsSummaryResponseDto> {
    const [active, previousMonthActive] = await Promise.all([
      this.dataSource.getRepository(TutorEntity).countBy({
        tenantId,
        status: EntityStatus.Active,
      }),
      this.metricsHistory.getPreviousMonthActive(tenantId, 'tutor'),
    ]);
    return { active, previousMonthActive };
  }

  async findAll(
    tenantId: string,
    query: TutorsQueryDto,
  ): Promise<PaginatedResponse<TutorResponseDto>> {
    const [tutors, total] = await this.tutorsRepository.findPage(
      tenantId,
      query,
    );
    return {
      data: tutors.map(TutorResponseDto.fromEntity),
      meta: createPaginationMeta(query.page, query.limit, total),
    };
  }

  async findOne(tenantId: string, id: string): Promise<TutorResponseDto> {
    return TutorResponseDto.fromEntity(await this.findEntity(tenantId, id));
  }

  getFormOptions(): TutorFormOptionsDto {
    return {
      expertiseOptions: [
        'Matematika',
        'Fisika',
        'Kimia',
        'Biologi',
        'Bahasa Inggris',
        'Bahasa Indonesia',
        'Ekonomi',
        'Akuntansi',
        'Komputer',
      ],
      educationOptions: [
        'Pendidikan Matematika',
        'Pendidikan Fisika',
        'Pendidikan Kimia',
        'Pendidikan Biologi',
        'Pendidikan Bahasa Inggris',
        'Teknik Informatika',
        'Sistem Informasi',
        'Akuntansi',
        'Manajemen',
      ],
      bankOptions: [
        'BCA',
        'BNI',
        'BRI',
        'Mandiri',
        'BSI',
        'CIMB Niaga',
        'Permata',
        'DANA',
        'GoPay',
        'OVO',
        'ShopeePay',
      ],
    };
  }

  async findMe(tenantId: string, userId: string): Promise<TutorResponseDto> {
    const tutor = await this.tutorsRepository.findByUserId(userId, tenantId);
    if (!tutor) {
      throw new NotFoundException('Tutor profile not found');
    }
    return TutorResponseDto.fromEntity(tutor);
  }

  async updateMe(
    tenantId: string,
    userId: string,
    dto: UpdateTutorProfileDto,
  ): Promise<TutorResponseDto> {
    const tutor = await this.findMe(tenantId, userId);
    return this.update(tenantId, tutor.id, {
      name: dto.name,
      phoneNumber: dto.phoneNumber,
      email: dto.email,
      address: dto.address,
      expertise: dto.expertise,
      education: dto.education,
    });
  }

  async updateMyBankAccount(
    tenantId: string,
    userId: string,
    dto: UpdateTutorBankAccountDto,
  ): Promise<TutorResponseDto> {
    const tutor = await this.findMe(tenantId, userId);
    return this.update(tenantId, tutor.id, {
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
    });
  }

  async create(
    tenantId: string,
    dto: CreateTutorDto,
  ): Promise<TutorResponseDto> {
    try {
      const tutor = await this.dataSource.transaction(async (manager) => {
        const existingUser = await manager.findOne(UserEntity, {
          where: { email: dto.email },
        });
        if (existingUser) {
          throw new ConflictException('Email is already registered');
        }

        const status = dto.status ?? EntityStatus.Active;
        const user = manager.create(UserEntity, {
          tenantId,
          email: dto.email,
          passwordHash: await this.passwordHashService.hash(dto.password),
          role: UserRole.Tutor,
          status,
          lastLoginAt: null,
        });
        const savedUser = await manager.save(user);
        const createdTutor = manager.create(TutorEntity, {
          tenantId,
          userId: savedUser.id,
          name: dto.name,
          phoneNumber: dto.phoneNumber,
          email: dto.email,
          address: dto.address ?? null,
          expertise: dto.expertise ?? null,
          education: dto.education ?? null,
          bankName: dto.bankName ?? null,
          accountName: dto.accountName ?? null,
          accountNumber: dto.accountNumber ?? null,
          sessionRate: this.normalizeRate(dto.sessionRate),
          status,
        });
        return manager.save(createdTutor);
      });
      return TutorResponseDto.fromEntity(tutor);
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email or tutor account already exists');
      }
      throw error;
    }
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateTutorDto,
  ): Promise<TutorResponseDto> {
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const tutor = await manager.findOne(TutorEntity, {
          where: { id, tenantId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!tutor) throw new NotFoundException('Tutor not found');

        if (dto.name !== undefined) tutor.name = dto.name;
        if (dto.phoneNumber !== undefined) tutor.phoneNumber = dto.phoneNumber;
        if (dto.email !== undefined) tutor.email = dto.email;
        if (dto.address !== undefined) tutor.address = dto.address;
        if (dto.expertise !== undefined) tutor.expertise = dto.expertise;
        if (dto.education !== undefined) tutor.education = dto.education;
        if (dto.bankName !== undefined) tutor.bankName = dto.bankName;
        if (dto.accountName !== undefined) tutor.accountName = dto.accountName;
        if (dto.accountNumber !== undefined)
          tutor.accountNumber = dto.accountNumber;
        if (dto.sessionRate !== undefined) {
          tutor.sessionRate = this.normalizeRate(dto.sessionRate);
        }
        if (dto.status !== undefined) tutor.status = dto.status;

        let user: UserEntity | null = null;
        if (tutor.userId) {
          user = await manager.findOne(UserEntity, {
            where: { id: tutor.userId, tenantId },
            lock: { mode: 'pessimistic_write' },
          });
          if (!user)
            throw new NotFoundException('Tutor login account not found');
          if (dto.email !== undefined) user.email = dto.email;
          if (dto.password !== undefined) {
            user.passwordHash = await this.passwordHashService.hash(
              dto.password,
            );
          }
          if (dto.status !== undefined) user.status = dto.status;
          await manager.save(user);
        } else if (dto.password !== undefined) {
          const email = dto.email ?? tutor.email;
          if (!email) {
            throw new BadRequestException(
              'An email is required to create a login account',
            );
          }
          const existingUser = await manager.findOne(UserEntity, {
            where: { email },
          });
          if (existingUser)
            throw new ConflictException('Email is already registered');
          user = manager.create(UserEntity, {
            tenantId,
            email,
            passwordHash: await this.passwordHashService.hash(dto.password),
            role: UserRole.Tutor,
            status: tutor.status,
            lastLoginAt: null,
          });
          const savedUser = await manager.save(user);
          tutor.userId = savedUser.id;
          tutor.email = email;
        }

        const savedTutor = await manager.save(tutor);
        if (
          user &&
          (dto.status === EntityStatus.Inactive || dto.password !== undefined)
        ) {
          await manager
            .createQueryBuilder()
            .update(AuthSessionEntity)
            .set({ revokedAt: new Date() })
            .where('user_id = :userId', { userId: user.id })
            .andWhere('revoked_at IS NULL')
            .execute();
        }
        return savedTutor;
      });
      return TutorResponseDto.fromEntity(saved);
    } catch (error: unknown) {
      if (isDuplicateEntryError(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  private async findEntity(tenantId: string, id: string): Promise<TutorEntity> {
    const tutor = await this.tutorsRepository.findById(id, tenantId);
    if (!tutor) {
      throw new NotFoundException('Tutor not found');
    }
    return tutor;
  }

  private normalizeRate(value: string): string {
    const [integer, fraction = ''] = value.split('.');
    return `${integer}.${fraction.padEnd(2, '0')}`;
  }
}
