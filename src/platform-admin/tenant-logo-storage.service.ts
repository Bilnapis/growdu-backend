import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import appConfig from '../config/app.config.js';

const MAX_LOGO_FILE_SIZE = 5 * 1024 * 1024;

export type TenantLogoUpload = {
  buffer: Buffer;
  size: number;
};

@Injectable()
export class TenantLogoStorageService {
  constructor(
    @Inject(appConfig.KEY)
    private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async store(file: TenantLogoUpload | undefined): Promise<string> {
    if (!file || !Buffer.isBuffer(file.buffer)) {
      throw new BadRequestException('Logo image is required');
    }
    if (file.size > MAX_LOGO_FILE_SIZE) {
      throw new BadRequestException('Logo image must be 5 MB or smaller');
    }

    const image = getSquareImageMetadata(file.buffer);
    if (!image) {
      throw new BadRequestException('Logo must be a valid PNG or JPEG image');
    }
    if (image.width !== image.height) {
      throw new BadRequestException('Logo image must have a 1:1 aspect ratio');
    }

    const directory = join(process.cwd(), 'uploads', 'tenant-logos');
    const filename = `${randomUUID()}.${image.extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), file.buffer, { flag: 'wx' });

    const publicBaseUrl = this.config.publicBaseUrl.trim() || 'http://localhost:3000';
    return new URL(
      `/uploads/tenant-logos/${filename}`,
      publicBaseUrl,
    ).toString();
  }
}

function getSquareImageMetadata(
  buffer: Buffer,
): { extension: 'png' | 'jpg'; width: number; height: number } | null {
  const png = getPngDimensions(buffer);
  if (png) return { extension: 'png', ...png };

  const jpeg = getJpegDimensions(buffer);
  if (jpeg) return { extension: 'jpg', ...jpeg };

  return null;
}

function getPngDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    return null;
  }
  if (buffer.subarray(12, 16).toString('ascii') !== 'IHDR') return null;

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function getJpegDimensions(
  buffer: Buffer,
): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda || offset + 2 > buffer.length) break;

    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if (isStartOfFrameMarker(marker)) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }

  return null;
}

function isStartOfFrameMarker(marker: number): boolean {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}
