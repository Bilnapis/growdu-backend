import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOperatorDto } from './operator-input.dto.js';

const validInput = {
  name: ' Pegawai Baru ',
  phoneNumber: '081234567890',
  email: ' STAFF@example.com ',
  password: 'StrongPassword123!',
};

describe('CreateOperatorDto', () => {
  it('accepts existing clients without address and normalizes input', async () => {
    const dto = plainToInstance(CreateOperatorDto, validInput);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe('Pegawai Baru');
    expect(dto.email).toBe('staff@example.com');
  });

  it('accepts a five-character password', async () => {
    const dto = plainToInstance(CreateOperatorDto, {
      ...validInput,
      password: 'abc12',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('trims the optional address', async () => {
    const dto = plainToInstance(CreateOperatorDto, {
      ...validInput,
      address: ' Jl. Melati 12 ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.address).toBe('Jl. Melati 12');
  });

  it.each([
    ['address', 'a'.repeat(1001)],
    ['address', 42],
    ['name', ' '],
    ['phoneNumber', '123'],
    ['email', 'invalid'],
    ['password', '1234'],
    ['password', 'a'.repeat(129)],
    ['menuPermissions', null],
    ['menuPermissions', 'dashboard'],
    ['menuPermissions', ['staff']],
    ['menuPermissions', ['dashboard', 'dashboard']],
  ])('rejects invalid %s', async (field, value) => {
    const dto = plainToInstance(CreateOperatorDto, {
      ...validInput,
      [field]: value,
    });
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === field)).toBe(true);
  });
});
