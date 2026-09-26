import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParentEntity } from '../parents/entities/parent.entity.js';
import { StudentParentEntity } from './entities/student-parent.entity.js';
import { StudentEntity } from './entities/student.entity.js';
import { StudentsRepository } from './repositories/students.repository.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StudentEntity,
      StudentParentEntity,
      ParentEntity,
    ]),
  ],
  controllers: [StudentsController],
  providers: [StudentsRepository, StudentsService],
  exports: [StudentsRepository, StudentsService],
})
export class StudentsModule {}
