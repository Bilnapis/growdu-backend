import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import appConfig from '../config/app.config.js';

export interface InvoiceProofUpload {
  buffer: Buffer;
  originalname: string;
  size: number;
}
export const MAX_INVOICE_PROOF_BYTES = 5 * 1024 * 1024;

export function proofMime(buffer: Buffer): 'image/png' | 'image/jpeg' {
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' &&
    buffer.subarray(12, 16).toString('ascii') === 'IHDR'
  )
    return 'image/png';
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff &&
    buffer.at(-2) === 0xff &&
    buffer.at(-1) === 0xd9
  )
    return 'image/jpeg';
  throw new BadRequestException(
    'Bukti pembayaran harus berupa gambar JPG atau PNG yang valid.',
  );
}

@Injectable()
export class InvoiceProofStorage {
  private readonly directory: string;
  constructor(@Inject(appConfig.KEY) config: ConfigType<typeof appConfig>) {
    this.directory = resolve(config.invoiceProofStoragePath);
    const publicDirectory = resolve('uploads');
    const pathFromPublic = relative(publicDirectory, this.directory);
    if (
      pathFromPublic === '' ||
      (!pathFromPublic.startsWith('..') && !isAbsolute(pathFromPublic))
    )
      throw new Error('Invoice proof storage must be outside public uploads');
  }
  async store(file: InvoiceProofUpload) {
    if (
      !Buffer.isBuffer(file.buffer) ||
      file.buffer.length > MAX_INVOICE_PROOF_BYTES
    )
      throw new BadRequestException('Bukti pembayaran maksimal 5 MB.');
    const mime = proofMime(file.buffer),
      key = `${randomUUID()}.${mime === 'image/png' ? 'png' : 'jpg'}`;
    const name =
      basename(file.originalname.replaceAll('\\', '/'))
        .split('')
        .filter(
          (character) =>
            character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
        )
        .join('')
        .slice(0, 200) || 'bukti-pembayaran';
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeFile(resolve(this.directory, key), file.buffer, {
      flag: 'wx',
      mode: 0o600,
    });
    return { key, name, mime };
  }
  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }
  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.path(key));
    } catch {
      throw new NotFoundException('Bukti pembayaran tidak tersedia.');
    }
  }
  private path(key: string): string {
    if (!/^[0-9a-f-]{36}\.(png|jpg)$/.test(key))
      throw new NotFoundException('Bukti pembayaran tidak ditemukan.');
    return resolve(this.directory, key);
  }
}
