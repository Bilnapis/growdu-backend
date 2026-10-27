import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import { AnnouncementEntity } from './entities/announcement.entity.js';
import { AnnouncementsRepository } from './repositories/announcements.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([AnnouncementEntity])],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, AnnouncementsRepository],
})
export class AnnouncementsModule {}
