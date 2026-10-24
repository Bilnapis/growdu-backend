import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { EntityStatus } from '../../common/enums/entity-status.enum.js';
import { StudyGroupStudentEntity } from '../../study-groups/entities/study-group-student.entity.js';
import { StudyGroupScheduleEntity } from '../../study-groups/entities/study-group-schedule.entity.js';
import {
  ScheduleEducationLevel,
  SchedulesQueryDto,
} from '../dto/schedule-query.dto.js';
import { ScheduleListItemResponseDto } from '../dto/schedule-response.dto.js';

interface ScheduleRow {
  schedule_id: string;
  study_group_id: string;
  study_group_name: string;
  subject: string | null;
  tutor_id: string;
  tutor_name: string;
  room_id: string | null;
  room_name: string | null;
  room_code: string | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  student_count: string;
}

@Injectable()
export class SchedulesRepository {
  constructor(
    @InjectRepository(StudyGroupScheduleEntity)
    private readonly repository: Repository<StudyGroupScheduleEntity>,
  ) {}

  async findPage(
    tenantId: string,
    query: SchedulesQueryDto,
    tutorUserId?: string,
  ): Promise<[ScheduleListItemResponseDto[], number]> {
    const totalQuery = this.applyFilters(
      this.createBaseQuery(tenantId),
      query,
      tutorUserId,
    );
    const dataQuery = this.applyFilters(
      this.createBaseQuery(tenantId),
      query,
      tutorUserId,
    )
      .select('schedule.id', 'schedule_id')
      .addSelect('studyGroup.id', 'study_group_id')
      .addSelect('studyGroup.name', 'study_group_name')
      .addSelect('tutor.expertise', 'subject')
      .addSelect('tutor.id', 'tutor_id')
      .addSelect('tutor.name', 'tutor_name')
      .addSelect('room.id', 'room_id')
      .addSelect('room.name', 'room_name')
      .addSelect('room.code', 'room_code')
      .addSelect('schedule.day_of_week', 'day_of_week')
      .addSelect('schedule.start_time', 'start_time')
      .addSelect('schedule.end_time', 'end_time')
      .addSelect(
        (subQuery) =>
          subQuery
            .select('COUNT(*)')
            .from(StudyGroupStudentEntity, 'member')
            .where('member.tenant_id = schedule.tenant_id')
            .andWhere('member.study_group_id = schedule.study_group_id'),
        'student_count',
      );

    const [rows, total] = await Promise.all([
      dataQuery
        .orderBy('schedule.day_of_week', 'ASC')
        .addOrderBy('schedule.start_time', 'ASC')
        .addOrderBy('studyGroup.name', 'ASC')
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany<ScheduleRow>(),
      totalQuery.getCount(),
    ]);

    return [rows.map((row) => this.toListItem(row)), total];
  }

  async getSummary(
    tenantId: string,
    today: number,
    tutorUserId?: string,
  ): Promise<{ totalSchedules: number; schedulesToday: number }> {
    const totalQuery = this.applyTutorScope(
      this.createBaseQuery(tenantId),
      tutorUserId,
    );
    const todayQuery = this.applyTutorScope(
      this.createBaseQuery(tenantId),
      tutorUserId,
    ).andWhere('schedule.day_of_week = :today', { today });

    const [totalSchedules, schedulesToday] = await Promise.all([
      totalQuery.getCount(),
      todayQuery.getCount(),
    ]);

    return { totalSchedules, schedulesToday };
  }

  private createBaseQuery(
    tenantId: string,
  ): SelectQueryBuilder<StudyGroupScheduleEntity> {
    return this.repository
      .createQueryBuilder('schedule')
      .innerJoin(
        'schedule.studyGroup',
        'studyGroup',
        'studyGroup.status = :active',
        { active: EntityStatus.Active },
      )
      .innerJoin('schedule.tutor', 'tutor')
      .leftJoin('schedule.room', 'room')
      .where('schedule.tenant_id = :tenantId', { tenantId });
  }

  private applyFilters(
    queryBuilder: SelectQueryBuilder<StudyGroupScheduleEntity>,
    query: SchedulesQueryDto,
    tutorUserId?: string,
  ): SelectQueryBuilder<StudyGroupScheduleEntity> {
    this.applyTutorScope(queryBuilder, tutorUserId);
    if (query.search) {
      queryBuilder.andWhere(
        '(studyGroup.name LIKE :search OR tutor.name LIKE :search OR tutor.expertise LIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.dayOfWeek) {
      queryBuilder.andWhere('schedule.day_of_week = :dayOfWeek', {
        dayOfWeek: query.dayOfWeek,
      });
    }
    if (query.educationLevel) {
      this.applyEducationLevel(queryBuilder, query.educationLevel);
    }
    return queryBuilder;
  }

  private applyTutorScope(
    queryBuilder: SelectQueryBuilder<StudyGroupScheduleEntity>,
    tutorUserId?: string,
  ): SelectQueryBuilder<StudyGroupScheduleEntity> {
    if (tutorUserId) {
      queryBuilder.andWhere('tutor.user_id = :tutorUserId', { tutorUserId });
    }
    return queryBuilder;
  }

  private applyEducationLevel(
    queryBuilder: SelectQueryBuilder<StudyGroupScheduleEntity>,
    educationLevel: ScheduleEducationLevel,
  ): void {
    const elementary =
      "(LOWER(studyGroup.name) REGEXP '(^|[^a-z])(sd)([^a-z]|$)' OR LOWER(studyGroup.name) REGEXP 'kelas[[:space:]]+[1-6]([^0-9]|$)')";
    const juniorHigh =
      "(LOWER(studyGroup.name) REGEXP '(^|[^a-z])(smp)([^a-z]|$)' OR LOWER(studyGroup.name) REGEXP 'kelas[[:space:]]+[7-9]([^0-9]|$)')";
    const seniorHigh =
      "(LOWER(studyGroup.name) REGEXP '(^|[^a-z])(sma|smk|utbk)([^a-z]|$)' OR LOWER(studyGroup.name) REGEXP 'kelas[[:space:]]+1[0-2]([^0-9]|$)')";

    if (educationLevel === ScheduleEducationLevel.Elementary) {
      queryBuilder.andWhere(elementary);
    } else if (educationLevel === ScheduleEducationLevel.JuniorHigh) {
      queryBuilder.andWhere(juniorHigh);
    } else if (educationLevel === ScheduleEducationLevel.SeniorHigh) {
      queryBuilder.andWhere(seniorHigh);
    } else {
      queryBuilder.andWhere(
        `NOT (${elementary} OR ${juniorHigh} OR ${seniorHigh})`,
      );
    }
  }

  private toListItem(row: ScheduleRow): ScheduleListItemResponseDto {
    return {
      id: row.schedule_id,
      studyGroupId: row.study_group_id,
      studyGroupName: row.study_group_name,
      subject: row.subject,
      tutorId: row.tutor_id,
      tutorName: row.tutor_name,
      roomId: row.room_id,
      roomName: row.room_name,
      roomCode: row.room_code,
      dayOfWeek: Number(row.day_of_week),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      studentCount: Number(row.student_count),
      attendanceStatus: 'unavailable',
    };
  }
}
