import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudyGroupScheduleEntity } from '../study-groups/entities/study-group-schedule.entity.js';
import { SchedulesRepository } from './repositories/schedules.repository.js';
import { SchedulesController } from './schedules.controller.js';
import { SchedulesService } from './schedules.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([StudyGroupScheduleEntity])],
  controllers: [SchedulesController],
  providers: [SchedulesRepository, SchedulesService],
})
export class SchedulesModule {}
