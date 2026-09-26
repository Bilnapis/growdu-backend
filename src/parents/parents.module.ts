import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentParentEntity } from '../students/entities/student-parent.entity.js';
import { StudentEntity } from '../students/entities/student.entity.js';
import { UsersModule } from '../users/users.module.js';
import { ParentEntity } from './entities/parent.entity.js';
import { ParentsController } from './parents.controller.js';
import { ParentsService } from './parents.service.js';
import { ParentsRepository } from './repositories/parents.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ParentEntity,
      StudentParentEntity,
      StudentEntity,
    ]),
    UsersModule,
  ],
  controllers: [ParentsController],
  providers: [ParentsRepository, ParentsService],
  exports: [ParentsRepository, ParentsService],
})
export class ParentsModule {}
