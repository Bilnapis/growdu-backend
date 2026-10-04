import { BadRequestException } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { ConfigType } from '@nestjs/config';
import appConfig from '../config/app.config.js';
import { TenantLogoStorageService } from './tenant-logo-storage.service.js';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
}));

describe('TenantLogoStorageService', () => {
  it('stores a square PNG and returns its public URL', async () => {
    const service = new TenantLogoStorageService(createAppConfig());
    const image = createPng(128, 128);

    await expect(service.store({ buffer: image, size: image.length })).resolves.toMatch(
      /^https:\/\/api\.growdu\.test\/uploads\/tenant-logos\/.+\.png$/,
    );
    expect(vi.mocked(mkdir)).toHaveBeenCalledWith(expect.any(String), {
      recursive: true,
    });
    expect(vi.mocked(writeFile)).toHaveBeenCalledOnce();
  });

  it('rejects a non-square image before writing it', async () => {
    const service = new TenantLogoStorageService(createAppConfig());
    const image = createPng(128, 64);

    await expect(
      service.store({ buffer: image, size: image.length }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the local backend URL when the configured public URL is blank', async () => {
    const service = new TenantLogoStorageService({
      ...createAppConfig(),
      publicBaseUrl: '',
    });
    const image = createPng(64, 64);

    await expect(service.store({ buffer: image, size: image.length })).resolves.toMatch(
      /^http:\/\/localhost:3000\/uploads\/tenant-logos\/.+\.png$/,
    );
  });
});

function createAppConfig(): ConfigType<typeof appConfig> {
  return {
    nodeEnv: 'test',
    port: 3000,
    publicBaseUrl: 'https://api.growdu.test',
    apiPrefix: 'api/v1',
    swaggerEnabled: false,
    swaggerPath: 'docs',
  };
}

function createPng(width: number, height: number): Buffer {
  const image = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(image);
  image.write('IHDR', 12, 'ascii');
  image.writeUInt32BE(width, 16);
  image.writeUInt32BE(height, 20);
  return image;
}
