import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePayroll20261116000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE tutors ADD UNIQUE KEY UQ_tutors_tenant_id (tenant_id,id)',
    );
    await q.query(
      'ALTER TABLE class_sessions ADD UNIQUE KEY UQ_sessions_tenant_id (tenant_id,id)',
    );
    await q.query(`CREATE TABLE payroll_settings (
      tenant_id char(36) NOT NULL PRIMARY KEY, payday tinyint unsigned NOT NULL DEFAULT 1,
      enabled tinyint NOT NULL DEFAULT 0, activated_date date NOT NULL,
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      CONSTRAINT CK_payroll_payday CHECK (payday BETWEEN 1 AND 31),
      CONSTRAINT FK_payroll_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_periods (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, start_date date NOT NULL,
      end_date date NOT NULL, pay_date date NOT NULL, generated_at datetime NULL, processed_at datetime NULL,
      UNIQUE KEY UQ_payroll_period_date (tenant_id,pay_date), UNIQUE KEY UQ_payroll_period_tenant (tenant_id,id),
      CONSTRAINT CK_payroll_period_range CHECK (start_date<=end_date AND end_date<pay_date),
      CONSTRAINT FK_payroll_period_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_sequences (
      tenant_id char(36) NOT NULL, month char(7) NOT NULL, value int unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY (tenant_id,month), CONSTRAINT FK_payroll_sequence_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payrolls (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, tutor_id char(36) NOT NULL,
      period_id char(36) NOT NULL, number varchar(40) NOT NULL, tutor_name varchar(150) NOT NULL,
      start_date date NOT NULL, end_date date NOT NULL, pay_date date NOT NULL, issued_date date NOT NULL,
      default_rate decimal(14,2) NOT NULL, snapshot json NOT NULL, total decimal(14,2) NOT NULL,
      paid_at datetime NULL, version int unsigned NOT NULL DEFAULT 1,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY UQ_payroll_tutor_period (tenant_id,tutor_id,period_id), UNIQUE KEY UQ_payroll_number (tenant_id,number),
      UNIQUE KEY UQ_payroll_tenant (tenant_id,id), KEY IDX_payroll_due (tenant_id,pay_date,paid_at),
      CONSTRAINT CK_payroll_positive CHECK (default_rate>0 AND total>0),
      CONSTRAINT FK_payroll_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
      CONSTRAINT FK_payroll_tutor FOREIGN KEY (tenant_id,tutor_id) REFERENCES tutors(tenant_id,id) ON DELETE RESTRICT,
      CONSTRAINT FK_payroll_period FOREIGN KEY (tenant_id,period_id) REFERENCES payroll_periods(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_items (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, payroll_id char(36) NOT NULL,
      study_group_id char(36) NULL, kind varchar(12) NOT NULL, description varchar(200) NOT NULL,
      source_count int unsigned NOT NULL DEFAULT 0, session_adjustment int NOT NULL DEFAULT 0,
      correction_reason varchar(1000) NULL, rate decimal(14,2) NOT NULL, sort_order int unsigned NOT NULL,
      KEY IDX_payroll_items (tenant_id,payroll_id),
      CONSTRAINT CK_payroll_item_values CHECK (rate>0 AND source_count+session_adjustment>=0 AND kind IN ('teaching','addition','deduction')),
      CONSTRAINT FK_payroll_item_payroll FOREIGN KEY (tenant_id,payroll_id) REFERENCES payrolls(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_sources (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, payroll_id char(36) NOT NULL,
      session_id char(36) NOT NULL, session_version int NOT NULL,
      UNIQUE KEY UQ_payroll_source_session (tenant_id,session_id), KEY IDX_payroll_sources (tenant_id,payroll_id),
      CONSTRAINT FK_payroll_source_payroll FOREIGN KEY (tenant_id,payroll_id) REFERENCES payrolls(tenant_id,id) ON DELETE RESTRICT,
      CONSTRAINT FK_payroll_source_session FOREIGN KEY (tenant_id,session_id) REFERENCES class_sessions(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_payments (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, payroll_id char(36) NOT NULL,
      request_id char(36) NOT NULL, request_hash char(64) NOT NULL, snapshot json NOT NULL,
      amount decimal(14,2) NOT NULL, paid_at datetime NOT NULL, paid_date date NOT NULL, method varchar(20) NOT NULL,
      reference varchar(100) NULL, note varchar(1000) NULL, recorded_by char(36) NOT NULL,
      recorded_by_name varchar(150) NOT NULL, proof_key varchar(60) NULL, proof_name varchar(200) NULL,
      proof_mime varchar(20) NULL, reversed_at datetime NULL, reversal_reason varchar(1000) NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY UQ_payroll_payment_request (tenant_id,request_id), KEY IDX_payroll_payments (tenant_id,payroll_id),
      CONSTRAINT CK_payroll_payment_values CHECK (amount>0 AND method IN ('cash','bank_transfer')),
      CONSTRAINT FK_payroll_payment_payroll FOREIGN KEY (tenant_id,payroll_id) REFERENCES payrolls(tenant_id,id) ON DELETE RESTRICT)`);
    await q.query(`CREATE TABLE payroll_events (
      id char(36) NOT NULL PRIMARY KEY, tenant_id char(36) NOT NULL, payroll_id char(36) NOT NULL,
      type varchar(40) NOT NULL, actor_id char(36) NULL, details json NOT NULL,
      created_at datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), KEY IDX_payroll_events (tenant_id,payroll_id),
      CONSTRAINT FK_payroll_event_payroll FOREIGN KEY (tenant_id,payroll_id) REFERENCES payrolls(tenant_id,id) ON DELETE RESTRICT)`);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: { total: string }[] = await q.query(
      'SELECT COUNT(*) total FROM payrolls',
    );
    if (Number(rows[0]?.total))
      throw new Error(
        'Rollback refused: payroll history exists. Restore a reviewed backup instead.',
      );
    for (const table of [
      'payroll_events',
      'payroll_payments',
      'payroll_sources',
      'payroll_items',
      'payrolls',
      'payroll_sequences',
      'payroll_periods',
      'payroll_settings',
    ])
      await q.query(`DROP TABLE ${table}`);
    await q.query(
      'ALTER TABLE class_sessions DROP INDEX UQ_sessions_tenant_id',
    );
    await q.query('ALTER TABLE tutors DROP INDEX UQ_tutors_tenant_id');
  }
}
