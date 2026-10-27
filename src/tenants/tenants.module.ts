import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantEntity } from './entities/tenant.entity.js';
import { TenantsController } from './tenants.controller.js';
import { TenantsRepository } from './repositories/tenants.repository.js';
import { TenantLogoStorageService } from './tenant-logo-storage.service.js';
import { TenantsService } from './tenants.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TenantEntity])],
  controllers: [TenantsController],
  providers: [TenantsRepository, TenantsService, TenantLogoStorageService],
  exports: [TenantsRepository, TenantsService, TenantLogoStorageService],
})
export class TenantsModule {}
