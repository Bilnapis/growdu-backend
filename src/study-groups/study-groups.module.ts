import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from '../students/entities/student.entity.js';
import { TutorEntity } from '../tutors/entities/tutor.entity.js';
import { StudyGroupScheduleEntity } from './entities/study-group-schedule.entity.js';
import { StudyGroupStudentEntity } from './entities/study-group-student.entity.js';
import { StudyGroupEntity } from './entities/study-group.entity.js';
import { StudyGroupsController } from './study-groups.controller.js';
import { StudyGroupsService } from './study-groups.service.js';
@Module({ imports: [TypeOrmModule.forFeature([StudyGroupEntity, StudyGroupScheduleEntity, StudyGroupStudentEntity, TutorEntity, StudentEntity])], controllers: [StudyGroupsController], providers: [StudyGroupsService] })
export class StudyGroupsModule {}
