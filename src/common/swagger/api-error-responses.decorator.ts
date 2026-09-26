import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

export function ApiProtectedEndpointErrors(): ClassDecorator {
  return applyDecorators(
    ApiBadRequestResponse({
      description: 'Request payload or parameter is invalid.',
    }),
    ApiUnauthorizedResponse({
      description: 'Access token is missing or invalid.',
    }),
    ApiForbiddenResponse({ description: 'The current role is not allowed.' }),
    ApiNotFoundResponse({
      description: 'The tenant-scoped record was not found.',
    }),
    ApiConflictResponse({
      description: 'The request conflicts with existing data.',
    }),
  );
}

export function ApiAuthEndpointErrors(): ClassDecorator {
  return applyDecorators(
    ApiBadRequestResponse({ description: 'Request payload is invalid.' }),
    ApiUnauthorizedResponse({
      description: 'Credentials or session are invalid.',
    }),
    ApiForbiddenResponse({
      description: 'Request origin or role is not allowed.',
    }),
    ApiTooManyRequestsResponse({
      description: 'Authentication rate limit exceeded.',
    }),
  );
}
