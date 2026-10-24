import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  CreateRoomDto,
  RoomCapacityCategory,
  RoomsQueryDto,
} from './room-input.dto.js';

describe('Room input DTOs', () => {
  it('trims the name, normalizes the code, and converts capacity', async () => {
    const dto = plainToInstance(CreateRoomDto, {
      name: '  Ruang Galileo  ',
      code: ' r-01 ',
      capacity: '12',
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Ruang Galileo',
      code: 'R-01',
      capacity: 12,
    });
  });

  it('rejects non-positive and fractional capacity', async () => {
    const zero = plainToInstance(CreateRoomDto, {
      name: 'Ruang Galileo',
      code: 'R-01',
      capacity: 0,
    });
    const fractional = plainToInstance(CreateRoomDto, {
      name: 'Ruang Galileo',
      code: 'R-01',
      capacity: 1.5,
    });

    expect(await validate(zero)).not.toHaveLength(0);
    expect(await validate(fractional)).not.toHaveLength(0);
  });

  it('accepts supported capacity categories and rejects unknown values', async () => {
    const valid = plainToInstance(RoomsQueryDto, {
      capacityCategory: RoomCapacityCategory.Medium,
    });
    const invalid = plainToInstance(RoomsQueryDto, {
      capacityCategory: 'extra-large',
    });

    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });
});
