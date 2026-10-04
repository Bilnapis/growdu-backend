import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  PUBLIC_BASE_URL: Joi.string().uri({ scheme: ['http', 'https'] }).default(
    'http://localhost:3000',
  ),
  API_PREFIX: Joi.string().trim().default('api/v1'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('docs'),
  ADMIN_ROOT_PATH: Joi.string()
    .trim()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/backend-admin'),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(12).required(),
  ADMIN_COOKIE_SECRET: Joi.string().min(32).required(),
  DB_HOST: Joi.string().hostname().required(),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().trim().required(),
  DB_PASSWORD: Joi.string().allow('').default(''),
  DB_NAME: Joi.string().trim().required(),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ISSUER: Joi.string().trim().min(1).default('growdu-backend'),
  JWT_AUDIENCE: Joi.string().trim().min(1).default('growdu-web'),
  JWT_ACCESS_TTL_SECONDS: Joi.number()
    .integer()
    .min(60)
    .max(86_400)
    .default(900),
  AUTH_REFRESH_TTL_DAYS: Joi.number().integer().min(1).max(90).default(7),
  AUTH_COOKIE_NAME: Joi.string()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('growdu_refresh_token'),
  AUTH_COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .default('lax'),
  AUTH_COOKIE_SECURE: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  FRONTEND_ORIGINS: Joi.string().trim().default('http://localhost:5174'),
});
