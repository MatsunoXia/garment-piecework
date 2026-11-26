import { Injectable } from '@nestjs/common';

import { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { pageResult } from '../common/dto/pagination.dto.js';
import { BusinessException } from '../common/http/business.exception.js';
import { dateRangeFilter } from '../common/utils/dates.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListOperationLogsQueryDto } from './dto/operation-log.dto.js';

@Injectable()
export class OperationLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: AuthUser, query: ListOperationLogsQueryDto) {
    const admin = await this.access.requireAdmin(user);
    const range = dateRangeFilter(query.dateFrom, query.dateTo);

    const where: Prisma.operation_logsWhereInput = {
      company_id: admin.companyId,
      ...(query.actionType
        ? { action_type: { contains: query.actionType } }
        : {}),
      ...(query.targetType ? { target_type: query.targetType } : {}),
      ...(query.targetId ? { target_id: query.targetId } : {}),
      ...(query.operatorType ? { operator_type: query.operatorType } : {}),
      ...(query.operatorId ? { operator_id: query.operatorId } : {}),
      ...(range ? { created_at: range } : {}),
      ...(query.keyword
        ? { summary: { contains: query.keyword, mode: 'insensitive' } }
        : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.operation_logs.findMany({
        where,
        select: {
          id: true,
          operator_type: true,
          operator_id: true,
          action_type: true,
          target_type: true,
          target_id: true,
          summary: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.operation_logs.count({ where }),
    ]);

    return pageResult(rows, total, query);
  }

  async detail(user: AuthUser, logId: string) {
    const admin = await this.access.requireAdmin(user);

    const log = await this.prisma.operation_logs.findFirst({
      where: { id: logId, company_id: admin.companyId },
    });

    if (!log) {
      throw BusinessException.notFound('LOG_NOT_FOUND', '操作日志不存在');
    }

    return log;
  }
}
