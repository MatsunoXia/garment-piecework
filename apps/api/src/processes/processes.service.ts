import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { formatUnitPrice, toDecimal } from '../common/utils/money.js';
import { newId } from '../common/utils/token.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SettlementsService } from '../settlements/settlements.service.js';
import {
  ChangePriceDto,
  CreateProcessTemplateDto,
  CreateStyleProcessDto,
  TemplateItemDto,
  UpdateProcessTemplateDto,
  UpdateStyleProcessDto,
} from './dto/process.dto.js';

const PRICE_CHANGE_WARNING =
  '该款已有员工完成结算，本次修改将同步更新相关员工的工资统计及结算金额。实际已发放的工资不会自动调整，请核对并在线下处理差额。';

@Injectable()
export class ProcessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly settlements: SettlementsService,
    private readonly operationLog: OperationLogService,
  ) {}

  async listStyleProcesses(user: AuthUser, styleId: string) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.getStyleOrThrow(admin.companyId, styleId);

    const processes = await this.prisma.style_processes.findMany({
      where: { company_id: admin.companyId, style_id: style.id },
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

    return {
      style,
      items: processes.map((process) => ({
        id: process.id,
        name: process.name,
        groupName: process.group_name,
        unitPrice: formatUnitPrice(process.unit_price),
        sortOrder: process.sort_order,
        hasReported: process.has_reported,
        isZeroPrice: process.unit_price.equals(0),
      })),
    };
  }

  async createStyleProcess(
    user: AuthUser,
    styleId: string,
    dto: CreateStyleProcessDto,
  ) {
    const admin = await this.access.requireAdmin(user);
    const style = await this.access.assertStyleProduction(
      admin.companyId,
      styleId,
    );
    const name = dto.name.trim();

    const duplicate = await this.prisma.style_processes.findFirst({
      where: {
        company_id: admin.companyId,
        style_id: style.id,
        name,
      },
      select: { id: true },
    });

    if (duplicate) {
      throw BusinessException.conflict(
        'STYLE_PROCESS_NAME_EXISTS',
        '同一款式内工序名称不能重复',
      );
    }

    const unitPrice = toDecimal(dto.unitPrice ?? '0');
    if (unitPrice.isNegative()) {
      throw BusinessException.badRequest(
        'INVALID_UNIT_PRICE',
        '工序单价不能为负数',
      );
    }

    const maxSort = await this.prisma.style_processes.aggregate({
      where: { company_id: admin.companyId, style_id: style.id },
      _max: { sort_order: true },
    });

    const id = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.style_processes.create({
        data: {
          id,
          company_id: admin.companyId,
          style_id: style.id,
          name,
          group_name: dto.groupName?.trim() || null,
          unit_price: unitPrice,
          sort_order: dto.sortOrder ?? (maxSort._max.sort_order ?? 0) + 1,
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style_process.create',
          targetType: 'style_process',
          targetId: id,
          summary: `款式 ${style.name} 新增工序：${name}，单价 ${unitPrice.toFixed(3)}`,
          detail: { styleId: style.id, name, unitPrice: unitPrice.toFixed(3) },
        },
        tx,
      );
    });

    return {
      id,
      name,
      unitPrice: unitPrice.toFixed(3),
      isZeroPrice: unitPrice.equals(0),
      warning: unitPrice.equals(0) ? '工序单价为 0，请确认是否漏填' : undefined,
    };
  }

  async updateStyleProcess(
    user: AuthUser,
    processId: string,
    dto: UpdateStyleProcessDto,
  ) {
    const admin = await this.access.requireAdmin(user);

    const process = await this.prisma.style_processes.findFirst({
      where: { id: processId, company_id: admin.companyId },
      select: {
        id: true,
        name: true,
        group_name: true,
        sort_order: true,
        unit_price: true,
        style_id: true,
        styles: { select: { name: true, status: true } },
      },
    });

    if (!process) {
      throw BusinessException.notFound(
        'STYLE_PROCESS_NOT_FOUND',
        '工序不存在',
      );
    }

    if (dto.name !== undefined && process.styles.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        '款式已完成或已结算，不能修改工序名称等生产配置（工价仍可修改）',
      );
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      const duplicate = await this.prisma.style_processes.findFirst({
        where: {
          company_id: admin.companyId,
          style_id: process.style_id,
          name,
          id: { not: process.id },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw BusinessException.conflict(
          'STYLE_PROCESS_NAME_EXISTS',
          '同一款式内工序名称不能重复',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.style_processes.update({
        where: { id: process.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.groupName !== undefined
            ? { group_name: dto.groupName.trim() || null }
            : {}),
          ...(dto.sortOrder !== undefined ? { sort_order: dto.sortOrder } : {}),
          updated_at: new Date(),
        },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style_process.update',
          targetType: 'style_process',
          targetId: process.id,
          summary: `修改工序：${process.styles.name} · ${process.name}`,
          detail: {
            before: {
              name: process.name,
              groupName: process.group_name,
              sortOrder: process.sort_order,
            },
            after: {
              name: dto.name !== undefined ? dto.name.trim() : null,
              groupName:
                dto.groupName !== undefined
                  ? dto.groupName.trim() || null
                  : null,
              sortOrder: dto.sortOrder ?? null,
            },
          },
        },
        tx,
      );
    });

    return { message: '工序已更新' };
  }

  /**
   * 修改工价：同一个款式同一个工序始终只有一套当前有效工价。
   * 工价修改后同步重算该款全部员工工资统计与已结算金额（保留人工调整）。
   */
  async changePrice(
    user: AuthUser,
    processId: string,
    dto: ChangePriceDto,
  ) {
    const admin = await this.access.requireAdmin(user);

    const process = await this.prisma.style_processes.findFirst({
      where: { id: processId, company_id: admin.companyId },
      select: {
        id: true,
        name: true,
        unit_price: true,
        style_id: true,
        styles: { select: { id: true, name: true, style_no: true, status: true } },
      },
    });

    if (!process) {
      throw BusinessException.notFound(
        'STYLE_PROCESS_NOT_FOUND',
        '工序不存在',
      );
    }

    const nextPrice = toDecimal(dto.unitPrice);
    if (nextPrice.isNegative()) {
      throw BusinessException.badRequest(
        'INVALID_UNIT_PRICE',
        '工价不能为负数',
      );
    }

    if (nextPrice.equals(process.unit_price)) {
      return { message: '工价未发生变化', unitPrice: formatUnitPrice(nextPrice) };
    }

    const settlementCount = await this.prisma.settlements.count({
      where: {
        company_id: admin.companyId,
        style_id: process.style_id,
      },
    });

    const before = formatUnitPrice(process.unit_price);

    const recalc = await this.prisma.$transaction(async (tx) => {
      await tx.style_processes.update({
        where: { id: process.id },
        data: { unit_price: nextPrice, updated_at: new Date() },
      });

      const result = await this.settlements.recalcStyleSettlements(
        tx,
        admin.companyId,
        process.style_id,
        admin.id,
      );

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style_process.change_price',
          targetType: 'style_process',
          targetId: process.id,
          summary: `修改工价：${process.styles.name}（${process.styles.style_no}）· ${process.name}，${before} → ${formatUnitPrice(nextPrice)}`,
          detail: {
            before,
            after: formatUnitPrice(nextPrice),
            reason: dto.reason ?? null,
            settlementCount: result.settlementCount,
            affectedEmployees: result.employees,
            styleStatus: process.styles.status,
          },
        },
        tx,
      );

      return result;
    });

    return {
      unitPrice: formatUnitPrice(nextPrice),
      before,
      affectedSettlements: recalc.settlementCount,
      affectedEmployees: recalc.employees,
      warning: settlementCount > 0 ? PRICE_CHANGE_WARNING : undefined,
      message:
        settlementCount > 0
          ? '工价已更新，已同步重算该款全部员工工资统计与结算金额'
          : '工价已更新，该款全部员工工资统计将按最新工价计算',
    };
  }

  async deleteStyleProcess(user: AuthUser, processId: string) {
    const admin = await this.access.requireAdmin(user);

    const process = await this.prisma.style_processes.findFirst({
      where: { id: processId, company_id: admin.companyId },
      select: {
        id: true,
        name: true,
        has_reported: true,
        style_id: true,
        styles: { select: { name: true, status: true } },
      },
    });

    if (!process) {
      throw BusinessException.notFound('STYLE_PROCESS_NOT_FOUND', '工序不存在');
    }

    if (process.styles.status !== 'production') {
      throw BusinessException.conflict(
        'STYLE_NOT_PRODUCTION',
        '款式已完成或已结算，不能删除工序',
      );
    }

    if (process.has_reported) {
      throw BusinessException.conflict(
        'DELETE_FORBIDDEN',
        '该工序已经产生报工历史，永久禁止删除',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.style_processes.delete({ where: { id: process.id } });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'style_process.delete',
          targetType: 'style_process',
          targetId: process.id,
          summary: `删除工序：${process.styles.name} · ${process.name}`,
        },
        tx,
      );
    });

    return { message: '工序已删除' };
  }

  async listTemplates(user: AuthUser) {
    const admin = await this.access.requireAdmin(user);

    const rows = await this.prisma.process_templates.findMany({
      where: { company_id: admin.companyId },
      select: {
        id: true,
        name: true,
        remark: true,
        created_at: true,
        process_template_items: {
          select: {
            id: true,
            name: true,
            group_name: true,
            sort_order: true,
          },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      remark: row.remark,
      createdAt: row.created_at,
      items: row.process_template_items.map((item) => ({
        id: item.id,
        name: item.name,
        groupName: item.group_name,
        sortOrder: item.sort_order,
      })),
    }));
  }

  private normalizeTemplateItems(items: TemplateItemDto[]) {
    const seen = new Set<string>();

    return items.map((item, index) => {
      const name = item.name.trim();
      if (seen.has(name)) {
        throw BusinessException.badRequest(
          'TEMPLATE_ITEM_DUPLICATED',
          `模板内工序名称不能重复：${name}`,
        );
      }
      seen.add(name);

      return {
        name,
        groupName: item.groupName?.trim() || null,
        sortOrder: item.sortOrder ?? index,
      };
    });
  }

  async createTemplate(user: AuthUser, dto: CreateProcessTemplateDto) {
    const admin = await this.access.requireAdmin(user);
    const name = dto.name.trim();
    const items = this.normalizeTemplateItems(dto.items);

    const duplicate = await this.prisma.process_templates.findFirst({
      where: { company_id: admin.companyId, name },
      select: { id: true },
    });

    if (duplicate) {
      throw BusinessException.conflict(
        'TEMPLATE_NAME_EXISTS',
        '同一公司内工序模板名称不能重复',
      );
    }

    const templateId = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.process_templates.create({
        data: {
          id: templateId,
          company_id: admin.companyId,
          name,
          remark: dto.remark?.trim() || null,
        },
      });

      if (items.length > 0) {
        await tx.process_template_items.createMany({
          data: items.map((item) => ({
            id: newId(),
            company_id: admin.companyId,
            template_id: templateId,
            name: item.name,
            group_name: item.groupName,
            sort_order: item.sortOrder,
          })),
        });
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'process_template.create',
          targetType: 'process_template',
          targetId: templateId,
          summary: `创建工序模板：${name}（${items.length} 道工序）`,
          detail: { items: items.map((item) => item.name) },
        },
        tx,
      );
    });

    return { id: templateId, name, itemCount: items.length };
  }

  async updateTemplate(
    user: AuthUser,
    templateId: string,
    dto: UpdateProcessTemplateDto,
  ) {
    const admin = await this.access.requireAdmin(user);

    const template = await this.prisma.process_templates.findFirst({
      where: { id: templateId, company_id: admin.companyId },
      select: { id: true, name: true, remark: true },
    });

    if (!template) {
      throw BusinessException.notFound(
        'PROCESS_TEMPLATE_NOT_FOUND',
        '工序模板不存在',
      );
    }

    const items =
      dto.items !== undefined ? this.normalizeTemplateItems(dto.items) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.process_templates.update({
        where: { id: template.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.remark !== undefined
            ? { remark: dto.remark.trim() || null }
            : {}),
          updated_at: new Date(),
        },
      });

      if (items) {
        await tx.process_template_items.deleteMany({
          where: { company_id: admin.companyId, template_id: template.id },
        });

        if (items.length > 0) {
          await tx.process_template_items.createMany({
            data: items.map((item) => ({
              id: newId(),
              company_id: admin.companyId,
              template_id: template.id,
              name: item.name,
              group_name: item.groupName,
              sort_order: item.sortOrder,
            })),
          });
        }
      }

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'process_template.update',
          targetType: 'process_template',
          targetId: template.id,
          summary: `修改工序模板：${template.name}`,
          detail: items ? { items: items.map((item) => item.name) } : undefined,
        },
        tx,
      );
    });

    return { message: '工序模板已更新' };
  }

  async deleteTemplate(user: AuthUser, templateId: string) {
    const admin = await this.access.requireAdmin(user);

    const template = await this.prisma.process_templates.findFirst({
      where: { id: templateId, company_id: admin.companyId },
      select: { id: true, name: true },
    });

    if (!template) {
      throw BusinessException.notFound(
        'PROCESS_TEMPLATE_NOT_FOUND',
        '工序模板不存在',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.process_template_items.deleteMany({
        where: { company_id: admin.companyId, template_id: template.id },
      });
      await tx.process_templates.delete({ where: { id: template.id } });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'process_template.delete',
          targetType: 'process_template',
          targetId: template.id,
          summary: `删除工序模板：${template.name}`,
        },
        tx,
      );
    });

    return { message: '工序模板已删除' };
  }
}
