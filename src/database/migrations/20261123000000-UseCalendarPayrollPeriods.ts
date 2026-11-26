import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UseCalendarPayrollPeriods20261123000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    const legacy: { id: string }[] = await q.query(`
      SELECT id FROM payrolls
      WHERE start_date <> DATE_FORMAT(DATE_SUB(pay_date, INTERVAL 1 MONTH), '%Y-%m-01')
         OR end_date <> LAST_DAY(DATE_SUB(pay_date, INTERVAL 1 MONTH))
      LIMIT 1`);
    if (legacy.length)
      throw new Error(
        'Migration refused: legacy payroll history exists. Review the tenant transition before enabling calendar periods.',
      );
    // Keep exact pre-migration ranges, including old custom transition cycles.
    await q.query(`CREATE TABLE IF NOT EXISTS payroll_calendar_period_backup (
      id char(36) NOT NULL PRIMARY KEY, start_date date NOT NULL,
      end_date date NOT NULL, pay_date date NOT NULL)`);
    await q.query(`INSERT IGNORE INTO payroll_calendar_period_backup
      SELECT p.id, p.start_date, p.end_date, p.pay_date FROM payroll_periods p
      WHERE p.generated_at IS NULL AND p.processed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM payrolls r WHERE r.period_id = p.id)`);
    await q.query(`UPDATE payroll_periods p
      INNER JOIN payroll_calendar_period_backup b ON b.id = p.id
      SET p.start_date = DATE_FORMAT(DATE_SUB(p.pay_date, INTERVAL 1 MONTH), '%Y-%m-01'),
          p.end_date = LAST_DAY(DATE_SUB(p.pay_date, INTERVAL 1 MONTH))
      WHERE p.generated_at IS NULL AND p.processed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM payrolls r WHERE r.period_id = p.id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    const changed: { id: string }[] = await q.query(`
      SELECT p.id FROM payroll_periods p
      LEFT JOIN payroll_calendar_period_backup b ON b.id = p.id
      WHERE (b.id IS NULL AND p.generated_at IS NULL)
         OR (b.id IS NOT NULL AND (p.generated_at IS NOT NULL
           OR p.processed_at IS NOT NULL OR p.pay_date <> b.pay_date
           OR EXISTS (SELECT 1 FROM payrolls r WHERE r.period_id = p.id)))
      LIMIT 1`);
    if (changed.length)
      throw new Error(
        'Rollback refused: payroll periods changed after migration. Restore a reviewed backup instead.',
      );
    await q.query(`UPDATE payroll_periods p
      INNER JOIN payroll_calendar_period_backup b ON b.id = p.id
      SET p.start_date = b.start_date, p.end_date = b.end_date`);
    await q.query('DROP TABLE payroll_calendar_period_backup');
  }
}
