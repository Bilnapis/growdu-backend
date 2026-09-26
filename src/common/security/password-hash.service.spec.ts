import { PasswordHashService } from './password-hash.service.js';

describe('PasswordHashService', () => {
  const service = new PasswordHashService();

  it('hashes passwords with Argon2id and verifies the original value', async () => {
    const password = 'correct horse battery staple';
    const hash = await service.hash(password);

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    await expect(service.verify(hash, password)).resolves.toBe(true);
    await expect(service.verify(hash, 'incorrect password')).resolves.toBe(
      false,
    );
  });
});
