import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { dateRangeFilter } from '../common/utils/dates.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AdminProxyBatchDto,
  AdminProxyReportDto,
  BatchReviewDto,
  BatchCreateReportsDto,
  CreateReportDto,
  ListReportsQueryDto,
  MyReportsQueryDto,
} from './dto/report.dto.js';

interface CreateReportParams {
  companyId: string;
  employeeId: string;
  styleId: string;
  styleProcessId: string;
  bundleId: string;
  source: 'employee' | 'admin_proxy';
  operatorAdminId?: string | null;
  operatorRemark?: string | null;
}

export interface CreatedReport {
  id: string;
  styleName: string;
  styleNo: string;
  processName: string;
  bundleNo: number;
  quantity: number;
  status: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  /** 报工权限校验：款式生产状态、员工车间范围、工序与捆号归属 */
  private async assertReportable(
    tx: Prisma.TransactionClient,
    companyId: string,
    employeeId: string,
    styleId: string,
    styleProcessId: string,
    bundleId: string,
  ) {
    const style = await tx.styles.findFirst({
      where: { id: styleId, company_id: companyId },
      select: {
        id: true,
        name: true,
        style_no: true,
        status: true,
        production_scope: true,
        style_workshops: { select: { workshop_id: true } },
      },
    });

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    if (style.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        `款式「${style.name}」已不在生产中，不能继续报工`,
      );
    }

    if (style.production_scope === 'workshops') {
      const employeeWorkshops = await tx.employee_workshops.findMany({
        where: { company_id: companyId, employee_id: employeeId },
        select: { workshop_id: true },
      });
      const allowed = new Set(
        style.style_workshops.map((item) => item.workshop_id),
      );

      if (
        !employeeWorkshops.some((item) => allowed.has(item.workshop_id))
      ) {
        throw BusinessException.forbidden(
          'INVALID_WORKSHOP_SCOPE',
          '该员工所属车间不在款式生产范围内，不能报工',
        );
      }
    }

    const process = await tx.style_processes.findFirst({
      where: {
        id: styleProcessId,
        company_id: companyId,
        style_id: styleId,
      },
      select: { id: true, name: true },
    });

    if (!process) {
      throw BusinessException.notFound(
        'STYLE_PROCESS_NOT_FOUND',
        '该工序不属于当前款式',
      );
    }

    const bundle = await tx.bundles.findFirst({
      where: { id: bundleId, company_id: companyId, style_id: styleId },
      select: { id: true, bundle_no: true, quantity: true },
    });

    if (!bundle) {
      throw BusinessException.notFound(
        'BUNDLE_NOT_FOUND',
        '该捆号不属于当前款式',
      );
    }

    const active = await tx.reports.findFirst({
      where: {
        company_id: companyId,
        bundle_id: bundleId,
        style_process_id: styleProcessId,
        status: { in: ['pending', 'approved'] },
      },
      select: { id: true, employee_id: true, status: true },
    });

    if (active) {
      throw BusinessException.conflict(
        'REPORT_ALREADY_EXISTS',
        active.employee_id === employeeId
          ? `你已经报过该捆号的该工序（${active.status === 'pending' ? '待审核' : '已通过'}），不能重复报工`
          : '该捆号的该工序已经有人报工，同一捆号同一工序只能由一名员工报工',
        { status: active.status, bySelf: active.employee_id === employeeId },
      );
    }

    return { style, process, bundle };
  }

  private async createInTransaction(
    params: CreateReportParams,
  ): Promise<CreatedReport> {
    return this.prisma.$transaction(async (tx) => {
      const { style, process, bundle } = await this.assertReportable(
        tx,
        params.companyId,
        params.employeeId,
        params.styleId,
        params.styleProcessId,
        params.bundleId,
      );

      const id = newId();
      const isProxy = params.source === 'admin_proxy';

      try {
        await tx.reports.create({
          data: {
            id,
            company_id: params.companyId,
            style_id: params.styleId,
            style_process_id: params.styleProcessId,
            bundle_id: params.bundleId,
            employee_id: params.employeeId,
            source: params.source,
            operator_admin_id: params.operatorAdminId ?? null,
            operator_remark: params.operatorRemark?.trim() || null,
            status: isProxy ? 'approved' : 'pending',
            ...(isProxy
              ? {
                  reviewed_by_admin_id: params.operatorAdminId ?? null,
                  reviewed_at: new Date(),
                }
              : {}),
          },
        });
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: string }).code === 'P2002'
        ) {
          throw BusinessException.conflict(
            'REPORT_ALREADY_EXISTS',
            '该捆号的该工序已经有人报工，同一捆号同一工序只能由一名员工报工',
          );
        }
        throw error;
      }

      await this.operationLog.record(
        {
          companyId: params.companyId,
          operatorType: isProxy ? 'admin' : 'employee',
          operatorId: isProxy
            ? (params.operatorAdminId ?? null)
            : params.employeeId,
          actionType: isProxy ? 'report.admin_proxy' : 'report.create',
          targetType: 'report',
          targetId: id,
          summary: `${isProxy ? '管理员代报' : '员工报工'}：${style.name}（${style.style_no}）· ${process.name} · 捆号 ${bundle.bundle_no}（${bundle.quantity} 件）`,
          detail: {
            styleId: style.id,
            styleProcessId: process.id,
            bundleId: bundle.id,
            bundleNo: bundle.bundle_no,
            quantity: bundle.quantity,
            employeeId: params.employeeId,
            remark: params.operatorRemark ?? null,
          },
        },
        tx,
      );

      return {
        id,
        styleName: style.name,
        styleNo: style.style_no,
        processName: process.name,
        bundleNo: bundle.bundle_no,
        quantity: bundle.quantity,
        status: isProxy ? 'approved' : 'pending',
      };
    });
  }

  /** 员工单条报工（数量自动取捆号数量） */
  async createReport(user: AuthUser, dto: CreateReportDto) {
    const employee = await this.access.requireEmployee(user);

    return this.createInTransaction({
      companyId: employee.companyId,
      employeeId: employee.id,
      styleId: dto.styleId,
      styleProcessId: dto.styleProcessId,
      bundleId: dto.bundleId,
      source: 'employee',
    });
  }

  /** 员工批量报工：逐条独立处理，返回成功与失败明细 */
  async createBatch(user: AuthUser, dto: BatchCreateReportsDto) {
    const employee = await this.access.requireEmployee(user);

    const succeeded: CreatedReport[] = [];
    const failed: Array<{ index: number; code: string; message: string }> = [];

    for (const [index, item] of dto.items.entries()) {
      try {
        const created = await this.createInTransaction({
          companyId: employee.companyId,
          employeeId: employee.id,
          styleId: item.styleId,
          styleProcessId: item.styleProcessId,
          bundleId: item.bundleId,
          source: 'employee',
        });
        succeeded.push(created);
      } catch (error) {
        failed.push({
          index,
          code: this.errorCode(error),
          message: this.errorMessage(error),
        });
      }
    }

    return {
      successCount: succeeded.length,
      failedCount: failed.length,
      items: succeeded,
      failures: failed,
    };
  }

  /** 管理员代报：立即视为已通过（数据库约束要求） */
  async createProxyReport(user: AuthUser, dto: AdminProxyReportDto) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      dto.employeeId,
    );

    if (employee.status !== 'active') {
      throw BusinessException.conflict(
        'EMPLOYEE_DISABLED',
        '该员工已停用，不能代报',
      );
    }

    return this.createInTransaction({
      companyId: admin.companyId,
      employeeId: employee.id,
      styleId: dto.styleId,
      styleProcessId: dto.styleProcessId,
      bundleId: dto.bundleId,
      source: 'admin_proxy',
      operatorAdminId: admin.id,
      operatorRemark: dto.remark,
    });
  }

  async createProxyBatch(user: AuthUser, dto: AdminProxyBatchDto) {
    const admin = await this.access.requireAdmin(user);
    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      dto.employeeId,
    );

    if (employee.status !== 'active') {
      throw BusinessException.conflict(
        'EMPLOYEE_DISABLED',
        '该员工已停用，不能代报',
      );
    }

    const succeeded: CreatedReport[] = [];
    const failed: Array<{ index: number; code: string; message: string }> = [];

    for (const [index, item] of dto.items.entries()) {
      try {
        const created = await this.createInTransaction({
          companyId: admin.companyId,
          employeeId: employee.id,
          styleId: item.styleId,
          styleProcessId: item.styleProcessId,
          bundleId: item.bundleId,
          source: 'admin_proxy',
          operatorAdminId: admin.id,
          operatorRemark: dto.remark,
        });
        succeeded.push(created);
      } catch (error) {
        failed.push({
          index,
          code: this.errorCode(error),
          message: this.errorMessage(error),
        });
      }
    }

    return {
      successCount: succeeded.length,
      failedCount: failed.length,
      items: succeeded,
      failures: failed,
    };
  }

  private errorCode(error: unknown): string {
    if (error instanceof Error && 'getResponse' in error) {
      const response = (error as { getResponse: () => unknown }).getResponse();
      if (response && typeof response === 'object' && 'code' in response) {
        return String((response as { code?: string }).code);
      }
    }
    return 'REPORT_CREATE_FAILED';
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error && 'getResponse' in error) {
      const response = (error as { getResponse: () => unknown }).getResponse();
      if (response && typeof response === 'object' && 'message' in response) {
        return String((response as { message?: string }).message);
      }
    }
    return error instanceof Error ? error.message : '报工失败';
  }

  async listMyReports(user: AuthUser, query: MyReportsQueryDto) {
    const employee = await this.access.requireEmployee(user);

    const where: Prisma.reportsWhereInput = {
      company_id: employee.companyId,
      employee_id: employee.id,
      ...(query.status ? { status: query.status } : {}),
      ...(query.styleId ? { style_id: query.styleId } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.reports.findMany({
        where,
        select: this.reportListSelect(),
        orderBy: { reported_at: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.reports.count({ where }),
    ]);

    return pageResult(rows.map((row) => this.mapReport(row)), total, query);
  }

  async listReports(user: AuthUser, query: ListReportsQueryDto) {
    const admin = await this.access.requireAdmin(user);
    const range = dateRangeFilter(query.dateFrom, query.dateTo);

    const where: Prisma.reportsWhereInput = {
      company_id: admin.companyId,
      ...(query.styleId ? { style_id: query.styleId } : {}),
      ...(query.employeeId ? { employee_id: query.employeeId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(range ? { reported_at: range } : {}),
      ...(query.keyword
        ? {
            OR: [
              { employees: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { employees: { employee_no: { contains: query.keyword } } },
              { styles: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { styles: { style_no: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total, summary] = await this.prisma.$transaction([
      this.prisma.reports.findMany({
        where,
        select: this.reportListSelect(),
        orderBy: { reported_at: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.reports.count({ where }),
      this.prisma.reports.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
      }),
    ]);

    return {
      ...pageResult(rows.map((row) => this.mapReport(row)), total, query),
      summary: Object.fromEntries(
        summary.map((item) => [item.status, item._count._all]),
      ),
    };
  }

  async listPendingReports(user: AuthUser, query: ListReportsQueryDto) {
    return this.listReports(
      user,
      Object.assign(new ListReportsQueryDto(), query, {
        status: 'pending' as const,
      }),
    );
  }

  private reportListSelect() {
    return {
      id: true,
      status: true,
      source: true,
      reported_at: true,
      reviewed_at: true,
      reject_reason: true,
      operator_remark: true,
      styles: { select: { id: true, style_no: true, name: true, status: true } },
      style_processes: { select: { id: true, name: true, unit_price: true } },
      bundles: { select: { id: true, bundle_no: true, size: true, quantity: true } },
      employees: { select: { id: true, name: true, employee_no: true } },
      admins_reports_company_id_operator_admin_idToadmins: {
        select: { id: true, name: true },
      },
      admins_reports_company_id_reviewed_by_admin_idToadmins: {
        select: { id: true, name: true },
      },
    } satisfies Prisma.reportsSelect;
  }

  private mapReport(row: {
    id: string;
    status: string;
    source: string;
    reported_at: Date;
    reviewed_at: Date | null;
    reject_reason: string | null;
    operator_remark: string | null;
    styles: { id: string; style_no: string; name: string; status: string };
    style_processes: { id: string; name: string; unit_price: Prisma.Decimal };
    bundles: {
      id: string;
      bundle_no: number;
      size: string | null;
      quantity: number;
    };
    employees: { id: string; name: string; employee_no: string };
    admins_reports_company_id_operator_admin_idToadmins: {
      id: string;
      name: string;
    } | null;
    admins_reports_company_id_reviewed_by_admin_idToadmins: {
      id: string;
      name: string;
    } | null;
  }) {
    return {
      id: row.id,
      status: row.status,
      source: row.source,
      reportedAt: row.reported_at,
      reviewedAt: row.reviewed_at,
      rejectReason: row.reject_reason,
      operatorRemark: row.operator_remark,
      style: row.styles,
      process: {
        id: row.style_processes.id,
        name: row.style_processes.name,
        unitPrice: row.style_processes.unit_price.toFixed(3),
      },
      bundle: {
        id: row.bundles.id,
        bundleNo: row.bundles.bundle_no,
        size: row.bundles.size,
        quantity: row.bundles.quantity,
      },
      employee: row.employees,
      operator: row.admins_reports_company_id_operator_admin_idToadmins,
      reviewer: row.admins_reports_company_id_reviewed_by_admin_idToadmins,
    };
  }

  async getReport(user: AuthUser, reportId: string) {
    const context =
      user.role === 'admin'
        ? await this.access.requireAdmin(user)
        : await this.access.requireEmployee(user);
    const companyId = context.companyId;
    const employeeId = user.role === 'employee' ? context.id : null;

    const report = await this.prisma.reports.findFirst({
      where: {
        id: reportId,
        company_id: companyId,
        ...(employeeId ? { employee_id: employeeId } : {}),
      },
      select: this.reportListSelect(),
    });

    if (!report) {
      throw BusinessException.notFound('REPORT_NOT_FOUND', '报工记录不存在');
    }

    const disputes = await this.prisma.report_disputes.findMany({
      where: { company_id: companyId, report_id: reportId },
      select: {
        id: true,
        status: true,
        result: true,
        reason: true,
        created_at: true,
        handled_at: true,
        termination_reason: true,
        reject_reason: true,
        employees_report_disputes_company_id_challenger_employee_idToemployees: {
          select: { id: true, name: true, employee_no: true },
        },
        employees_report_disputes_company_id_original_employee_idToemployees: {
          select: { id: true, name: true, employee_no: true },
        },
        admins: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    const settlementItem = await this.prisma.settlement_report_items.findFirst({
      where: { company_id: companyId, report_id: reportId },
      select: {
        settlement_id: true,
        settlements: {
          select: { id: true, settled_at: true, total_amount: true },
        },
      },
    });

    return {
      ...this.mapReport(report),
      disputes: disputes.map((item) => ({
        id: item.id,
        status: item.status,
        result: item.result,
        reason: item.reason,
        createdAt: item.created_at,
        handledAt: item.handled_at,
        handledBy: item.admins?.name ?? null,
        rejectReason: item.reject_reason,
        terminationReason: item.termination_reason,
        challenger:
          item.employees_report_disputes_company_id_challenger_employee_idToemployees,
        originalEmployee:
          item.employees_report_disputes_company_id_original_employee_idToemployees,
      })),
      settlement: settlementItem
        ? {
            id: settlementItem.settlements.id,
            settledAt: settlementItem.settlements.settled_at,
            totalAmount: settlementItem.settlements.total_amount.toFixed(2),
          }
        : null,
    };
  }

  async approveReport(user: AuthUser, reportId: string) {
    const admin = await this.access.requireAdmin(user);
    return this.approveOne(admin, reportId);
  }

  private async approveOne(
    admin: { id: string; companyId: string },
    reportId: string,
  ) {
    const report = await this.prisma.reports.findFirst({
      where: { id: reportId, company_id: admin.companyId },
      select: {
        id: true,
        status: true,
        styles: { select: { id: true, name: true, style_no: true } },
        employees: { select: { name: true } },
        style_processes: { select: { name: true } },
        bundles: { select: { bundle_no: true } },
      },
    });

    if (!report) {
      throw BusinessException.notFound('REPORT_NOT_FOUND', '报工记录不存在');
    }

    if (report.status !== 'pending') {
      throw BusinessException.conflict(
        'REPORT_NOT_PENDING',
        `该报工当前状态为「${this.statusText(report.status)}」，不能重复审核`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reports.update({
        where: { id: report.id },
        data: {
          status: 'approved',
          reviewed_by_admin_id: admin.id,
          reviewed_at: new Date(),
          reject_reason: null,
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'report.approve',
          targetType: 'report',
          targetId: report.id,
          summary: `审核通过：${report.styles.name} · ${report.style_processes.name} · 捆号 ${report.bundles.bundle_no} · ${report.employees.name}`,
          detail: {
            styleId: report.styles.id,
            styleNo: report.styles.style_no,
            bundleNo: report.bundles.bundle_no,
          },
        },
        tx,
      );
    });

    return { id: report.id, status: 'approved', message: '审核通过' };
  }

  async rejectReport(user: AuthUser, reportId: string, reason: string) {
    const admin = await this.access.requireAdmin(user);
    return this.rejectOne(admin, reportId, reason);
  }

  private async rejectOne(
    admin: { id: string; companyId: string },
    reportId: string,
    reason: string,
  ) {
    const report = await this.prisma.reports.findFirst({
      where: { id: reportId, company_id: admin.companyId },
      select: {
        id: true,
        status: true,
        styles: { select: { id: true, name: true, style_no: true } },
        employees: { select: { name: true } },
        style_processes: { select: { name: true } },
        bundles: { select: { bundle_no: true } },
      },
    });

    if (!report) {
      throw BusinessException.notFound('REPORT_NOT_FOUND', '报工记录不存在');
    }

    if (report.status !== 'pending') {
      throw BusinessException.conflict(
        'REPORT_NOT_PENDING',
        `该报工当前状态为「${this.statusText(report.status)}」，不能重复审核`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reports.update({
        where: { id: report.id },
        data: {
          status: 'rejected',
          reviewed_by_admin_id: admin.id,
          reviewed_at: new Date(),
          reject_reason: reason.trim(),
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'report.reject',
          targetType: 'report',
          targetId: report.id,
          summary: `驳回报工：${report.styles.name} · ${report.style_processes.name} · 捆号 ${report.bundles.bundle_no} · ${report.employees.name}`,
          detail: { reason: reason.trim() },
        },
        tx,
      );
    });

    return {
      id: report.id,
      status: 'rejected',
      message: '已驳回，该捆号工序可由实际完成人重新报工',
    };
  }

  /** 批量审核：逐条独立事务，返回每条结果 */
  async batchReview(user: AuthUser, dto: BatchReviewDto) {
    const admin = await this.access.requireAdmin(user);

    if (dto.action === 'reject' && !dto.reason) {
      throw BusinessException.badRequest(
        'REJECT_REASON_REQUIRED',
        '批量驳回必须填写驳回原因',
      );
    }

    const succeeded: string[] = [];
    const failed: Array<{ id: string; code: string; message: string }> = [];

    for (const id of dto.ids) {
      try {
        if (dto.action === 'approve') {
          await this.approveOne(admin, id);
        } else {
          await this.rejectOne(admin, id, dto.reason ?? '');
        }
        succeeded.push(id);
      } catch (error) {
        failed.push({
          id,
          code: this.errorCode(error),
          message: this.errorMessage(error),
        });
      }
    }

    return {
      successCount: succeeded.length,
      failedCount: failed.length,
      successIds: succeeded,
      failures: failed,
    };
  }

  async deleteReport(user: AuthUser, reportId: string) {
    const context =
      user.role === 'admin'
        ? await this.access.requireAdmin(user)
        : await this.access.requireEmployee(user);
    const companyId = context.companyId;

    const report = await this.prisma.reports.findFirst({
      where: {
        id: reportId,
        company_id: companyId,
        ...(user.role === 'employee' ? { employee_id: context.id } : {}),
      },
      select: {
        id: true,
        status: true,
        source: true,
        employee_id: true,
        style_id: true,
        style_process_id: true,
        bundle_id: true,
        styles: { select: { name: true, style_no: true } },
        style_processes: { select: { name: true } },
        bundles: { select: { bundle_no: true, quantity: true } },
        employees: { select: { name: true, employee_no: true } },
      },
    });

    if (!report) {
      throw BusinessException.notFound('REPORT_NOT_FOUND', '报工记录不存在');
    }

    const settlementItem = await this.prisma.settlement_report_items.findFirst({
      where: { company_id: companyId, report_id: report.id },
      select: { settlement_id: true },
    });

    if (settlementItem) {
      throw BusinessException.conflict(
        'REPORT_ALREADY_SETTLED',
        '该报工已进入结算，不允许删除。如确需调整，请先修正结算记录。',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const terminated = await tx.report_disputes.updateMany({
        where: { company_id: companyId, report_id: report.id, status: 'pending' },
        data: {
          status: 'terminated',
          terminated_at: new Date(),
          termination_reason: '原报工已被删除，争议自动终止',
        },
      });

      await tx.reports.delete({ where: { id: report.id } });

      await this.operationLog.record(
        {
          companyId,
          operatorType: user.role === 'admin' ? 'admin' : 'employee',
          operatorId: context.id,
          actionType: 'report.delete',
          targetType: 'report',
          targetId: report.id,
          summary: `删除报工：${report.styles.name}（${report.styles.style_no}）· ${report.style_processes.name} · 捆号 ${report.bundles.bundle_no} · ${report.employees.name}`,
          detail: {
            status: report.status,
            source: report.source,
            bundleNo: report.bundles.bundle_no,
            quantity: report.bundles.quantity,
            terminatedDisputes: terminated.count,
          },
        },
        tx,
      );
    });

    return {
      message:
        '报工已删除。捆号和工序的历史报工标记不会重置，仍可作为历史依据。',
    };
  }

  private statusText(status: string): string {
    const map: Record<string, string> = {
      pending: '待审核',
      approved: '已通过',
      rejected: '已驳回',
    };
    return map[status] ?? status;
  }
}
