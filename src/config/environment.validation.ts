import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().trim().default('api/v1'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_PATH: Joi.string()
    .trim()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .default('docs'),
  ADMIN_ROOT_PATH: Joi.string()
    .trim()
    .pattern(/^\/[a-zA-Z0-9/_-]+$/)
    .default('/admin'),
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
});
