import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../common/security/security.module.js';
import { OwnersModule } from '../owners/owners.module.js';
import { UserEntity } from '../users/entities/user.entity.js';
import { OperatorsController } from './operators.controller.js';
import { OperatorsService } from './operators.service.js';
import { OperatorEntity } from './entities/operator.entity.js';
import { OperatorsRepository } from './repositories/operators.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([OperatorEntity, UserEntity]),
    OwnersModule,
    SecurityModule,
  ],
  controllers: [OperatorsController],
  providers: [OperatorsRepository, OperatorsService],
})
export class OperatorsModule {}
