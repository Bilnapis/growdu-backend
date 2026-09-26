import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthSessionEntity } from '../entities/auth-session.entity.js';

@Injectable()
export class AuthSessionsRepository {
  constructor(
    @InjectRepository(AuthSessionEntity)
    private readonly repository: Repository<AuthSessionEntity>,
  ) {}

  create(input: Partial<AuthSessionEntity>): AuthSessionEntity {
    return this.repository.create(input);
  }

  save(session: AuthSessionEntity): Promise<AuthSessionEntity> {
    return this.repository.save(session);
  }

  findActiveById(id: string): Promise<AuthSessionEntity | null> {
    return this.repository.findOne({ where: { id, revokedAt: IsNull() } });
  }

  findById(id: string): Promise<AuthSessionEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async rotate(
    id: string,
    expectedHash: string,
    newHash: string,
    expiresAt: Date,
  ): Promise<AuthSessionEntity | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(AuthSessionEntity)
      .set({ refreshTokenHash: newHash, expiresAt })
      .where('id = :id', { id })
      .andWhere('refresh_token_hash = :expectedHash', { expectedHash })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > :now', { now: new Date() })
      .execute();

    return result.affected === 1 ? this.findActiveById(id) : null;
  }

  async revoke(session: AuthSessionEntity): Promise<void> {
    if (session.revokedAt === null) {
      session.revokedAt = new Date();
      await this.repository.save(session);
    }
  }
}
