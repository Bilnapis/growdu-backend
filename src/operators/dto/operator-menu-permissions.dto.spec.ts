import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOperatorDto, UpdateOperatorDto } from './operator-input.dto.js';
import { UpdateOperatorMenuPermissionsDto } from './operator-menu-permissions.dto.js';
import {
  getOperatorMenuPermissions,
  OperatorMenu,
} from '../menu-permissions.js';

describe('Employee menu permissions', () => {
  it.each([
    { menuPermissions: [] },
    { menuPermissions: [OperatorMenu.Students, OperatorMenu.Schedule] },
    { menuPermissions: Object.values(OperatorMenu) },
  ])(
    'accepts explicit permissions %j on creation and replacement',
    async (input) => {
      expect(
        await validate(plainToInstance(UpdateOperatorDto, input)),
      ).toHaveLength(0);
      expect(
        await validate(
          plainToInstance(UpdateOperatorMenuPermissionsDto, input),
        ),
      ).toHaveLength(0);
      expect(
        await validate(
          plainToInstance(CreateOperatorDto, {
            ...input,
            name: 'Pegawai',
            phoneNumber: '081234567890',
            email: 'staff@example.com',
            password: 'abc12',
          }),
        ),
      ).toHaveLength(0);
    },
  );

  it.each([
    {},
    { menuPermissions: null },
    { menuPermissions: 'students' },
    { menuPermissions: [OperatorMenu.Dashboard, OperatorMenu.Dashboard] },
    { menuPermissions: ['staff'] },
    { menuPermissions: ['unknown'] },
    { menuPermissions: [false] },
  ])('rejects invalid permission replacement %j', async (input) => {
    expect(
      await validate(plainToInstance(UpdateOperatorMenuPermissionsDto, input)),
    ).not.toHaveLength(0);
  });

  it('preserves legacy menu access while respecting explicitly empty permissions', () => {
    expect(getOperatorMenuPermissions(null)).toEqual(
      Object.values(OperatorMenu),
    );
    expect(getOperatorMenuPermissions([])).toEqual([]);
  });

  it('allows profile updates that leave permissions unchanged', async () => {
    expect(
      await validate(plainToInstance(UpdateOperatorDto, { name: 'Pegawai' })),
    ).toHaveLength(0);
  });

  it.each([
    { menuPermissions: null },
    { menuPermissions: 'students' },
    { menuPermissions: ['staff'] },
    { menuPermissions: ['students', 'students'] },
  ])('rejects invalid permissions in a profile update: %j', async (input) => {
    expect(
      await validate(plainToInstance(UpdateOperatorDto, input)),
    ).not.toHaveLength(0);
  });
});
