import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { SecurityModule } from '../common/security/security.module.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { StudentParentEntity } from './entities/student-parent.entity.js';
import { StudentEntity } from './entities/student.entity.js';
import { StudentsRepository } from './repositories/students.repository.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';
import { StudentRegistrationService } from './student-registration.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentEntity,
      StudentParentEntity,
      ParentEntity,
      UserEntity,
    ]),
    SecurityModule,
  ],
  controllers: [StudentsController],
  providers: [StudentsRepository, StudentsService, StudentRegistrationService],
  exports: [StudentsRepository, StudentsService],
})
export class StudentsModule {}
