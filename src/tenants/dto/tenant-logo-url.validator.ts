import { registerDecorator, type ValidationOptions } from 'class-validator';

const internalTenantLogoPath = /^\/uploads\/tenant-logos\/[0-9a-f-]+\.(png|jpg)$/i;

export function IsTenantLogoUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isTenantLogoUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          if (internalTenantLogoPath.test(value)) return true;

          try {
            const url = new URL(value);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            return false;
          }
        },
        defaultMessage: () =>
          'logoUrl must be an HTTP(S) URL or an uploaded tenant logo path',
      },
    });
  };
}
