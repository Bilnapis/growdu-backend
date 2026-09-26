import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module.js';
import { TutorEntity } from './entities/tutor.entity.js';
import { TutorsRepository } from './repositories/tutors.repository.js';
import { TutorsController } from './tutors.controller.js';
import { TutorsService } from './tutors.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TutorEntity]), UsersModule],
  controllers: [TutorsController],
  providers: [TutorsRepository, TutorsService],
  exports: [TutorsRepository, TutorsService],
})
export class TutorsModule {}
