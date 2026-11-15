import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoices20261115000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE students
      ADD administrative_status enum('active','inactive') NOT NULL DEFAULT 'active',
      ADD billing_blocked tinyint NOT NULL DEFAULT 0,
      ADD monthly_fee int unsigned NULL,
      ADD next_invoice_period char(7) NULL,
      ADD KEY IDX_students_billing (tenant_id,status,next_invoice_period)`);
    await q.query('UPDATE students SET administrative_status = status');
    await q.query(`CREATE TABLE invoice_settings (
      tenant_id char(36) NOT NULL PRIMARY KEY, due_day tinyint unsigned NOT NULL DEFAULT 1,
      grace_days smallint unsigned NOT NULL DEFAULT 0, bank_account json NULL,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      CONSTRAINT FK_invoice_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE invoice_sequences (
      tenant_id char(36) NOT NULL, period char(7) NOT NULL, value int unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id,period), CONSTRAINT FK_invoice_sequences_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE invoices (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, student_id char(36) NOT NULL,
      number varchar(40) NOT NULL, period char(7) NOT NULL, issued_date date NOT NULL, due_date date NOT NULL,
      grace_days smallint unsigned NOT NULL, suspension_date date NOT NULL, student_name varchar(150) NOT NULL,
      snapshot json NOT NULL, total decimal(14,0) NOT NULL, paid_at datetime(6) NULL, version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY UQ_invoices_tenant_id (tenant_id,id), UNIQUE KEY UQ_invoices_student_period (tenant_id,student_id,period),
      UNIQUE KEY UQ_invoices_number (tenant_id,number), KEY IDX_invoices_period (tenant_id,period),
      KEY IDX_invoices_due (tenant_id,paid_at,suspension_date),
      CONSTRAINT FK_invoices_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
      CONSTRAINT FK_invoices_student FOREIGN KEY (tenant_id,student_id) REFERENCES students(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE invoice_items (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, invoice_id char(36) NOT NULL,
      kind varchar(10) NOT NULL, description varchar(200) NOT NULL, quantity smallint unsigned NOT NULL,
      unit_amount int unsigned NOT NULL, sort_order smallint unsigned NOT NULL,
      KEY IDX_invoice_items_invoice (tenant_id,invoice_id),
      CONSTRAINT FK_invoice_items_invoice FOREIGN KEY (tenant_id,invoice_id) REFERENCES invoices(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE invoice_payments (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, invoice_id char(36) NOT NULL,
      request_id char(36) NOT NULL, request_hash char(64) NOT NULL, amount decimal(14,0) NOT NULL,
      paid_at datetime(6) NOT NULL, method varchar(20) NOT NULL, reference varchar(100) NULL, note varchar(1000) NULL,
      recorded_by char(36) NOT NULL, recorded_by_name varchar(150) NOT NULL,
      proof_key varchar(60) NULL, proof_name varchar(200) NULL, proof_mime varchar(20) NULL,
      reversed_at datetime(6) NULL, reversal_reason varchar(1000) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY UQ_invoice_payment_request (tenant_id,request_id), KEY IDX_invoice_payments_invoice (tenant_id,invoice_id),
      CONSTRAINT FK_invoice_payments_invoice FOREIGN KEY (tenant_id,invoice_id) REFERENCES invoices(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE invoice_events (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, invoice_id char(36) NOT NULL,
      type varchar(40) NOT NULL, actor_id char(36) NULL, details json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY IDX_invoice_events_invoice (tenant_id,invoice_id),
      CONSTRAINT FK_invoice_events_invoice FOREIGN KEY (tenant_id,invoice_id) REFERENCES invoices(tenant_id,id) ON DELETE RESTRICT)`);
  }

  async down(q: QueryRunner): Promise<void> {
    const rows: { total: string }[] = await q.query(
      'SELECT COUNT(*) total FROM invoices',
    );
    if (Number(rows[0]?.total)) {
      throw new Error(
        'Rollback refused: invoice history exists. Export and restore a backup instead.',
      );
    }
    // Restore administrative status before removing the SPP restriction columns.
    await q.query('UPDATE students SET status = administrative_status');
    for (const table of [
      'invoice_events',
      'invoice_payments',
      'invoice_items',
      'invoices',
      'invoice_sequences',
      'invoice_settings',
    ]) {
      await q.query(`DROP TABLE ${table}`);
    }
    await q.query(`ALTER TABLE students DROP INDEX IDX_students_billing,
      DROP COLUMN next_invoice_period, DROP COLUMN monthly_fee,
      DROP COLUMN billing_blocked, DROP COLUMN administrative_status`);
  }
}
