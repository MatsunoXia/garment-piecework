import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { chinaYearMonth } from '../common/utils/dates.js';
import { formatAmount, toDecimal } from '../common/utils/money.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async adminSummary(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);
    const companyId = admin.companyId;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekStart = new Date(Date.now() - 7 * 86400000);

    const [
      employeeCounts,
      workshopCount,
      styleCounts,
      bundleAggregate,
      reportCounts,
      pendingDisputeCount,
      pendingSettlement,
      todayReportCount,
      weekReports,
      recentLogs,
    ] = await Promise.all([
      this.prisma.employees.groupBy({
        by: ['status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      this.prisma.workshops.count({
        where: { company_id: companyId, status: 'active' },
      }),
      this.prisma.styles.groupBy({
        by: ['status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      this.prisma.bundles.aggregate({
        where: { company_id: companyId },
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      this.prisma.reports.groupBy({
        by: ['status'],
        where: { company_id: companyId },
        _count: { _all: true },
      }),
      this.prisma.report_disputes.count({
        where: { company_id: companyId, status: 'pending' },
      }),
      this.prisma.$queryRaw<Array<{ amount: Prisma.Decimal; pairs: bigint }>>(
        Prisma.sql`
          SELECT COALESCE(SUM(x.amount), 0) AS amount, COUNT(*)::bigint AS pairs
          FROM (
            SELECT r.employee_id, r.style_id,
                   SUM(b.quantity * sp.unit_price) AS amount
            FROM reports r
            JOIN bundles b
              ON b.company_id = r.company_id AND b.id = r.bundle_id
            JOIN style_processes sp
              ON sp.company_id = r.company_id AND sp.id = r.style_process_id
            LEFT JOIN settlement_report_items sri
              ON sri.company_id = r.company_id AND sri.report_id = r.id
            WHERE r.company_id = ${companyId}::uuid
              AND r.status = 'approved'
              AND sri.id IS NULL
            GROUP BY r.employee_id, r.style_id
          ) x
        `,
      ),
      this.prisma.reports.count({
        where: {
          company_id: companyId,
          status: 'approved',
          reported_at: { gte: todayStart },
        },
      }),
      this.prisma.reports.count({
        where: {
          company_id: companyId,
          status: 'approved',
          reported_at: { gte: weekStart },
        },
      }),
      this.prisma.operation_logs.findMany({
        where: { company_id: companyId },
        select: {
          id: true,
          action_type: true,
          summary: true,
          created_at: true,
          operator_type: true,
        },
        orderBy: { created_at: 'desc' },
        take: 8,
      }),
    ]);

    const employeeMap = Object.fromEntries(
      employeeCounts.map((row) => [row.status, row._count._all]),
    );
    const styleMap = Object.fromEntries(
      styleCounts.map((row) => [row.status, row._count._all]),
    );
    const reportMap = Object.fromEntries(
      reportCounts.map((row) => [row.status, row._count._all]),
    );

    return {
      company: {
        id: companyId,
        name: admin.companyName,
        isFounder: admin.isFounder,
        adminName: admin.name,
      },
      employees: {
        active: employeeMap.active ?? 0,
        disabled: employeeMap.disabled ?? 0,
        total: (employeeMap.active ?? 0) + (employeeMap.disabled ?? 0),
      },
      workshops: workshopCount,
      styles: {
        production: styleMap.production ?? 0,
        completed: styleMap.completed ?? 0,
        settled: styleMap.settled ?? 0,
        archived: styleMap.archived ?? 0,
        total: styleCounts.reduce((sum, row) => sum + row._count._all, 0),
      },
      bundles: {
        count: bundleAggregate._count._all,
        quantity: bundleAggregate._sum.quantity ?? 0,
      },
      reports: {
        pending: reportMap.pending ?? 0,
        approved: reportMap.approved ?? 0,
        rejected: reportMap.rejected ?? 0,
        todayApproved: todayReportCount,
        weekApproved: weekReports,
      },
      disputes: { pending: pendingDisputeCount },
      settlements: {
        pendingAmount: formatAmount(
          toDecimal(pendingSettlement[0]?.amount ?? 0),
        ),
        pendingPairs: Number(pendingSettlement[0]?.pairs ?? 0),
      },
      recentLogs,
    };
  }

  async employeeSummary(user: AuthUser) {
    const employee = await this.access.requireEmployee(user);
    const companyId = employee.companyId;
    const employeeId = employee.id;

    const monthStart = new Date(
      `${chinaYearMonth().slice(0, 4)}-${chinaYearMonth().slice(4, 6)}-01T00:00:00+08:00`,
    );

    const [pendingCount, monthApproved, unsettled, settledCount, myDisputes] =
      await Promise.all([
        this.prisma.reports.count({
          where: {
            company_id: companyId,
            employee_id: employeeId,
            status: 'pending',
          },
        }),
        this.prisma.$queryRaw<Array<{ quantity: bigint; amount: Prisma.Decimal }>>(
          Prisma.sql`
            SELECT COALESCE(SUM(b.quantity), 0)::bigint AS quantity,
                   COALESCE(SUM(b.quantity * sp.unit_price), 0) AS amount
            FROM reports r
            JOIN bundles b
              ON b.company_id = r.company_id AND b.id = r.bundle_id
            JOIN style_processes sp
              ON sp.company_id = r.company_id AND sp.id = r.style_process_id
            WHERE r.company_id = ${companyId}::uuid
              AND r.employee_id = ${employeeId}::uuid
              AND r.status = 'approved'
              AND r.reported_at >= ${monthStart}
          `,
        ),
        this.prisma.$queryRaw<Array<{ amount: Prisma.Decimal; pairs: bigint }>>(
          Prisma.sql`
            SELECT COALESCE(SUM(x.amount), 0) AS amount, COUNT(*)::bigint AS pairs
            FROM (
              SELECT r.style_id, SUM(b.quantity * sp.unit_price) AS amount
              FROM reports r
              JOIN bundles b
                ON b.company_id = r.company_id AND b.id = r.bundle_id
              JOIN style_processes sp
                ON sp.company_id = r.company_id AND sp.id = r.style_process_id
              LEFT JOIN settlement_report_items sri
                ON sri.company_id = r.company_id AND sri.report_id = r.id
              WHERE r.company_id = ${companyId}::uuid
                AND r.employee_id = ${employeeId}::uuid
                AND r.status = 'approved'
                AND sri.id IS NULL
              GROUP BY r.style_id
            ) x
          `,
        ),
        this.prisma.settlements.count({
          where: { company_id: companyId, employee_id: employeeId },
        }),
        this.prisma.report_disputes.count({
          where: {
            company_id: companyId,
            challenger_employee_id: employeeId,
            status: 'pending',
          },
        }),
      ]);

    return {
      employee: {
        id: employee.id,
        name: employee.name,
        employeeNo: employee.employeeNo,
        companyName: employee.companyName,
      },
      pendingReports: pendingCount,
      month: {
        quantity: Number(monthApproved[0]?.quantity ?? 0),
        amount: formatAmount(toDecimal(monthApproved[0]?.amount ?? 0)),
      },
      unsettled: {
        amount: formatAmount(toDecimal(unsettled[0]?.amount ?? 0)),
        styles: Number(unsettled[0]?.pairs ?? 0),
      },
      settledCount,
      pendingDisputes: myDisputes,
    };
  }
}
