import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateDisputeDto,
  ListDisputesQueryDto,
  ResolveDisputeDto,
} from './dto/dispute.dto.js';

const RESULT_TEXT: Record<string, string> = {
  confirm_original: '确认原员工',
  confirm_challenger: '转给质疑员工',
  reject_original_report: '驳回原报工',
};

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  private selectDispute() {
    return {
      id: true,
      status: true,
      result: true,
      reason: true,
      reject_reason: true,
      termination_reason: true,
      created_at: true,
      handled_at: true,
      terminated_at: true,
      report_id: true,
      employees_report_disputes_company_id_challenger_employee_idToemployees: {
        select: { id: true, name: true, employee_no: true },
      },
      employees_report_disputes_company_id_original_employee_idToemployees: {
        select: { id: true, name: true, employee_no: true },
      },
      admins: { select: { id: true, name: true } },
    } satisfies Prisma.report_disputesSelect;
  }

  private async loadReportForDispute(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    reportId: string,
  ) {
    return client.reports.findFirst({
      where: { id: reportId, company_id: companyId },
      select: {
        id: true,
        status: true,
        employee_id: true,
        style_id: true,
        style_process_id: true,
        bundle_id: true,
        employees: { select: { id: true, name: true, employee_no: true } },
        styles: { select: { id: true, name: true, style_no: true } },
        style_processes: { select: { id: true, name: true } },
        bundles: { select: { id: true, bundle_no: true, quantity: true } },
      },
    });
  }

  async createDispute(user: AuthUser, dto: CreateDisputeDto) {
    const employee = await this.access.requireEmployee(user);

    const report = await this.loadReportForDispute(
      this.prisma,
      employee.companyId,
      dto.reportId,
    );

    if (!report) {
      throw BusinessException.notFound('REPORT_NOT_FOUND', '报工记录不存在');
    }

    if (report.status === 'rejected') {
      throw BusinessException.conflict(
        'REPORT_REJECTED',
        '该报工已被驳回，不需要发起争议',
      );
    }

    if (report.employee_id === employee.id) {
      throw BusinessException.badRequest(
        'CANNOT_DISPUTE_OWN_REPORT',
        '不能对自己提交的报工发起争议',
      );
    }

    const pending = await this.prisma.report_disputes.findFirst({
      where: {
        company_id: employee.companyId,
        report_id: report.id,
        status: 'pending',
      },
      select: { id: true },
    });

    if (pending) {
      throw BusinessException.conflict(
        'DISPUTE_ALREADY_PENDING',
        '该报工已有待处理争议，请等待管理员处理',
      );
    }

    const disputeId = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.report_disputes.create({
        data: {
          id: disputeId,
          company_id: employee.companyId,
          report_id: report.id,
          original_employee_id: report.employee_id,
          challenger_employee_id: employee.id,
          reason: dto.reason?.trim() || null,
          status: 'pending',
        },
      });

      await this.operationLog.record(
        {
          companyId: employee.companyId,
          operatorType: 'employee',
          operatorId: employee.id,
          actionType: 'dispute.create',
          targetType: 'report_dispute',
          targetId: disputeId,
          summary: `${employee.name}（${employee.employeeNo}）对报工提出归属争议：${report.styles.name} · ${report.style_processes.name} · 捆号 ${report.bundles.bundle_no}`,
          detail: {
            reportId: report.id,
            originalEmployeeId: report.employee_id,
            challengerEmployeeId: employee.id,
            reason: dto.reason ?? null,
          },
        },
        tx,
      );
    });

    return {
      id: disputeId,
      message: '争议已提交，请等待管理员处理',
    };
  }

  async listMyDisputes(user: AuthUser, query: ListDisputesQueryDto) {
    const employee = await this.access.requireEmployee(user);

    const where: Prisma.report_disputesWhereInput = {
      company_id: employee.companyId,
      OR: [
        { challenger_employee_id: employee.id },
        { original_employee_id: employee.id },
      ],
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.report_disputes.findMany({
        where,
        select: this.selectDispute(),
        orderBy: { created_at: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.report_disputes.count({ where }),
    ]);

    const reportIds = rows.map((row) => row.report_id);
    const reports =
      reportIds.length > 0
        ? await this.prisma.reports.findMany({
            where: { company_id: employee.companyId, id: { in: reportIds } },
            select: {
              id: true,
              status: true,
              styles: { select: { name: true, style_no: true } },
              style_processes: { select: { name: true } },
              bundles: { select: { bundle_no: true, quantity: true } },
            },
          })
        : [];
    const reportMap = new Map(reports.map((item) => [item.id, item]));

    return pageResult(
      rows.map((row) => this.mapDispute(row, reportMap.get(row.report_id))),
      total,
      query,
    );
  }

  async listDisputes(user: AuthUser, query: ListDisputesQueryDto) {
    const admin = await this.access.requireAdmin(user);

    const where: Prisma.report_disputesWhereInput = {
      company_id: admin.companyId,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.styleId) {
      const reports = await this.prisma.reports.findMany({
        where: { company_id: admin.companyId, style_id: query.styleId },
        select: { id: true },
      });
      where.report_id = { in: reports.map((item) => item.id) };
    }

    const [rows, total, pendingCount] = await this.prisma.$transaction([
      this.prisma.report_disputes.findMany({
        where,
        select: this.selectDispute(),
        orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.report_disputes.count({ where }),
      this.prisma.report_disputes.count({
        where: { company_id: admin.companyId, status: 'pending' },
      }),
    ]);

    const reportIds = rows.map((row) => row.report_id);
    const reports =
      reportIds.length > 0
        ? await this.prisma.reports.findMany({
            where: { company_id: admin.companyId, id: { in: reportIds } },
            select: {
              id: true,
              status: true,
              styles: { select: { id: true, name: true, style_no: true } },
              style_processes: { select: { id: true, name: true } },
              bundles: { select: { id: true, bundle_no: true, quantity: true } },
            },
          })
        : [];
    const reportMap = new Map(reports.map((item) => [item.id, item]));

    return {
      ...pageResult(
        rows.map((row) => this.mapDispute(row, reportMap.get(row.report_id))),
        total,
        query,
      ),
      pendingCount,
    };
  }

  async listPendingDisputes(user: AuthUser, query: ListDisputesQueryDto) {
    return this.listDisputes(
      user,
      Object.assign(new ListDisputesQueryDto(), query, {
        status: 'pending' as const,
      }),
    );
  }

  private mapDispute(
    row: {
      id: string;
      status: string;
      result: string | null;
      reason: string | null;
      reject_reason: string | null;
      termination_reason: string | null;
      created_at: Date;
      handled_at: Date | null;
      terminated_at: Date | null;
      report_id: string;
      employees_report_disputes_company_id_challenger_employee_idToemployees: {
        id: string;
        name: string;
        employee_no: string;
      };
      employees_report_disputes_company_id_original_employee_idToemployees: {
        id: string;
        name: string;
        employee_no: string;
      };
      admins: { id: string; name: string } | null;
    },
    report:
      | {
          id: string;
          status: string;
          styles: { id?: string; name: string; style_no: string };
          style_processes: { id?: string; name: string };
          bundles: { id?: string; bundle_no: number; quantity: number };
        }
      | undefined,
  ) {
    return {
      id: row.id,
      status: row.status,
      result: row.result,
      resultText: row.result ? RESULT_TEXT[row.result] : null,
      reason: row.reason,
      rejectReason: row.reject_reason,
      terminationReason: row.termination_reason,
      createdAt: row.created_at,
      handledAt: row.handled_at,
      terminatedAt: row.terminated_at,
      handler: row.admins,
      challenger:
        row.employees_report_disputes_company_id_challenger_employee_idToemployees,
      originalEmployee:
        row.employees_report_disputes_company_id_original_employee_idToemployees,
      report: report
        ? {
            id: report.id,
            status: report.status,
            style: report.styles,
            process: report.style_processes,
            bundle: report.bundles,
          }
        : null,
    };
  }

  async getDispute(user: AuthUser, disputeId: string) {
    const context =
      user.role === 'admin'
        ? await this.access.requireAdmin(user)
        : await this.access.requireEmployee(user);

    const dispute = await this.prisma.report_disputes.findFirst({
      where: {
        id: disputeId,
        company_id: context.companyId,
        ...(user.role === 'employee'
          ? {
              OR: [
                { challenger_employee_id: context.id },
                { original_employee_id: context.id },
              ],
            }
          : {}),
      },
      select: this.selectDispute(),
    });

    if (!dispute) {
      throw BusinessException.notFound('DISPUTE_NOT_FOUND', '争议记录不存在');
    }

    const report = await this.prisma.reports.findFirst({
      where: { id: dispute.report_id, company_id: context.companyId },
      select: {
        id: true,
        status: true,
        reported_at: true,
        reject_reason: true,
        styles: { select: { id: true, name: true, style_no: true } },
        style_processes: { select: { id: true, name: true } },
        bundles: { select: { id: true, bundle_no: true, quantity: true, size: true } },
        employees: { select: { id: true, name: true, employee_no: true } },
      },
    });

    return {
      ...this.mapDispute(dispute, report ?? undefined),
      reportDetail: report
        ? {
            ...report,
            style: report.styles,
            process: report.style_processes,
            bundle: report.bundles,
            employee: report.employees,
          }
        : null,
    };
  }

  /**
   * 处理争议：只允许三种结果。
   * confirm_original 原报工继续有效；
   * confirm_challenger 报工归属转给质疑员工；
   * reject_original_report 驳回原报工，实际完成人可重新报工。
   */
  async resolveDispute(
    user: AuthUser,
    disputeId: string,
    dto: ResolveDisputeDto,
  ) {
    const admin = await this.access.requireAdmin(user);

    const dispute = await this.prisma.report_disputes.findFirst({
      where: { id: disputeId, company_id: admin.companyId },
      select: {
        id: true,
        status: true,
        report_id: true,
        original_employee_id: true,
        challenger_employee_id: true,
        employees_report_disputes_company_id_challenger_employee_idToemployees: {
          select: { name: true, employee_no: true },
        },
        employees_report_disputes_company_id_original_employee_idToemployees: {
          select: { name: true, employee_no: true },
        },
      },
    });

    if (!dispute) {
      throw BusinessException.notFound('DISPUTE_NOT_FOUND', '争议记录不存在');
    }

    if (dispute.status !== 'pending') {
      throw BusinessException.conflict(
        'DISPUTE_ALREADY_RESOLVED',
        '该争议已经处理或已终止，不能重复处理',
      );
    }

    const report = await this.loadReportForDispute(
      this.prisma,
      admin.companyId,
      dispute.report_id,
    );

    if (!report) {
      throw BusinessException.conflict(
        'REPORT_NOT_FOUND',
        '原报工已不存在，请终止该争议',
      );
    }

    const settlementItem = await this.prisma.settlement_report_items.findFirst({
      where: { company_id: admin.companyId, report_id: report.id },
      select: { settlement_id: true },
    });

    if (settlementItem && dto.result !== 'confirm_original') {
      throw BusinessException.conflict(
        'REPORT_ALREADY_SETTLED',
        '该报工已进入结算，不能调整归属或驳回。请先修正相关结算记录。',
      );
    }

    if (dto.result === 'reject_original_report' && !dto.reason) {
      throw BusinessException.badRequest(
        'REJECT_REASON_REQUIRED',
        '驳回原报工必须填写原因',
      );
    }

    if (dto.result === 'confirm_challenger') {
      if (report.status === 'rejected') {
        throw BusinessException.conflict(
          'REPORT_REJECTED',
          '原报工已被驳回，无需转移归属。请让实际完成人重新报工。',
        );
      }

      const duplicate = await this.prisma.reports.findFirst({
        where: {
          company_id: admin.companyId,
          bundle_id: report.bundle_id,
          style_process_id: report.style_process_id,
          status: { in: ['pending', 'approved'] },
          id: { not: report.id },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw BusinessException.conflict(
          'REPORT_ALREADY_EXISTS',
          '该捆号该工序已存在其他有效报工，无法转移归属',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      if (dto.result === 'confirm_challenger') {
        await tx.reports.update({
          where: { id: report.id },
          data: {
            employee_id: dispute.challenger_employee_id,
            updated_at: new Date(),
          },
        });
      }

      if (dto.result === 'reject_original_report') {
        await tx.reports.update({
          where: { id: report.id },
          data: {
            status: 'rejected',
            reviewed_by_admin_id: admin.id,
            reviewed_at: new Date(),
            reject_reason: dto.reason?.trim() ?? '争议处理驳回',
            updated_at: new Date(),
          },
        });
      }

      await tx.report_disputes.update({
        where: { id: dispute.id },
        data: {
          status: 'resolved',
          result: dto.result,
          handler_admin_id: admin.id,
          handled_at: new Date(),
          reject_reason:
            dto.result === 'reject_original_report'
              ? (dto.reason?.trim() ?? '争议处理驳回')
              : null,
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'dispute.resolve',
          targetType: 'report_dispute',
          targetId: dispute.id,
          summary: `处理争议（${RESULT_TEXT[dto.result]}）：${report.styles.name} · ${report.style_processes.name} · 捆号 ${report.bundles.bundle_no}，原员工 ${dispute.employees_report_disputes_company_id_original_employee_idToemployees.name}，质疑员工 ${dispute.employees_report_disputes_company_id_challenger_employee_idToemployees.name}`,
          detail: {
            result: dto.result,
            reason: dto.reason ?? null,
            reportId: report.id,
            originalEmployeeId: dispute.original_employee_id,
            challengerEmployeeId: dispute.challenger_employee_id,
          },
        },
        tx,
      );
    });

    return {
      result: dto.result,
      resultText: RESULT_TEXT[dto.result],
      message:
        dto.result === 'confirm_challenger'
          ? '已将该报工归属转给质疑员工'
          : dto.result === 'reject_original_report'
            ? '已驳回原报工，实际完成人可以重新报工'
            : '已确认原员工，原报工继续有效',
    };
  }
}
