import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { dateRangeFilter } from '../common/utils/dates.js';
import {
  formatAmount,
  toDecimal,
} from '../common/utils/money.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PayrollService } from '../payroll/payroll.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StylesService } from '../styles/styles.service.js';
import {
  CreateSettlementDto,
  ListSettlementsQueryDto,
  UpdateSettlementDto,
} from './dto/settlement.dto.js';

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly payroll: PayrollService,
    private readonly styles: StylesService,
    private readonly operationLog: OperationLogService,
  ) {}

  private async loadManualDelta(
    client: Prisma.TransactionClient | PrismaService,
    companyId: string,
    settlementId: string,
  ): Promise<string> {
    const log = await client.operation_logs.findFirst({
      where: {
        company_id: companyId,
        action_type: 'settlement.adjust',
        target_type: 'settlement',
        target_id: settlementId,
      },
      select: { detail: true },
      orderBy: { created_at: 'desc' },
    });

    const detail = log?.detail as { delta?: string } | null;
    return detail?.delta ?? '0';
  }

  /** 创建结算：员工 + 款式，只统计已通过报工，金额由后端精确计算 */
  async createSettlement(user: AuthUser, dto: CreateSettlementDto) {
    const admin = await this.access.requireAdmin(user);

    const style = await this.prisma.styles.findFirst({
      where: { id: dto.styleId, company_id: admin.companyId },
      select: { id: true, name: true, style_no: true, status: true },
    });

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    if (style.status !== 'completed' && style.status !== 'settled') {
      throw BusinessException.conflict(
        'STYLE_NOT_COMPLETED',
        '款式尚未标记完成，不能进行结算。请先处理完待审核报工与争议并标记款式完成。',
      );
    }

    const employee = await this.access.getEmployeeOrThrow(
      admin.companyId,
      dto.employeeId,
    );

    const existing = await this.prisma.settlements.findFirst({
      where: {
        company_id: admin.companyId,
        style_id: style.id,
        employee_id: employee.id,
      },
      select: { id: true },
    });

    if (existing) {
      throw BusinessException.conflict(
        'SETTLEMENT_ALREADY_EXISTS',
        '该员工该款式已经结算，不能重复结算',
        { settlementId: existing.id },
      );
    }

    const detail = await this.payroll.computeDetail(
      admin.companyId,
      style.id,
      employee.id,
    );

    if (detail.reports.length === 0) {
      throw BusinessException.badRequest(
        'NO_APPROVED_REPORTS',
        '该员工在该款式下没有已审核通过的报工，无需结算',
      );
    }

    const settlementId = newId();
    const totalAmount = toDecimal(detail.totalAmount);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.settlements.create({
        data: {
          id: settlementId,
          company_id: admin.companyId,
          style_id: style.id,
          employee_id: employee.id,
          total_amount: totalAmount,
          payment_method: dto.paymentMethod,
          operator_admin_id: admin.id,
          remark: dto.remark?.trim() || null,
        },
      });

      if (detail.processes.length > 0) {
        await tx.settlement_process_items.createMany({
          data: detail.processes.map((process) => ({
            id: newId(),
            company_id: admin.companyId,
            settlement_id: settlementId,
            process_name: process.processName,
            group_name: process.groupName,
            quantity: process.quantity,
            unit_price: toDecimal(process.unitPrice),
            amount: toDecimal(process.amount),
          })),
        });
      }

      await tx.settlement_report_items.createMany({
        data: detail.reports.map((report) => ({
          id: newId(),
          company_id: admin.companyId,
          settlement_id: settlementId,
          report_id: report.reportId,
          process_name: report.processName,
          bundle_no: report.bundleNo,
          size: report.size,
          quantity: report.quantity,
          unit_price: toDecimal(report.unitPrice),
          amount: toDecimal(report.amount),
        })),
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'settlement.create',
          targetType: 'settlement',
          targetId: settlementId,
          summary: `创建结算：${employee.name}（${employee.employee_no}） · ${style.name}（${style.style_no}），金额 ¥${detail.totalAmount}`,
          detail: {
            employeeId: employee.id,
            styleId: style.id,
            totalAmount: detail.totalAmount,
            paymentMethod: dto.paymentMethod,
            reportCount: detail.reports.length,
            processCount: detail.processes.length,
          },
        },
        tx,
      );

      const settled = await this.styles.tryMarkStyleSettled(
        tx,
        admin.companyId,
        style.id,
        admin.id,
      );

      return { settled };
    });

    return {
      id: settlementId,
      totalAmount: detail.totalAmount,
      styleSettled: result.settled,
      notice:
        '结算表示已在线下完成工资发放，系统不执行实际付款。如后续修改工价，系统金额会同步更新，实际已发放金额请线下核对差额。',
    };
  }

  async listSettlements(user: AuthUser, query: ListSettlementsQueryDto) {
    const admin = await this.access.requireAdmin(user);
    const settledAtRange = dateRangeFilter(query.dateFrom, query.dateTo);

    const where: Prisma.settlementsWhereInput = {
      company_id: admin.companyId,
      ...(query.styleId ? { style_id: query.styleId } : {}),
      ...(query.employeeId ? { employee_id: query.employeeId } : {}),
      ...(query.paymentMethod ? { payment_method: query.paymentMethod } : {}),
      ...(query.keyword
        ? {
            OR: [
              { employees: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { styles: { name: { contains: query.keyword, mode: 'insensitive' } } },
              { styles: { style_no: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(settledAtRange ? { settled_at: settledAtRange } : {}),
    };

    const [rows, total, aggregate] = await this.prisma.$transaction([
      this.prisma.settlements.findMany({
        where,
        select: {
          id: true,
          total_amount: true,
          payment_method: true,
          settled_at: true,
          remark: true,
          employees: { select: { id: true, name: true, employee_no: true } },
          styles: { select: { id: true, name: true, style_no: true, status: true } },
          admins: { select: { name: true } },
          _count: { select: { settlement_report_items: true } },
        },
        orderBy: { settled_at: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.settlements.count({ where }),
      this.prisma.settlements.aggregate({
        where,
        _sum: { total_amount: true },
      }),
    ]);

    return {
      ...pageResult(
        rows.map((row) => ({
          id: row.id,
          totalAmount: row.total_amount.toFixed(2),
          paymentMethod: row.payment_method,
          settledAt: row.settled_at,
          remark: row.remark,
          employee: row.employees,
          style: row.styles,
          operator: row.admins?.name ?? null,
          reportCount: row._count.settlement_report_items,
        })),
        total,
        query,
      ),
      summary: {
        totalAmount: formatAmount(aggregate._sum.total_amount ?? 0),
      },
    };
  }

  /** 待结算员工：该款有已通过报工但尚未结算的员工 */
  async listPendingSettlements(user: AuthUser, styleId: string) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.getStyleOrThrow(admin.companyId, styleId);

    const rows = await this.payroll.getStyleEmployeeSummaries(
      admin.companyId,
      style.id,
    );
    const pending = rows.filter((row) => !row.settled);

    return {
      style: {
        id: style.id,
        name: style.name,
        styleNo: style.style_no,
        status: style.status,
      },
      items: pending,
      settledCount: rows.length - pending.length,
      totalCount: rows.length,
      canSettle: style.status === 'completed' || style.status === 'settled',
    };
  }

  async getSettlement(user: AuthUser, settlementId: string) {    const admin = await this.access.requireAdmin(user);

    const settlement = await this.prisma.settlements.findFirst({
      where: { id: settlementId, company_id: admin.companyId },
      select: {
        id: true,
        total_amount: true,
        payment_method: true,
        settled_at: true,
        remark: true,
        created_at: true,
        employees: { select: { id: true, name: true, employee_no: true, status: true } },
        styles: { select: { id: true, name: true, style_no: true, status: true } },
        admins: { select: { name: true } },
        settlement_process_items: {
          select: {
            id: true,
            process_name: true,
            group_name: true,
            quantity: true,
            unit_price: true,
            amount: true,
          },
          orderBy: { process_name: 'asc' },
        },
        settlement_report_items: {
          select: {
            id: true,
            report_id: true,
            process_name: true,
            bundle_no: true,
            size: true,
            quantity: true,
            unit_price: true,
            amount: true,
          },
          orderBy: [{ process_name: 'asc' }, { bundle_no: 'asc' }],
        },
      },
    });

    if (!settlement) {
      throw BusinessException.notFound('SETTLEMENT_NOT_FOUND', '结算记录不存在');
    }

    const [current, adjustments] = await Promise.all([
      this.payroll.computeDetail(
        admin.companyId,
        settlement.styles.id,
        settlement.employees.id,
      ),
      this.prisma.operation_logs.findMany({
        where: {
          company_id: admin.companyId,
          action_type: { in: ['settlement.adjust', 'settlement.recalculate'] },
          target_type: 'settlement',
          target_id: settlement.id,
        },
        select: {
          id: true,
          action_type: true,
          summary: true,
          detail: true,
          created_at: true,
          operator_id: true,
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    ]);

    return {
      id: settlement.id,
      totalAmount: settlement.total_amount.toFixed(2),
      paymentMethod: settlement.payment_method,
      settledAt: settlement.settled_at,
      remark: settlement.remark,
      createdAt: settlement.created_at,
      employee: settlement.employees,
      style: settlement.styles,
      operator: settlement.admins?.name ?? null,
      processItems: settlement.settlement_process_items.map((item) => ({
        id: item.id,
        processName: item.process_name,
        groupName: item.group_name,
        quantity: item.quantity,
        unitPrice: item.unit_price.toFixed(3),
        amount: item.amount.toFixed(3),
      })),
      reportItems: settlement.settlement_report_items.map((item) => ({
        id: item.id,
        reportId: item.report_id,
        processName: item.process_name,
        bundleNo: item.bundle_no,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.unit_price.toFixed(3),
        amount: item.amount.toFixed(3),
      })),
      currentAmount: current.totalAmount,
      difference: formatAmount(
        toDecimal(current.totalAmount).sub(
          toDecimal(settlement.total_amount),
        ),
      ),
      adjustments: adjustments.map((item) => ({
        id: item.id,
        actionType: item.action_type,
        summary: item.summary,
        detail: item.detail,
        createdAt: item.created_at,
      })),
    };
  }

  /** 修正结算记录：保留修改前后内容、操作者、时间与原因 */
  async updateSettlement(
    user: AuthUser,
    settlementId: string,
    dto: UpdateSettlementDto,
  ) {
    const admin = await this.access.requireAdmin(user);

    const settlement = await this.prisma.settlements.findFirst({
      where: { id: settlementId, company_id: admin.companyId },
      select: {
        id: true,
        total_amount: true,
        payment_method: true,
        remark: true,
        style_id: true,
        employee_id: true,
        employees: { select: { name: true, employee_no: true } },
        styles: { select: { name: true, style_no: true } },
      },
    });

    if (!settlement) {
      throw BusinessException.notFound('SETTLEMENT_NOT_FOUND', '结算记录不存在');
    }

    let autoAmount: string | null = null;
    let delta: string | null = null;

    if (dto.totalAmount !== undefined) {
      const detail = await this.payroll.computeDetail(
        admin.companyId,
        settlement.style_id,
        settlement.employee_id,
      );
      autoAmount = detail.totalAmount;
      delta = formatAmount(
        toDecimal(dto.totalAmount).sub(toDecimal(detail.totalAmount)),
      );
    }

    const before = {
      totalAmount: settlement.total_amount.toFixed(2),
      paymentMethod: settlement.payment_method,
      remark: settlement.remark,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.settlements.update({
        where: { id: settlement.id },
        data: {
          ...(dto.totalAmount !== undefined
            ? { total_amount: toDecimal(dto.totalAmount) }
            : {}),
          ...(dto.paymentMethod !== undefined
            ? { payment_method: dto.paymentMethod }
            : {}),
          ...(dto.remark !== undefined
            ? { remark: dto.remark.trim() || null }
            : {}),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'settlement.adjust',
          targetType: 'settlement',
          targetId: settlement.id,
          summary: `修正结算：${settlement.employees.name} · ${settlement.styles.name}，${before.totalAmount} → ${dto.totalAmount ?? before.totalAmount}（原因：${dto.reason}）`,
          detail: {
            reason: dto.reason,
            before,
            after: {
              totalAmount: dto.totalAmount ?? before.totalAmount,
              paymentMethod: dto.paymentMethod ?? before.paymentMethod,
              remark: dto.remark !== undefined ? dto.remark.trim() || null : before.remark,
            },
            autoAmount,
            delta,
          },
        },
        tx,
      );
    });

    return {
      message:
        '结算记录已修正。后续工价重算会保留本次人工调整差额，不会静默覆盖。',
      autoAmount,
      delta,
    };
  }

  /**
   * 工价修改后重算该款全部结算记录。
   * 自动金额按当前工价重新计算，并保留管理员人工调整差额。
   * 必须与工价修改处于同一事务，保证工价与结算金额一致。
   */
  async recalcStyleSettlements(
    tx: Prisma.TransactionClient,
    companyId: string,
    styleId: string,
    operatorAdminId: string,
  ) {
    const settlements = await tx.settlements.findMany({
      where: { company_id: companyId, style_id: styleId },
      select: {
        id: true,
        employee_id: true,
        total_amount: true,
        employees: { select: { name: true, employee_no: true } },
      },
    });

    if (settlements.length === 0) {
      return { settlementCount: 0, employees: [] as string[] };
    }

    const affected: string[] = [];

    for (const settlement of settlements) {
      const detail = await this.payroll.computeDetail(
        companyId,
        styleId,
        settlement.employee_id,
        tx,
      );

      const manualDelta = toDecimal(
        await this.loadManualDelta(tx, companyId, settlement.id),
      );

      let newTotal = toDecimal(detail.totalAmount).add(manualDelta);
      if (newTotal.isNegative()) newTotal = new Prisma.Decimal(0);
      const newTotalString = formatAmount(newTotal);

      await tx.settlements.update({
        where: { id: settlement.id },
        data: { total_amount: newTotal },
      });

      await tx.settlement_process_items.deleteMany({
        where: { company_id: companyId, settlement_id: settlement.id },
      });
      await tx.settlement_report_items.deleteMany({
        where: { company_id: companyId, settlement_id: settlement.id },
      });

      if (detail.processes.length > 0) {
        await tx.settlement_process_items.createMany({
          data: detail.processes.map((process) => ({
            id: newId(),
            company_id: companyId,
            settlement_id: settlement.id,
            process_name: process.processName,
            group_name: process.groupName,
            quantity: process.quantity,
            unit_price: toDecimal(process.unitPrice),
            amount: toDecimal(process.amount),
          })),
        });
      }

      if (detail.reports.length > 0) {
        await tx.settlement_report_items.createMany({
          data: detail.reports.map((report) => ({
            id: newId(),
            company_id: companyId,
            settlement_id: settlement.id,
            report_id: report.reportId,
            process_name: report.processName,
            bundle_no: report.bundleNo,
            size: report.size,
            quantity: report.quantity,
            unit_price: toDecimal(report.unitPrice),
            amount: toDecimal(report.amount),
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId,
          operatorType: 'admin',
          operatorId: operatorAdminId,
          actionType: 'settlement.recalculate',
          targetType: 'settlement',
          targetId: settlement.id,
          summary: `工价变更重算结算：${settlement.employees.name}，${settlement.total_amount.toFixed(2)} → ${newTotalString}`,
          detail: {
            before: settlement.total_amount.toFixed(2),
            after: newTotalString,
            autoAmount: detail.totalAmount,
            manualDelta: manualDelta.toFixed(3),
          },
        },
        tx,
      );

      affected.push(settlement.employees.name);
    }

    return { settlementCount: settlements.length, employees: affected };
  }
}
