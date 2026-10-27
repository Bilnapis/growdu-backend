import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateTenantDto } from './update-tenant.dto.js';

describe('UpdateTenantDto', () => {
  it('normalizes submitted settings', async () => {
    const dto = plainToInstance(UpdateTenantDto, {
      name: ' Bimbel Hebat ',
      websiteUrl: ' https://bimbel.id ',
      primaryColor: ' #12b76a ',
      email: ' ADMIN@BIMBEL.ID ',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({
      name: 'Bimbel Hebat',
      primaryColor: '#12B76A',
      websiteUrl: 'https://bimbel.id',
      email: 'admin@bimbel.id',
    });
  });

  it.each([
    { name: null },
    { name: '' },
    { name: 'a' },
    { primaryColor: null },
    { primaryColor: '#FFF' },
    { primaryColor: 'red' },
    { websiteUrl: 'javascript:alert(1)' },
    { websiteUrl: 'ftp://bimbel.id' },
    { websiteUrl: 'www.bimbel.id' },
  ])('rejects invalid settings: %j', async (input) => {
    expect(
      (await validate(plainToInstance(UpdateTenantDto, input))).length,
    ).toBeGreaterThan(0);
  });

  it('allows partial updates and clearing optional contacts', async () => {
    expect(await validate(plainToInstance(UpdateTenantDto, {}))).toHaveLength(
      0,
    );
    expect(
      await validate(
        plainToInstance(UpdateTenantDto, {
          websiteUrl: null,
          email: null,
          address: null,
          whatsappNumber: null,
          logoUrl: null,
        }),
      ),
    ).toHaveLength(0);
  });
});
