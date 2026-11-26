import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { BusinessException } from '../common/http/business.exception.js';
import { OperationLogService } from '../common/logging/operation-log.service.js';
import { newId } from '../common/utils/token.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class WorkshopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly operationLog: OperationLogService,
  ) {}

  async list(user: AuthUser, includeDisabled = false) {
    const admin = await this.access.requireAdmin(user);

    const rows = await this.prisma.workshops.findMany({
      where: {
        company_id: admin.companyId,
        ...(includeDisabled ? {} : { status: 'active' }),
      },
      select: {
        id: true,
        name: true,
        status: true,
        created_at: true,
        _count: {
          select: { employee_workshops: true, style_workshops: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      createdAt: row.created_at,
      employeeCount: row._count.employee_workshops,
      styleCount: row._count.style_workshops,
    }));
  }

  async create(user: AuthUser, name: string) {
    const admin = await this.access.requireAdmin(user);
    const trimmed = name.trim();

    const exists = await this.prisma.workshops.findFirst({
      where: { company_id: admin.companyId, name: trimmed },
      select: { id: true },
    });

    if (exists) {
      throw BusinessException.conflict(
        'WORKSHOP_NAME_EXISTS',
        '同一公司内车间名称不能重复',
      );
    }

    const id = newId();

    await this.prisma.$transaction(async (tx) => {
      await tx.workshops.create({
        data: { id, company_id: admin.companyId, name: trimmed },
      });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'workshop.create',
          targetType: 'workshop',
          targetId: id,
          summary: `创建车间：${trimmed}`,
        },
        tx,
      );
    });

    return { id, name: trimmed, status: 'active' };
  }

  async update(
    user: AuthUser,
    workshopId: string,
    input: { name?: string; status?: 'active' | 'disabled' },
  ) {
    const admin = await this.access.requireAdmin(user);
    const workshop = await this.access.getWorkshopOrThrow(
      admin.companyId,
      workshopId,
    );

    const data: { name?: string; status?: string; updated_at: Date } = {
      updated_at: new Date(),
    };

    if (input.name !== undefined) {
      const trimmed = input.name.trim();
      const exists = await this.prisma.workshops.findFirst({
        where: {
          company_id: admin.companyId,
          name: trimmed,
          id: { not: workshop.id },
        },
        select: { id: true },
      });

      if (exists) {
        throw BusinessException.conflict(
          'WORKSHOP_NAME_EXISTS',
          '同一公司内车间名称不能重复',
        );
      }

      data.name = trimmed;
    }

    if (input.status !== undefined) {
      data.status = input.status;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workshops.update({ where: { id: workshop.id }, data });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'workshop.update',
          targetType: 'workshop',
          targetId: workshop.id,
          summary: `修改车间：${workshop.name}`,
          detail: {
            before: { name: workshop.name, status: workshop.status },
            after: data,
          },
        },
        tx,
      );
    });

    return { message: '车间已更新' };
  }

  async remove(user: AuthUser, workshopId: string) {
    const admin = await this.access.requireAdmin(user);
    const workshop = await this.access.getWorkshopOrThrow(
      admin.companyId,
      workshopId,
    );

    const styleCount = await this.prisma.style_workshops.count({
      where: { company_id: admin.companyId, workshop_id: workshop.id },
    });

    if (styleCount > 0) {
      throw BusinessException.conflict(
        'WORKSHOP_IN_USE',
        `该车间仍被 ${styleCount} 个款式引用为生产范围，请先在款式设置中调整生产范围后再删除`,
        { styleCount },
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.employee_workshops.deleteMany({
        where: { company_id: admin.companyId, workshop_id: workshop.id },
      });
      await tx.style_workshops.deleteMany({
        where: { company_id: admin.companyId, workshop_id: workshop.id },
      });
      await tx.workshops.delete({ where: { id: workshop.id } });

      await this.operationLog.record(
        {
          companyId: admin.companyId,
          operatorType: 'admin',
          operatorId: admin.id,
          actionType: 'workshop.delete',
          targetType: 'workshop',
          targetId: workshop.id,
          summary: `删除车间：${workshop.name}`,
          detail: { workshopName: workshop.name },
        },
        tx,
      );
    });

    return {
      message: '车间已删除。历史报工、工资和结算记录不受影响。',
    };
  }
}
