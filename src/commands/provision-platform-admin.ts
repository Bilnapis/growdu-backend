import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProvisionPlatformAdminModule } from './provision-platform-admin.module.js';
import { ProvisionPlatformAdminService } from './provision-platform-admin.service.js';

const logger = new Logger('ProvisionPlatformAdmin');

async function provisionPlatformAdmin(): Promise<void> {
  const context = await NestFactory.createApplicationContext(
    ProvisionPlatformAdminModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const result = await context.get(ProvisionPlatformAdminService).provision();
    logger.log(`Provisioned platform admin ${result.id} (${result.email})`);
  } finally {
    await context.close();
  }
}

await provisionPlatformAdmin();
