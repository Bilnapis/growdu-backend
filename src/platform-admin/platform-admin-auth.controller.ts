import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBearerAuth, ApiCookieAuth, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AllowedOriginGuard } from '../auth/guards/allowed-origin.guard.js';
import { AuthThrottlerGuard } from '../auth/guards/auth-throttler.guard.js';
import { Public } from '../auth/decorators/public.decorator.js';
import appConfig from '../config/app.config.js';
import authConfig from '../config/auth.config.js';
import { CurrentPlatformAdmin } from './decorators/current-platform-admin.decorator.js';
import { PlatformAdminLoginDto } from './dto/platform-admin-auth.dto.js';
import { PlatformAdminResponseDto, PlatformAdminTokenResponseDto } from './dto/platform-admin-response.dto.js';
import { PlatformAdminAccessGuard } from './guards/platform-admin-access.guard.js';
import { PlatformAdminAuthService } from './platform-admin-auth.service.js';
import type { PlatformAdminAuthenticated } from './types/platform-admin-authenticated.type.js';

interface CookieRequest extends Request {
  cookies: Record<string, string | undefined>;
}

@ApiTags('Platform admin authentication')
@Public()
@UseGuards(AuthThrottlerGuard)
@Controller('platform-admin/auth')
export class PlatformAdminAuthController {
  constructor(
    private readonly platformAdminAuthService: PlatformAdminAuthService,
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
    @Inject(appConfig.KEY)
    private readonly applicationConfig: ConfigType<typeof appConfig>,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: PlatformAdminTokenResponseDto })
  async login(
    @Body() dto: PlatformAdminLoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlatformAdminTokenResponseDto> {
    const result = await this.platformAdminAuthService.login(dto);
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AllowedOriginGuard)
  @ApiCookieAuth('growdu_platform_admin_refresh_token')
  @ApiOkResponse({ type: PlatformAdminTokenResponseDto })
  async refresh(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlatformAdminTokenResponseDto> {
    const result = await this.platformAdminAuthService.refresh(this.getRefreshToken(request));
    this.setRefreshCookie(response, result.refreshToken);
    return result.response;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AllowedOriginGuard)
  @ApiCookieAuth('growdu_platform_admin_refresh_token')
  @ApiNoContentResponse()
  async logout(
    @Req() request: CookieRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.platformAdminAuthService.logout(this.getRefreshToken(request));
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(PlatformAdminAccessGuard)
  @ApiBearerAuth()
  @ApiOkResponse({ type: PlatformAdminResponseDto })
  me(@CurrentPlatformAdmin() admin: PlatformAdminAuthenticated): Promise<PlatformAdminResponseDto> {
    return this.platformAdminAuthService.getMe(admin.id);
  }

  private getRefreshToken(request: CookieRequest): string | undefined {
    return request.cookies[this.cookieName];
  }

  private setRefreshCookie(response: Response, value: string): void {
    response.cookie(this.cookieName, value, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: this.cookiePath(),
      maxAge: this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1_000,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.cookieName, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      path: this.cookiePath(),
    });
  }

  private get cookieName(): string {
    return 'growdu_platform_admin_refresh_token';
  }

  private cookiePath(): string {
    const prefix = this.applicationConfig.apiPrefix.replace(/^\/+|\/+$/g, '');
    return `/${prefix}/platform-admin/auth`;
  }
}
