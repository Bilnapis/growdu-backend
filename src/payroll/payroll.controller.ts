import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { UserRole } from '../users/entities/user.entity.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import {
  MAX_PAYMENT_PROOF_BYTES,
  type PaymentProofUpload,
} from '../common/storage/payment-proof-storage.js';
import {
  GeneratePayrollDto,
  PayrollQueryDto,
  PayrollVersionDto,
  RecordPayrollPaymentDto,
  ReversePayrollPaymentDto,
  UpdatePayrollItemsDto,
  UpdatePayrollSettingsDto,
} from './dto/payroll-input.dto.js';
import {
  PayrollDetailResponseDto,
  PayrollGenerationResponseDto,
  PayrollListResponseDto,
  PayrollPeriodResponseDto,
  PayrollSettingsResponseDto,
  PayrollSummaryResponseDto,
  PayrollTutorOptionResponseDto,
} from './dto/payroll-response.dto.js';
import { PayrollStore } from './payroll-store.service.js';
import { PayrollService } from './payroll.service.js';
import { PayrollPeriodsService } from './payroll-periods.service.js';
import { PayrollGenerationService } from './payroll-generation.service.js';
import { PayrollPaymentsService } from './payroll-payments.service.js';
import { PayrollPdfService } from './payroll-pdf.service.js';

@ApiTags('Payroll')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator)
@TenantScoped()
@RequireMenuAccess(OperatorMenu.Payroll)
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly store: PayrollStore,
    private readonly periods: PayrollPeriodsService,
    private readonly generation: PayrollGenerationService,
    private readonly payments: PayrollPaymentsService,
    private readonly pdf: PayrollPdfService,
  ) {}
  @Get()
  @ApiPaginatedResponse(PayrollListResponseDto)
  list(@CurrentUser() u: AuthenticatedUser, @Query() q: PayrollQueryDto) {
    return this.payroll.list(u.tenantId, q);
  }
  @Get('summary')
  @ApiOkResponse({ type: PayrollSummaryResponseDto })
  summary(@CurrentUser() u: AuthenticatedUser, @Query() q: PayrollQueryDto) {
    return this.payroll.summary(u.tenantId, q);
  }
  @Get('periods')
  @ApiOkResponse({ type: [PayrollPeriodResponseDto] })
  allPeriods(@CurrentUser() u: AuthenticatedUser) {
    return this.periods.list(u.tenantId);
  }
  @Get('settings')
  @ApiOkResponse({ type: PayrollSettingsResponseDto })
  settings(@CurrentUser() u: AuthenticatedUser) {
    return this.periods.settings(u.tenantId);
  }
  @Patch('settings')
  @ApiOkResponse({ type: PayrollSettingsResponseDto })
  updateSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpdatePayrollSettingsDto,
  ) {
    return this.periods.update(u.tenantId, d);
  }
  @Get('tutor-options')
  @ApiPaginatedResponse(PayrollTutorOptionResponseDto)
  tutors(@CurrentUser() u: AuthenticatedUser, @Query() q: PaginationQueryDto) {
    return this.payroll.tutorOptions(u.tenantId, q);
  }
  @Get('export')
  @ApiProduces('text/csv')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PayrollQueryDto,
    @Res() res: Response,
  ) {
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="penggajian-tentor.csv"',
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('text/csv; charset=utf-8');
    await pipeline(Readable.from(this.payroll.export(u.tenantId, q)), res);
  }
  @Post('generations')
  @ApiCreatedResponse({ type: PayrollGenerationResponseDto })
  generate(@CurrentUser() u: AuthenticatedUser, @Body() d: GeneratePayrollDto) {
    return this.generation.generate(u.tenantId, d.periodId, u.id, d.tutorId);
  }
  @Get(':id')
  @ApiOkResponse({ type: PayrollDetailResponseDto })
  detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.store.detail(u.tenantId, id);
  }
  @Patch(':id/items')
  @ApiOkResponse({ type: PayrollDetailResponseDto })
  items(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdatePayrollItemsDto,
  ) {
    return this.payroll.updateItems(u.tenantId, id, u.id, d);
  }
  @Post(':id/recalculations')
  @ApiCreatedResponse({ type: PayrollDetailResponseDto })
  recalculate(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: PayrollVersionDto,
  ) {
    return this.payroll.recalculate(u.tenantId, id, u.id, d.version);
  }
  @Post(':id/payments')
  @ApiCreatedResponse({ type: PayrollDetailResponseDto })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiExtraModels(RecordPayrollPaymentDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(RecordPayrollPaymentDto) },
        {
          type: 'object',
          properties: { file: { type: 'string', format: 'binary' } },
        },
      ],
    },
  })
  @ApiPayloadTooLargeResponse({
    description: 'Bukti pembayaran maksimal 5 MB.',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PAYMENT_PROOF_BYTES, files: 1, fields: 7 },
    }),
  )
  pay(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordPayrollPaymentDto,
    @UploadedFile() file?: PaymentProofUpload,
  ) {
    return this.payments.record(u, id, d, file);
  }
  @Post(':id/payments/:paymentId/reversals')
  @ApiOperation({
    summary:
      'Cancel the payment record; preserves its snapshot and audit history.',
  })
  @ApiCreatedResponse({ type: PayrollDetailResponseDto })
  reverse(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() d: ReversePayrollPaymentDto,
  ) {
    return this.payments.reverse(u, id, paymentId, d);
  }
  @Get(':id/payments/:paymentId/proof')
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async proof(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
  ) {
    const proof = await this.payments.proof(u.tenantId, id, paymentId);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(proof.mime).send(proof.buffer);
  }
  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async activePdf(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    sendPdf(res, await this.pdf.generate(u.tenantId, id));
  }
  @Get(':id/payments/:paymentId/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async paymentPdf(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Res() res: Response,
  ) {
    sendPdf(res, await this.pdf.generate(u.tenantId, id, paymentId));
  }
}

@ApiTags('Tutor payroll')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Tutor)
@TenantScoped()
@Controller('tutor/payroll')
export class TutorPayrollController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly pdf: PayrollPdfService,
  ) {}
  @Get()
  @ApiPaginatedResponse(PayrollListResponseDto)
  list(@CurrentUser() u: AuthenticatedUser, @Query() q: PayrollQueryDto) {
    return this.payroll.tutorList(u.tenantId, u.id, q);
  }
  @Get(':id')
  @ApiOkResponse({ type: PayrollDetailResponseDto })
  detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.payroll.tutorDetail(u.tenantId, u.id, id);
  }
  @Get(':id/pdf')
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async download(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    await this.payroll.tutorDetail(u.tenantId, u.id, id);
    sendPdf(res, await this.pdf.generate(u.tenantId, id));
  }
}
function sendPdf(res: Response, pdf: { filename: string; buffer: Buffer }) {
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${pdf.filename}"`,
  );
  res.setHeader('Cache-Control', 'private, no-store');
  res.type('application/pdf').send(pdf.buffer);
}
