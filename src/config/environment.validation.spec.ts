import { environmentValidationSchema } from './environment.validation.js';

const requiredEnvironment = {
  DB_HOST: 'mysql',
  DB_USERNAME: 'growdu_app',
  DB_NAME: 'growdu',
  JWT_ACCESS_SECRET: 'test-secret-with-at-least-32-characters',
};

const adminEnvironment = {
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'test-admin-password',
  ADMIN_COOKIE_SECRET: 'test-cookie-secret-with-at-least-32-characters',
};

describe('production environment validation', () => {
  it('allows disabled AdminJS without credentials, including empty placeholders', () => {
    for (const credentials of [
      {},
      { ADMIN_EMAIL: '', ADMIN_PASSWORD: '', ADMIN_COOKIE_SECRET: '' },
    ]) {
      const result = environmentValidationSchema.validate({
        ...requiredEnvironment,
        ...credentials,
        ADMIN_ENABLED: 'false',
      });
      expect(result.error).toBeUndefined();
    }
  });

  it.each(['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_COOKIE_SECRET'] as const)(
    'requires %s by default and when AdminJS is explicitly enabled',
    (credential) => {
      for (const enabled of [undefined, 'true']) {
        const result = environmentValidationSchema.validate({
          ...requiredEnvironment,
          ...adminEnvironment,
          [credential]: undefined,
          ADMIN_ENABLED: enabled,
        });
        expect(result.error?.details[0].path).toEqual([credential]);
      }
    },
  );

  it('accepts the existing development configuration with AdminJS enabled', () => {
    const result = environmentValidationSchema.validate({
      ...requiredEnvironment,
      ...adminEnvironment,
    });
    expect(result.error).toBeUndefined();
    expect(result.value.ADMIN_ENABLED).toBe(true);
    expect(result.value.TRUST_PROXY_HOPS).toBe(0);
  });

  it.each([-1, 0.5, 11, 'true', 'invalid'])(
    'rejects invalid proxy hop count %s',
    (hops) => {
      const result = environmentValidationSchema.validate({
        ...requiredEnvironment,
        ADMIN_ENABLED: false,
        TRUST_PROXY_HOPS: hops,
      });
      expect(result.error?.details[0].path).toEqual(['TRUST_PROXY_HOPS']);
    },
  );

  it('accepts one trusted proxy hop for the Docker deployment', () => {
    const result = environmentValidationSchema.validate({
      ...requiredEnvironment,
      ADMIN_ENABLED: false,
      TRUST_PROXY_HOPS: '1',
    });
    expect(result.error).toBeUndefined();
    expect(result.value.TRUST_PROXY_HOPS).toBe(1);
  });
});
