import { Injectable } from '@nestjs/common';

import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import {
  formatAmount,
  formatUnitPrice,
  multiplyDecimal,
  sumDecimal,
  toDecimal,
} from '../common/utils/money.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface PayrollProcessItem {
  styleProcessId: string;
  processName: string;
  groupName: string | null;
  quantity: number;
  unitPrice: string;
  amount: string;
}

export interface PayrollReportItem {
  reportId: string;
  styleProcessId: string;
  processName: string;
  bundleId: string;
  bundleNo: number;
  size: string | null;
  quantity: number;
  unitPrice: string;
  amount: string;
  reportedAt: Date;
  source: string;
}

export interface PayrollDetail {
  processes: PayrollProcessItem[];
  reports: PayrollReportItem[];
  totalQuantity: number;
  totalAmount: string;
}

interface ReportRow {
  report_id: string;
  style_process_id: string;
  process_name: string;
  group_name: string | null;
  unit_price: Prisma.Decimal;
  bundle_id: string;
  bundle_no: number;
  size: string | null;
  quantity: number;
  reported_at: Date;
  source: string;
}

/**
 * 工资计算（只读）。
 * 数量取捆号，单价取款式工序当前工价，金额全部使用 Decimal 计算。
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private async loadApprovedReportRows(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    styleId: string,
    employeeId: string,
    styleProcessId?: string,
  ): Promise<ReportRow[]> {
    return client.$queryRaw<ReportRow[]>(
      Prisma.sql`
        SELECT r.id AS report_id,
               sp.id AS style_process_id,
               sp.name AS process_name,
               sp.group_name,
               sp.unit_price,
               b.id AS bundle_id,
               b.bundle_no,
               b.size,
               b.quantity,
               r.reported_at,
               r.source
        FROM reports r
        JOIN bundles b
          ON b.company_id = r.company_id AND b.id = r.bundle_id
        JOIN style_processes sp
          ON sp.company_id = r.company_id AND sp.id = r.style_process_id
        WHERE r.company_id = ${companyId}::uuid
          AND r.style_id = ${styleId}::uuid
          AND r.employee_id = ${employeeId}::uuid
          AND r.status = 'approved'
          AND (${styleProcessId ?? null}::uuid IS NULL OR sp.id = ${styleProcessId ?? null}::uuid)
        ORDER BY sp.sort_order ASC, sp.name ASC, b.bundle_no ASC
      `,
    );
  }

  /** 计算某员工某款工资明细（可用于结算与工价重算） */
  async computeDetail(
    companyId: string,
    styleId: string,
    employeeId: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<PayrollDetail> {
    const rows = await this.loadApprovedReportRows(
      client,
      companyId,
      styleId,
      employeeId,
    );

    const processMap = new Map<
      string,
      {
        processName: string;
        groupName: string | null;
        quantity: number;
        unitPrice: string;
      }
    >();

    const reports: PayrollReportItem[] = rows.map((row) => {
      const unitPrice = formatUnitPrice(toDecimal(row.unit_price));
      const amount = multiplyDecimal(row.quantity, unitPrice).toFixed(3);

      const existing = processMap.get(row.style_process_id);
      if (existing) {
        existing.quantity += row.quantity;
      } else {
        processMap.set(row.style_process_id, {
          processName: row.process_name,
          groupName: row.group_name,
          quantity: row.quantity,
          unitPrice,
        });
      }

      return {
        reportId: row.report_id,
        styleProcessId: row.style_process_id,
        processName: row.process_name,
        bundleId: row.bundle_id,
        bundleNo: row.bundle_no,
        size: row.size,
        quantity: row.quantity,
        unitPrice,
        amount,
        reportedAt: row.reported_at,
        source: row.source,
      };
    });

    const processes: PayrollProcessItem[] = Array.from(
      processMap.entries(),
    ).map(([styleProcessId, item]) => ({
      styleProcessId,
      processName: item.processName,
      groupName: item.groupName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      amount: multiplyDecimal(item.quantity, item.unitPrice).toFixed(3),
    }));

    return {
      processes,
      reports,
      totalQuantity: processes.reduce((sum, item) => sum + item.quantity, 0),
      totalAmount: formatAmount(
        sumDecimal(processes.map((item) => item.amount)),
      ),
    };
  }

  /** 款式下所有有已通过报工的员工工资汇总 */
  async getStyleEmployeeSummaries(
    companyId: string,
    styleId: string,
    keyword?: string,
  ) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        employee_id: string;
        employee_no: string;
        name: string;
        quantity: number;
        amount: Prisma.Decimal;
        settlement_id: string | null;
        total_amount: Prisma.Decimal | null;
        settled_at: Date | null;
      }>
    >(Prisma.sql`
      SELECT e.id AS employee_id,
             e.employee_no,
             e.name,
             COALESCE(SUM(b.quantity), 0)::int AS quantity,
             COALESCE(SUM(b.quantity * sp.unit_price), 0) AS amount,
             s.id AS settlement_id,
             s.total_amount,
             s.settled_at
      FROM reports r
      JOIN employees e
        ON e.company_id = r.company_id AND e.id = r.employee_id
      JOIN bundles b
        ON b.company_id = r.company_id AND b.id = r.bundle_id
      JOIN style_processes sp
        ON sp.company_id = r.company_id AND sp.id = r.style_process_id
      LEFT JOIN settlements s
        ON s.company_id = r.company_id
       AND s.style_id = r.style_id
       AND s.employee_id = r.employee_id
      WHERE r.company_id = ${companyId}::uuid
        AND r.style_id = ${styleId}::uuid
        AND r.status = 'approved'
        AND (
          ${keyword ?? null}::text IS NULL
          OR e.name ILIKE '%' || ${keyword ?? ''}::text || '%'
          OR e.employee_no ILIKE '%' || ${keyword ?? ''}::text || '%'
        )
      GROUP BY e.id, e.employee_no, e.name, s.id, s.total_amount, s.settled_at
      ORDER BY e.employee_no ASC
    `);

    return rows.map((row) => {
      const amount = formatAmount(toDecimal(row.amount));
      const settledAmount = row.total_amount
        ? row.total_amount.toFixed(2)
        : null;

      return {
        employeeId: row.employee_id,
        employeeNo: row.employee_no,
        name: row.name,
        quantity: row.quantity,
        amount,
        settled: Boolean(row.settlement_id),
        settlementId: row.settlement_id,
        settledAmount,
        settledAt: row.settled_at,
        difference:
          settledAmount !== null
            ? formatAmount(toDecimal(amount).sub(toDecimal(settledAmount)))
            : null,
      };
    });
  }

  /** 员工工资列表：按款式汇总，分页 */
  async getEmployeeStyleSummaries(
    companyId: string,
    employeeId: string,
    options: {
      styleId?: string;
      settled?: boolean;
      page: number;
      pageSize: number;
    },
  ) {
    const offset = (options.page - 1) * options.pageSize;
    const settledFilter =
      options.settled === undefined ? null : options.settled;

    const rows = await this.prisma.$queryRaw<
      Array<{
        style_id: string;
        style_no: string;
        name: string;
        status: string;
        quantity: number;
        amount: Prisma.Decimal;
        settlement_id: string | null;
        total_amount: Prisma.Decimal | null;
        settled_at: Date | null;
        last_reported_at: Date;
      }>
    >(Prisma.sql`
      SELECT st.id AS style_id,
             st.style_no,
             st.name,
             st.status,
             COALESCE(SUM(b.quantity), 0)::int AS quantity,
             COALESCE(SUM(b.quantity * sp.unit_price), 0) AS amount,
             s.id AS settlement_id,
             s.total_amount,
             s.settled_at,
             MAX(r.reported_at) AS last_reported_at
      FROM reports r
      JOIN styles st
        ON st.company_id = r.company_id AND st.id = r.style_id
      JOIN bundles b
        ON b.company_id = r.company_id AND b.id = r.bundle_id
      JOIN style_processes sp
        ON sp.company_id = r.company_id AND sp.id = r.style_process_id
      LEFT JOIN settlements s
        ON s.company_id = r.company_id
       AND s.style_id = r.style_id
       AND s.employee_id = r.employee_id
      WHERE r.company_id = ${companyId}::uuid
        AND r.employee_id = ${employeeId}::uuid
        AND r.status = 'approved'
        AND (${options.styleId ?? null}::uuid IS NULL OR r.style_id = ${options.styleId ?? null}::uuid)
        AND (
          ${settledFilter}::boolean IS NULL
          OR (${settledFilter}::boolean = TRUE AND s.id IS NOT NULL)
          OR (${settledFilter}::boolean = FALSE AND s.id IS NULL)
        )
      GROUP BY st.id, st.style_no, st.name, st.status, s.id, s.total_amount, s.settled_at
      ORDER BY MAX(r.reported_at) DESC
      LIMIT ${options.pageSize} OFFSET ${offset}
    `);

    const countRows = await this.prisma.$queryRaw<Array<{ total: bigint }>>(
      Prisma.sql`
        SELECT COUNT(DISTINCT r.style_id)::bigint AS total
        FROM reports r
        LEFT JOIN settlements s
          ON s.company_id = r.company_id
         AND s.style_id = r.style_id
         AND s.employee_id = r.employee_id
        WHERE r.company_id = ${companyId}::uuid
          AND r.employee_id = ${employeeId}::uuid
          AND r.status = 'approved'
          AND (${options.styleId ?? null}::uuid IS NULL OR r.style_id = ${options.styleId ?? null}::uuid)
          AND (
            ${settledFilter}::boolean IS NULL
            OR (${settledFilter}::boolean = TRUE AND s.id IS NOT NULL)
            OR (${settledFilter}::boolean = FALSE AND s.id IS NULL)
          )
      `,
    );

    return {
      items: rows.map((row) => ({
        styleId: row.style_id,
        styleNo: row.style_no,
        styleName: row.name,
        styleStatus: row.status,
        quantity: row.quantity,
        amount: formatAmount(toDecimal(row.amount)),
        settled: Boolean(row.settlement_id),
        settlementId: row.settlement_id,
        settledAmount: row.total_amount ? row.total_amount.toFixed(2) : null,
        settledAt: row.settled_at,
        lastReportedAt: row.last_reported_at,
      })),
      total: Number(countRows[0]?.total ?? 0),
      page: options.page,
      pageSize: options.pageSize,
    };
  }

  /** 员工某款工资详情（含工序明细、报工明细、结算信息） */
  async getEmployeeStyleDetail(
    companyId: string,
    employeeId: string,
    styleId: string,
  ) {
    const [style, employee, settlement] = await Promise.all([
      this.prisma.styles.findFirst({
        where: { id: styleId, company_id: companyId },
        select: { id: true, style_no: true, name: true, status: true },
      }),
      this.prisma.employees.findFirst({
        where: { id: employeeId, company_id: companyId },
        select: { id: true, name: true, employee_no: true },
      }),
      this.prisma.settlements.findFirst({
        where: {
          company_id: companyId,
          style_id: styleId,
          employee_id: employeeId,
        },
        select: {
          id: true,
          total_amount: true,
          payment_method: true,
          settled_at: true,
          remark: true,
          admins: { select: { name: true } },
        },
      }),
    ]);

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    if (!employee) {
      throw BusinessException.notFound('EMPLOYEE_NOT_FOUND', '员工不存在');
    }

    const detail = await this.computeDetail(companyId, styleId, employeeId);

    return {
      style,
      employee: {
        id: employee.id,
        name: employee.name,
        employeeNo: employee.employee_no,
      },
      ...detail,
      settlement: settlement
        ? {
            id: settlement.id,
            totalAmount: settlement.total_amount.toFixed(2),
            paymentMethod: settlement.payment_method,
            settledAt: settlement.settled_at,
            remark: settlement.remark,
            operator: settlement.admins?.name ?? null,
            difference: formatAmount(
              toDecimal(detail.totalAmount).sub(
                toDecimal(settlement.total_amount),
              ),
            ),
          }
        : null,
    };
  }

  /** 员工查看自己的工资列表 */
  async getMyStyleSummaries(
    employee: { id: string; companyId: string },
    options: { page: number; pageSize: number; settled?: boolean },
  ) {
    return this.getEmployeeStyleSummaries(
      employee.companyId,
      employee.id,
      options,
    );
  }

  /** 员工查询自己的某款工资详情（越权校验） */
  async getMyStyleDetail(
    employee: { id: string; companyId: string },
    styleId: string,
  ) {
    return this.getEmployeeStyleDetail(
      employee.companyId,
      employee.id,
      styleId,
    );
  }

  async requireAdminStyle(companyId: string, styleId: string) {
    const style = await this.access.getStyleOrThrow(companyId, styleId);
    return style;
  }
}
