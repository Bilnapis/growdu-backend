import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateTutorBankAccountDto } from './update-tutor-bank-account.dto.js';

const input = {
  bankName: ' Bank BCA ',
  accountNumber: ' 001234567890 ',
  accountName: ' Tutor Example ',
};

describe('UpdateTutorBankAccountDto', () => {
  it('trims fields and preserves leading zeros in account numbers', async () => {
    const dto = plainToInstance(UpdateTutorBankAccountDto, input);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toEqual({
      bankName: 'Bank BCA',
      accountNumber: '001234567890',
      accountName: 'Tutor Example',
    });
  });

  it.each(['bankName', 'accountNumber', 'accountName'])(
    'rejects missing, null, blank and oversized %s',
    async (field) => {
      for (const value of [undefined, null, ' ', 'a'.repeat(151)]) {
        const dto = plainToInstance(UpdateTutorBankAccountDto, {
          ...input,
          [field]: value,
        });
        expect(await validate(dto)).not.toHaveLength(0);
      }
    },
  );

  it('rejects fields that could change permissions or salary', async () => {
    const dto = plainToInstance(UpdateTutorBankAccountDto, {
      ...input,
      tenantId: 'another-tenant',
      sessionRate: '999999.00',
      status: 'inactive',
    });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['tenantId', 'sessionRate', 'status']),
    );
  });
});
