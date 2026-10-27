import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ChangePasswordDto } from './auth-input.dto.js';

describe('ChangePasswordDto', () => {
  it.each([5, 128])(
    'accepts a new password with %i characters',
    async (length) => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'current-password',
        newPassword: 'a'.repeat(length),
      });

      expect(await validate(dto)).toHaveLength(0);
    },
  );

  it.each(['', '1234', 'a'.repeat(129)])(
    'rejects a new password outside the 5–128 character range (case %#)',
    async (newPassword) => {
      const dto = plainToInstance(ChangePasswordDto, {
        currentPassword: 'current-password',
        newPassword,
      });

      const errors = await validate(dto);
      expect(errors.map((error) => error.property)).toContain('newPassword');
    },
  );
});
