import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionEntity } from '../auth/entities/auth-session.entity.js';
import { SecurityModule } from '../common/security/security.module.js';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { ProfileAccountsService } from './profile-accounts.service.js';
import { UserEntity } from './entities/user.entity.js';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      AuthSessionEntity,
      TutorEntity,
      ParentEntity,
    ]),
    SecurityModule,
  ],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService, ProfileAccountsService],
  exports: [UsersRepository, UsersService, ProfileAccountsService],
})
export class UsersModule {}
