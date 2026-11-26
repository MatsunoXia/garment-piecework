import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { newId } from '../utils/token.js';

export type OperatorType = 'admin' | 'employee' | 'system';

export interface OperationLogInput {
  companyId: string;
  operatorType: OperatorType;
  operatorId?: string | null;
  actionType: string;
  targetType: string;
  targetId?: string | null;
  summary: string;
  detail?: Prisma.InputJsonValue;
}

/**
 * 操作日志（追加式）。
 * 日志表由数据库触发器保护，禁止更新与删除。
 */
@Injectable()
export class OperationLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: OperationLogInput,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.operation_logs.create({
      data: {
        id: newId(),
        company_id: input.companyId,
        operator_type: input.operatorType,
        operator_id: input.operatorId ?? null,
        action_type: input.actionType,
        target_type: input.targetType,
        target_id: input.targetId ?? null,
        summary: input.summary.slice(0, 500),
        detail: input.detail,
      },
    });
  }
}
