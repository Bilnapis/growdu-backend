import { Module } from '@nestjs/common';
import { PasswordHashService } from './password-hash.service.js';

@Module({
  providers: [PasswordHashService],
  exports: [PasswordHashService],
})
export class SecurityModule {}
