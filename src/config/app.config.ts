import { registerAs } from '@nestjs/config';

export default registerAs('app', () => {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const publicBaseUrl =
    process.env.PUBLIC_BASE_URL?.trim() || `http://localhost:${port}`;

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ''),
    apiPrefix: process.env.API_PREFIX ?? 'api/v1',
    swaggerEnabled: process.env.SWAGGER_ENABLED !== 'false',
    swaggerPath: process.env.SWAGGER_PATH ?? 'docs',
    invoiceProofStoragePath:
      process.env.INVOICE_PROOF_STORAGE_PATH ?? 'storage/invoice-proofs',
    invoiceAutomationEnabled:
      process.env.INVOICE_AUTOMATION_ENABLED !== 'false',
    payrollProofStoragePath:
      process.env.PAYROLL_PROOF_STORAGE_PATH ?? 'storage/payroll-proofs',
    payrollAutomationEnabled:
      process.env.PAYROLL_AUTOMATION_ENABLED !== 'false',
  };
});
