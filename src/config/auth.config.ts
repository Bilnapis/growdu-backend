import { registerAs } from '@nestjs/config';

export type AuthCookieSameSite = 'lax' | 'strict' | 'none';

export default registerAs('auth', () => {
  const cookieSameSite = (process.env.AUTH_COOKIE_SAME_SITE ??
    'lax') as AuthCookieSameSite;
  const cookieSecure =
    process.env.NODE_ENV === 'production' ||
    process.env.AUTH_COOKIE_SECURE === 'true';

  if (cookieSameSite === 'none' && !cookieSecure) {
    throw new Error(
      'AUTH_COOKIE_SECURE must be true when AUTH_COOKIE_SAME_SITE is none',
    );
  }

  return {
    accessTokenSecret: process.env.JWT_ACCESS_SECRET ?? '',
    issuer: process.env.JWT_ISSUER ?? 'growdu-backend',
    audience: process.env.JWT_AUDIENCE ?? 'growdu-web',
    accessTokenTtlSeconds: Number.parseInt(
      process.env.JWT_ACCESS_TTL_SECONDS ?? '900',
      10,
    ),
    refreshTokenTtlDays: Number.parseInt(
      process.env.AUTH_REFRESH_TTL_DAYS ?? '7',
      10,
    ),
    cookieName: process.env.AUTH_COOKIE_NAME ?? 'growdu_refresh_token',
    cookieSameSite,
    cookieSecure,
    frontendOrigins: (process.env.FRONTEND_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
});
