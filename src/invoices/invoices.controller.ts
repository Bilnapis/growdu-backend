import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Query } from '@nestjs/common';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { TenantScoped } from '../auth/decorators/tenant-scoped.decorator.js';
import { RequireMenuAccess } from '../auth/decorators/require-menu-access.decorator.js';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type.js';
import { OperatorMenu } from '../operators/menu-permissions.js';
import { UserRole } from '../users/entities/user.entity.js';
import { ApiPaginatedResponse } from '../common/swagger/api-paginated-response.decorator.js';
import { ApiProtectedEndpointErrors } from '../common/swagger/api-error-responses.decorator.js';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto.js';
import {
  GenerateInvoicesDto,
  InvoiceQueryDto,
  RecordInvoicePaymentDto,
  ReverseInvoicePaymentDto,
  UpdateBillingProfileDto,
  UpdateInvoiceBankAccountDto,
  UpdateInvoiceItemsDto,
  UpdateInvoiceSettingsDto,
} from './dto/invoice-input.dto.js';
import {
  BillingProfileResponseDto,
  InvoiceDetailResponseDto,
  InvoiceGenerationResponseDto,
  InvoiceListResponseDto,
  InvoiceOptionsResponseDto,
  InvoiceSettingsResponseDto,
  InvoiceSummaryResponseDto,
  InvoiceStudentOptionResponseDto,
} from './dto/invoice-response.dto.js';
import { InvoicesService } from './invoices.service.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicePaymentsService } from './invoice-payments.service.js';
import { InvoicePdfService } from './invoice-pdf.service.js';
import {
  MAX_INVOICE_PROOF_BYTES,
  type InvoiceProofUpload,
} from './invoice-proof-storage.service.js';

@ApiTags('Invoices')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner, UserRole.Operator)
@TenantScoped()
@RequireMenuAccess(OperatorMenu.Invoices)
@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly generation: InvoiceGenerationService,
    private readonly payments: InvoicePaymentsService,
    private readonly pdf: InvoicePdfService,
  ) {}
  @Get()
  @ApiPaginatedResponse(InvoiceListResponseDto)
  list(@CurrentUser() u: AuthenticatedUser, @Query() q: InvoiceQueryDto) {
    return this.invoices.list(u.tenantId, q);
  }
  @Get('summary')
  @ApiOkResponse({ type: InvoiceSummaryResponseDto })
  summary(@CurrentUser() u: AuthenticatedUser, @Query() q: InvoiceQueryDto) {
    return this.invoices.summary(u.tenantId, q);
  }
  @Get('options')
  @ApiOkResponse({ type: InvoiceOptionsResponseDto })
  options(@CurrentUser() u: AuthenticatedUser) {
    return this.invoices.options(u.tenantId);
  }
  @Get('student-options')
  @ApiOperation({
    summary: 'Search active students for individual invoice generation',
  })
  @ApiPaginatedResponse(InvoiceStudentOptionResponseDto)
  studentOptions(
    @CurrentUser() u: AuthenticatedUser,
    @Query() q: PaginationQueryDto,
  ) {
    return this.invoices.studentOptions(u.tenantId, q);
  }
  @Get('settings')
  @ApiOkResponse({ type: InvoiceSettingsResponseDto })
  settings(@CurrentUser() u: AuthenticatedUser) {
    return this.invoices.settings(u.tenantId);
  }
  @Patch('settings')
  @ApiOkResponse({ type: InvoiceSettingsResponseDto })
  updateSettings(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpdateInvoiceSettingsDto,
  ) {
    return this.invoices.updateSettings(u.tenantId, d);
  }
  @Get('students/:studentId/billing-profile')
  @ApiOkResponse({ type: BillingProfileResponseDto })
  profile(
    @CurrentUser() u: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.billingProfile(u.tenantId, id);
  }
  @Patch('students/:studentId/billing-profile')
  @ApiOkResponse({ type: BillingProfileResponseDto })
  updateProfile(
    @CurrentUser() u: AuthenticatedUser,
    @Param('studentId', ParseUUIDPipe) id: string,
    @Body() d: UpdateBillingProfileDto,
  ) {
    return this.invoices.updateBillingProfile(u.tenantId, id, d);
  }
  @Post('generations')
  @ApiOperation({
    summary:
      'Generate current-month invoices for all eligible active students or one selected student',
  })
  @ApiCreatedResponse({ type: InvoiceGenerationResponseDto })
  generate(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: GenerateInvoicesDto,
  ) {
    return d.studentId !== undefined
      ? this.generation.generateForStudent(
          u.tenantId,
          u.id,
          d.studentId,
          d.dueDate,
        )
      : this.generation.generate(u.tenantId, true, u.id, d.dueDate);
  }
  @Get(':id')
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  detail(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoices.detail(u.tenantId, id);
  }
  @Patch(':id/items')
  @ApiOkResponse({ type: InvoiceDetailResponseDto })
  items(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: UpdateInvoiceItemsDto,
  ) {
    return this.invoices.updateItems(u.tenantId, id, u.id, d);
  }
  @Post(':id/payments')
  @ApiCreatedResponse({ type: InvoiceDetailResponseDto })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiExtraModels(RecordInvoicePaymentDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(RecordInvoicePaymentDto) },
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
      limits: { fileSize: MAX_INVOICE_PROOF_BYTES, files: 1, fields: 7 },
    }),
  )
  pay(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() d: RecordInvoicePaymentDto,
    @UploadedFile() file: InvoiceProofUpload | undefined,
  ) {
    return this.payments.record(u, id, d, file);
  }
  @Post(':id/payments/:paymentId/reversals')
  @ApiCreatedResponse({ type: InvoiceDetailResponseDto })
  reverse(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body() d: ReverseInvoicePaymentDto,
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
  async download(
    @CurrentUser() u: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const pdf = await this.pdf.generate(u.tenantId, id);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdf.filename}"`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('application/pdf').send(pdf.buffer);
  }
}

@ApiTags('Invoices')
@ApiBearerAuth()
@ApiProtectedEndpointErrors()
@Roles(UserRole.Owner)
@TenantScoped()
@Controller('tenants/me/invoice-payment-account')
export class InvoiceBankController {
  constructor(private readonly invoices: InvoicesService) {}
  @Get()
  @ApiOkResponse({ type: InvoiceSettingsResponseDto })
  get(@CurrentUser() u: AuthenticatedUser) {
    return this.invoices.settings(u.tenantId);
  }
  @Patch()
  @ApiOperation({
    summary:
      'Owner only: set or clear the destination bank account for future invoices',
  })
  @ApiOkResponse({ type: InvoiceSettingsResponseDto })
  update(
    @CurrentUser() u: AuthenticatedUser,
    @Body() d: UpdateInvoiceBankAccountDto,
  ) {
    return this.invoices.updateBank(u.tenantId, d);
  }
}
