import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassSessionEntity } from './entities/class-session.entity.js';
import { ClassSessionStudentEntity } from './entities/class-session-student.entity.js';
import { StudyGroupConfigurationEntity } from './entities/study-group-configuration.entity.js';
import {
  ClassSessionsController,
  ConfigurationsController,
} from './class-sessions.controller.js';
import { ClassSessionsService } from './class-sessions.service.js';
import { ConfigurationsService } from './configurations.service.js';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClassSessionEntity,
      ClassSessionStudentEntity,
      StudyGroupConfigurationEntity,
    ]),
  ],
  controllers: [ClassSessionsController, ConfigurationsController],
  providers: [ClassSessionsService, ConfigurationsService],
  exports: [ConfigurationsService, ClassSessionsService],
})
export class ClassSessionsModule {}
