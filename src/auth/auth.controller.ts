import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import appConfig from '../config/app.config.js';
import authConfig from '../config/auth.config.js';
import { ApiAuthEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto, LoginDto } from './dto/auth-input.dto.js';
import {
  AuthUserResponseDto,
  TokenResponseDto,
} from './dto/auth-response.dto.js';
import { AllowedOriginGuard } from './guards/allowed-origin.guard.js';
import { AuthThrottlerGuard } from './guards/auth-throttler.guard.js';
import type { AuthenticatedUser } from './types/authenticated-user.type.js';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Auth')
@ApiAuthEndpointErrors()
@UseGuards(AuthThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
    @Inject(appConfig.KEY)
    private readonly applicationConfig: ConfigType<typeof appConfig>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: TokenResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AllowedOriginGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiCookieAuth('growdu_refresh_token')
  @ApiOkResponse({ type: TokenResponseDto })
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponseDto> {
    const result = await this.authService.refresh(
      this.getRefreshToken(request),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AllowedOriginGuard)
  @ApiNoContentResponse({ description: 'Session dicabut dan cookie dihapus.' })
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.getRefreshToken(request));
    this.clearRefreshCookie(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({ description: 'Seluruh session user dicabut.' })
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logoutAll(user.id);
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOkResponse({ type: AuthUserResponseDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUserResponseDto> {
    return this.authService.getMe(user);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiNoContentResponse({
    description: 'Password diubah dan semua session dicabut.',
  })
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.changePassword(user, dto);
    this.clearRefreshCookie(response);
  }

  private getRefreshToken(request: CookieRequest): string | undefined {
    return request.cookies[this.config.cookieName];
  }

  private setRefreshCookie(response: Response, value: string): void {
    response.cookie(this.config.cookieName, value, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: this.cookiePath(),
      maxAge: this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.config.cookieName, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: this.cookiePath(),
    });
  }

  private cookiePath(): string {
    const prefix = this.applicationConfig.apiPrefix.replace(/^\/+|\/+$/g, '');
    return `/${prefix}/auth`;
  }
}
