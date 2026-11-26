import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { chinaYearMonth } from '../common/utils/dates.js';
import { formatUnitPrice, toDecimal } from '../common/utils/money.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateStyleDto,
  ListStylesQueryDto,
  StyleProcessInputDto,
  UpdateStyleDto,
} from './dto/style.dto.js';

@Injectable()
export class StylesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  /** 原子分配款式编号 KYYYYMMNNN（按公司 + 年月递增，三位上限 999） */
  private async nextStyleNo(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<string> {
    const yearMonth = chinaYearMonth();
    const rows = await tx.$queryRaw<Array<{ last_number: number }>>(
      Prisma.sql`
        INSERT INTO style_number_counters (id, company_id, year_month, last_number)
        VALUES (${newId()}::uuid, ${companyId}::uuid, ${yearMonth}, 1)
        ON CONFLICT (company_id, year_month)
        DO UPDATE SET last_number = style_number_counters.last_number + 1
        RETURNING last_number
      `,
    );

    const value = rows[0]?.last_number;

    if (!value) {
      throw BusinessException.conflict(
        'STYLE_NUMBER_GENERATE_FAILED',
        '款式编号生成失败，请重试',
      );
    }

    if (value > 999) {
      throw BusinessException.conflict(
        'STYLE_NUMBER_EXHAUSTED',
        `本月款式编号已达到上限 999（${yearMonth}），无法继续创建款式。请联系系统管理员处理。`,
      );
    }

    return `K${yearMonth}${String(value).padStart(3, '0')}`;
  }

  private async resolveWorkshops(companyId: string, workshopIds: string[]) {
    if (workshopIds.length === 0) return [];

    const workshops = await this.prisma.workshops.findMany({
      where: { company_id: companyId, id: { in: workshopIds } },
      select: { id: true, name: true, status: true },
    });

    if (workshops.length !== workshopIds.length) {
      throw BusinessException.badRequest(
        'WORKSHOP_NOT_FOUND',
        '部分车间不存在或不属于当前公司',
      );
    }

    return workshops;
  }

  private normalizeProcesses(
    processes: StyleProcessInputDto[],
  ): Array<{ name: string; groupName: string | null; unitPrice: string; sortOrder: number }> {
    const seen = new Set<string>();

    return processes.map((process, index) => {
      const name = process.name.trim();
      if (seen.has(name)) {
        throw BusinessException.badRequest(
          'STYLE_PROCESS_NAME_EXISTS',
          `同一款式内工序名称不能重复：${name}`,
        );
      }
      seen.add(name);

      const unitPrice = process.unitPrice ?? '0';
      const decimal = toDecimal(unitPrice);
      if (decimal.isNegative()) {
        throw BusinessException.badRequest(
          'INVALID_UNIT_PRICE',
          `工序「${name}」的单价不能为负数`,
        );
      }

      return {
        name,
        groupName: process.groupName?.trim() || null,
        unitPrice: decimal.toFixed(3),
        sortOrder: process.sortOrder ?? index,
      };
    });
  }

  async createStyle(user: AuthUser, dto: CreateStyleDto) {
    const admin = await this.access.requireAdmin(user);
    const name = dto.name.trim();

    const exists = await this.prisma.styles.findFirst({
      where: { company_id: admin.companyId, name },
      select: { id: true },
    });

    if (exists) {
      throw BusinessException.conflict(
        'STYLE_NAME_EXISTS',
        '同一公司内款式名称不能重复',
      );
    }

    const productionScope = dto.productionScope ?? 'all';
    const workshopIds = dto.workshopIds ?? [];

    if (productionScope === 'workshops' && workshopIds.length === 0) {
      throw BusinessException.badRequest(
        'INVALID_WORKSHOP_SCOPE',
        '生产范围为指定车间时，必须至少选择一个车间',
      );
    }

    const workshops =
      productionScope === 'workshops'
        ? await this.resolveWorkshops(admin.companyId, workshopIds)
        : [];

    let processes: StyleProcessInputDto[] = dto.processes ?? [];

    if (dto.templateId) {
      const template = await this.prisma.process_templates.findFirst({
        where: { id: dto.templateId, company_id: admin.companyId },
        select: {
          id: true,
          name: true,
          process_template_items: {
            select: { name: true, group_name: true, sort_order: true },
            orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
          },
        },
      });

      if (!template) {
        throw BusinessException.notFound(
          'PROCESS_TEMPLATE_NOT_FOUND',
          '工序模板不存在',
        );
      }

      if (processes.length === 0) {
        processes = template.process_template_items.map((item) => ({
          name: item.name,
          groupName: item.group_name ?? undefined,
          sortOrder: item.sort_order,
          unitPrice: '0',
        }));
      }
    }

    const normalized = this.normalizeProcesses(processes);
    const styleId = newId();

    const created = await this.prisma.$transaction(async (tx) => {
      const styleNo = await this.nextStyleNo(tx, admin.companyId);

      await tx.styles.create({
        data: {
          id: styleId,
          company_id: admin.companyId,
          style_no: styleNo,
          name,
          remark: dto.remark?.trim() || null,
          production_scope: productionScope,
          status: 'production',
          created_by_admin_id: admin.id,
        },
      });

      if (normalized.length > 0) {
        await tx.style_processes.createMany({
          data: normalized.map((process) => ({
            id: newId(),
            company_id: admin.companyId,
            style_id: styleId,
            name: process.name,
            group_name: process.groupName,
            unit_price: new Prisma.Decimal(process.unitPrice),
            sort_order: process.sortOrder,
            has_reported: false,
          })),
        });
      }

      if (workshops.length > 0) {
        await tx.style_workshops.createMany({
          data: workshops.map((workshop) => ({
            id: newId(),
            company_id: admin.companyId,
            style_id: styleId,
            workshop_id: workshop.id,
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style.create',
          targetType: 'style',
          targetId: styleId,
          summary: `创建款式：${name}（${styleNo}）`,
          detail: {
            styleNo,
            productionScope,
            workshops: workshops.map((item) => item.name),
            processes: normalized.map((item) => ({
              name: item.name,
              unitPrice: item.unitPrice,
            })),
          },
        },
        tx,
      );

      return { id: styleId, styleNo };
    });

    return {
      ...created,
      name,
      productionScope,
      message: '款式创建成功',
    };
  }

  async listStyles(user: AuthUser, query: ListStylesQueryDto) {
    const admin = await this.access.requireAdmin(user);

    const where: Prisma.stylesWhereInput = {
      company_id: admin.companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { name: { contains: query.keyword, mode: 'insensitive' } },
              { style_no: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.workshopId
        ? { style_workshops: { some: { workshop_id: query.workshopId } } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.styles.findMany({
        where,
        select: {
          id: true,
          style_no: true,
          name: true,
          status: true,
          production_scope: true,
          created_at: true,
          completed_at: true,
          settled_at: true,
          _count: {
            select: {
              bundles: true,
              style_processes: true,
              style_workshops: true,
              settlements: true,
            },
          },
          style_processes: {
            select: { unit_price: true },
          },
        },
        orderBy: [{ created_at: 'desc' }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.styles.count({ where }),
    ]);

    const styleIds = rows.map((row) => row.id);
    const pendingCounts =
      styleIds.length > 0
        ? await this.prisma.reports.groupBy({
            by: ['style_id'],
            where: {
              company_id: admin.companyId,
              style_id: { in: styleIds },
              status: 'pending',
            },
            _count: { _all: true },
          })
        : [];

    const pendingMap = new Map(
      pendingCounts.map((row) => [row.style_id, row._count._all]),
    );

    return pageResult(
      rows.map((row) => ({
        id: row.id,
        styleNo: row.style_no,
        name: row.name,
        status: row.status,
        productionScope: row.production_scope,
        createdAt: row.created_at,
        completedAt: row.completed_at,
        settledAt: row.settled_at,
        bundleCount: row._count.bundles,
        processCount: row._count.style_processes,
        workshopCount: row._count.style_workshops,
        settlementCount: row._count.settlements,
        pendingReportCount: pendingMap.get(row.id) ?? 0,
        hasZeroPrice: row.style_processes.some((process) =>
          process.unit_price.equals(0),
        ),
      })),
      total,
      query,
    );
  }

  async getStyleDetail(user: AuthUser, styleId: string) {
    const admin = await this.access.requireAdmin(user);

    const style = await this.prisma.styles.findFirst({
      where: { id: styleId, company_id: admin.companyId },
      select: {
        id: true,
        style_no: true,
        name: true,
        status: true,
        production_scope: true,
        remark: true,
        created_at: true,
        completed_at: true,
        settled_at: true,
        archived_at: true,
        admins: { select: { name: true } },
        style_processes: {
          select: {
            id: true,
            name: true,
            group_name: true,
            unit_price: true,
            sort_order: true,
            has_reported: true,
          },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
        style_workshops: {
          select: { workshops: { select: { id: true, name: true } } },
        },
        _count: { select: { bundles: true, settlements: true } },
      },
    });

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    const [
      reportCounts,
      approvedEmployees,
      bundleQuantity,
    ] = await this.prisma.$transaction([
      this.prisma.reports.groupBy({
        by: ['status'],
        where: { company_id: admin.companyId, style_id: styleId },
        _count: { _all: true },
      }),
      this.prisma.reports.groupBy({
        by: ['employee_id'],
        where: {
          company_id: admin.companyId,
          style_id: styleId,
          status: 'approved',
        },
      }),
      this.prisma.bundles.aggregate({
        where: { company_id: admin.companyId, style_id: styleId },
        _sum: { quantity: true },
      }),
    ]);

    return {
      id: style.id,
      styleNo: style.style_no,
      name: style.name,
      status: style.status,
      productionScope: style.production_scope,
      remark: style.remark,
      createdAt: style.created_at,
      completedAt: style.completed_at,
      settledAt: style.settled_at,
      archivedAt: style.archived_at,
      createdBy: style.admins?.name ?? null,
      processes: style.style_processes.map((process) => ({
        id: process.id,
        name: process.name,
        groupName: process.group_name,
        unitPrice: formatUnitPrice(process.unit_price),
        sortOrder: process.sort_order,
        hasReported: process.has_reported,
      })),
      workshops: style.style_workshops.map((item) => item.workshops),
      stats: {
        bundleCount: style._count.bundles,
        bundleQuantity: bundleQuantity._sum.quantity ?? 0,
        settlementCount: style._count.settlements,
        employeeCount: approvedEmployees.length,
        reports: Object.fromEntries(
          reportCounts.map((row) => [row.status, row._count._all]),
        ),
      },
    };
  }

  async updateStyle(user: AuthUser, styleId: string, dto: UpdateStyleDto) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.prisma.styles.findFirst({
      where: { id: styleId, company_id: admin.companyId },
      select: {
        id: true,
        name: true,
        status: true,
        production_scope: true,
        remark: true,
      },
    });

    if (!style) {
      throw BusinessException.notFound('STYLE_NOT_FOUND', '款式不存在');
    }

    const changingScope =
      dto.productionScope !== undefined &&
      dto.productionScope !== style.production_scope;
    const changingWorkshops = dto.workshopIds !== undefined;

    if ((changingScope || changingWorkshops) && style.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        '款式已完成或已结算，不能调整生产范围',
      );
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.prisma.styles.findFirst({
        where: {
          company_id: admin.companyId,
          name,
          id: { not: style.id },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw BusinessException.conflict(
          'STYLE_NAME_EXISTS',
          '同一公司内款式名称不能重复',
        );
      }
    }

    const productionScope = dto.productionScope ?? style.production_scope;
    const workshopIds = dto.workshopIds;

    let workshops: Array<{ id: string; name: string }> = [];

    if (productionScope === 'workshops') {
      if (workshopIds !== undefined) {
        if (workshopIds.length === 0) {
          throw BusinessException.badRequest(
            'INVALID_WORKSHOP_SCOPE',
            '生产范围为指定车间时，必须至少选择一个车间',
          );
        }
        workshops = await this.resolveWorkshops(admin.companyId, workshopIds);
      } else {
        const existing = await this.prisma.style_workshops.count({
          where: { company_id: admin.companyId, style_id: style.id },
        });
        if (existing === 0) {
          throw BusinessException.badRequest(
            'INVALID_WORKSHOP_SCOPE',
            '生产范围为指定车间时，必须至少选择一个车间',
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.styles.update({
        where: { id: style.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.remark !== undefined
            ? { remark: dto.remark.trim() || null }
            : {}),
          ...(dto.productionScope !== undefined
            ? { production_scope: productionScope }
            : {}),
          updated_at: new Date(),
        },
      });

      if (workshopIds !== undefined || dto.productionScope !== undefined) {
        await tx.style_workshops.deleteMany({
          where: { company_id: admin.companyId, style_id: style.id },
        });

        if (productionScope === 'workshops' && workshops.length > 0) {
          await tx.style_workshops.createMany({
            data: workshops.map((workshop) => ({
              id: newId(),
              company_id: admin.companyId,
              style_id: style.id,
              workshop_id: workshop.id,
            })),
          });
        }
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style.update',
          targetType: 'style',
          targetId: style.id,
          summary: `修改款式：${style.name}`,
          detail: {
            before: {
              name: style.name,
              remark: style.remark,
              productionScope: style.production_scope,
            },
            after: {
              name: dto.name?.trim() ?? style.name,
              remark: dto.remark !== undefined ? dto.remark.trim() || null : style.remark,
              productionScope,
            },
            workshops: workshops.map((item) => item.name),
          },
        },
        tx,
      );
    });

    return { message: '款式已更新' };
  }

  async completeStyle(user: AuthUser, styleId: string) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(
      admin.companyId,
      styleId,
    );

    const pendingReports = await this.prisma.reports.count({
      where: {
        company_id: admin.companyId,
        style_id: style.id,
        status: 'pending',
      },
    });

    if (pendingReports > 0) {
      throw BusinessException.conflict(
        'PENDING_REPORTS_EXIST',
        `该款式还有 ${pendingReports} 条待审核报工，必须全部处理后才能标记完成`,
        { pendingReports },
      );
    }

    const disputeRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM report_disputes d
        JOIN reports r ON r.company_id = d.company_id AND r.id = d.report_id
        WHERE d.company_id = ${admin.companyId}::uuid
          AND d.status = 'pending'
          AND r.style_id = ${style.id}::uuid
      `,
    );

    const disputeCount = Number(disputeRows[0]?.count ?? 0);
    if (disputeCount > 0) {
      throw BusinessException.conflict(
        'PENDING_DISPUTES_EXIST',
        `该款式还有 ${disputeCount} 条待处理报工争议，必须全部处理后才能标记完成`,
        { pendingDisputes: disputeCount },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.styles.update({
        where: { id: style.id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style.complete',
          targetType: 'style',
          targetId: style.id,
          summary: `标记款式完成：${style.name}（${style.style_no}）`,
        },
        tx,
      );
    });

    return {
      message:
        '款式已标记完成。完成后不再允许新增报工和捆号，但仍可按规则修改工价。',
    };
  }

  async archiveStyle(user: AuthUser, styleId: string) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.getStyleOrThrow(admin.companyId, styleId);

    if (style.status !== 'settled') {
      throw BusinessException.conflict(
        'STYLE_NOT_SETTLED',
        '只有已结算的款式可以归档',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.styles.update({
        where: { id: style.id },
        data: {
          status: 'archived',
          archived_at: new Date(),
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style.archive',
          targetType: 'style',
          targetId: style.id,
          summary: `归档款式：${style.name}（${style.style_no}）`,
        },
        tx,
      );
    });

    return { message: '款式已归档' };
  }

  /**
   * 检查该款所有存在已通过报工的员工是否都已结算，满足条件时推进为“已结算”。
   * 由结算服务在创建结算后调用，必须在同一事务内执行。
   */
  async tryMarkStyleSettled(
    tx: Prisma.TransactionClient,
    companyId: string,
    styleId: string,
    operatorAdminId: string,
  ): Promise<boolean> {
    const style = await tx.styles.findFirst({
      where: { id: styleId, company_id: companyId },
      select: { id: true, name: true, style_no: true, status: true },
    });

    if (!style || style.status !== 'completed') return false;

    const employees = await tx.reports.groupBy({
      by: ['employee_id'],
      where: { company_id: companyId, style_id: styleId, status: 'approved' },
    });

    if (employees.length === 0) return false;

    const settledCount = await tx.settlements.count({
      where: {
        company_id: companyId,
        style_id: styleId,
        employee_id: { in: employees.map((row) => row.employee_id) },
      },
    });

    if (settledCount < employees.length) return false;

    await tx.styles.update({
      where: { id: styleId },
      data: {
        status: 'settled',
        settled_at: new Date(),
        updated_at: new Date(),
      },
    });

    await this.operationLog.record(
      {
        companyId,
        operatorType: 'admin',
        operatorId: operatorAdminId,
        actionType: 'style.settled',
        targetType: 'style',
        targetId: styleId,
        summary: `款式全部员工已结算，自动标记为已结算：${style.name}（${style.style_no}）`,
        detail: { employeeCount: employees.length },
      },
      tx,
    );

    return true;
  }

  /** 员工可报工的款式（生产范围包含其所属车间） */
  async listReportableStyles(user: AuthUser) {
    const employee = await this.access.requireEmployee(user);

    const workshopRows = await this.prisma.employee_workshops.findMany({
      where: { company_id: employee.companyId, employee_id: employee.id },
      select: { workshop_id: true },
    });
    const workshopIds = workshopRows.map((row) => row.workshop_id);

    const styles = await this.prisma.styles.findMany({
      where: {
        company_id: employee.companyId,
        status: 'production',
        OR: [
          { production_scope: 'all' },
          { style_workshops: { some: { workshop_id: { in: workshopIds } } } },
        ],
      },
      select: {
        id: true,
        style_no: true,
        name: true,
        created_at: true,
        _count: { select: { bundles: true, style_processes: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    return styles.map((style) => ({
      id: style.id,
      styleNo: style.style_no,
      name: style.name,
      createdAt: style.created_at,
      bundleCount: style._count.bundles,
      processCount: style._count.style_processes,
    }));
  }

  /** 员工报工选项：工序列表 + 指定工序下捆号是否已被报工 */
  async getReportOptions(user: AuthUser, styleId: string, styleProcessId?: string) {
    const employee = await this.access.requireEmployee(user);
    const style = await this.assertEmployeeStyleScope(
      employee.companyId,
      employee.id,
      styleId,
    );

    const processes = await this.prisma.style_processes.findMany({
      where: { company_id: employee.companyId, style_id: styleId },
      select: {
        id: true,
        name: true,
        group_name: true,
        unit_price: true,
        sort_order: true,
        has_reported: true,
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });

    if (!styleProcessId) {
      return {
        style: { id: style.id, name: style.name, styleNo: style.style_no },
        processes: processes.map((process) => ({
          id: process.id,
          name: process.name,
          groupName: process.group_name,
          unitPrice: formatUnitPrice(process.unit_price),
          hasReported: process.has_reported,
        })),
        bundles: [],
      };
    }

    const process = processes.find((item) => item.id === styleProcessId);
    if (!process) {
      throw BusinessException.notFound(
        'STYLE_PROCESS_NOT_FOUND',
        '该工序不属于当前款式',
      );
    }

    const [bundles, activeReports] = await this.prisma.$transaction([
      this.prisma.bundles.findMany({
        where: { company_id: employee.companyId, style_id: styleId },
        select: {
          id: true,
          bundle_no: true,
          size: true,
          quantity: true,
          remark: true,
          has_reported: true,
        },
        orderBy: { bundle_no: 'asc' },
      }),
      this.prisma.reports.findMany({
        where: {
          company_id: employee.companyId,
          style_id: styleId,
          style_process_id: styleProcessId,
          status: { in: ['pending', 'approved'] },
        },
        select: {
          id: true,
          bundle_id: true,
          employee_id: true,
          status: true,
          employees: { select: { name: true } },
        },
      }),
    ]);

    const activeMap = new Map(
      activeReports.map((report) => [report.bundle_id, report]),
    );

    return {
      style: { id: style.id, name: style.name, styleNo: style.style_no },
      process: {
        id: process.id,
        name: process.name,
        unitPrice: formatUnitPrice(process.unit_price),
      },
      bundles: bundles.map((bundle) => {
        const active = activeMap.get(bundle.id);
        return {
          id: bundle.id,
          bundleNo: bundle.bundle_no,
          size: bundle.size,
          quantity: bundle.quantity,
          remark: bundle.remark,
          reported: Boolean(active),
          reportedByMe: active?.employee_id === employee.id,
          reportedStatus: active?.status ?? null,
          activeReportId: active?.id ?? null,
          reportedByName: active
            ? active.employee_id === employee.id
              ? employee.name
              : active.employees.name
            : null,
        };
      }),
    };
  }

  /** 校验收货范围：员工所属车间必须被款式允许 */
  async assertEmployeeStyleScope(
    companyId: string,
    employeeId: string,
    styleId: string,
  ) {
    const style = await this.prisma.styles.findFirst({
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
        '该款式已不在生产中，不能继续报工',
      );
    }

    if (style.production_scope === 'workshops') {
      const workshopRows = await this.prisma.employee_workshops.findMany({
        where: { company_id: companyId, employee_id: employeeId },
        select: { workshop_id: true },
      });

      const allowed = new Set(
        style.style_workshops.map((item) => item.workshop_id),
      );
      const matched = workshopRows.some((row) => allowed.has(row.workshop_id));

      if (!matched) {
        throw BusinessException.forbidden(
          'INVALID_WORKSHOP_SCOPE',
          '你所属的车间不在该款式的生产范围内，无法报工。如需参与请联系管理员调整车间或款式生产范围。',
        );
      }
    }

    return style;
  }
}
