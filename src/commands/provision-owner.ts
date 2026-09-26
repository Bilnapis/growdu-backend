import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ProvisionOwnerModule } from './provision-owner.module.js';
import { ProvisionOwnerService } from './provision-owner.service.js';

const logger = new Logger('ProvisionOwner');

async function provisionOwner(): Promise<void> {
  const context = await NestFactory.createApplicationContext(
    ProvisionOwnerModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const result = await context.get(ProvisionOwnerService).provision();
    logger.log(
      `Provisioned tenant ${result.tenantId} and owner ${result.ownerId} (${result.ownerEmail})`,
    );
  } finally {
    await context.close();
  }
}

await provisionOwner();
