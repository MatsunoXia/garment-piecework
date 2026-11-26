import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  success: false;
  code: string;
  message: string;
  details?: unknown;
  statusCode: number;
  path: string;
  timestamp: string;
}

/**
 * 数据库触发器 / 约束抛出的异常与稳定业务错误码之间的映射。
 * 数据库是业务规则的最后防线，命中时需要给出可操作的中文提示。
 */
const DATABASE_ERROR_MAPPING: Array<{
  pattern: RegExp;
  code: string;
  message: string;
  status: HttpStatus;
}> = [
  {
    pattern: /This record is immutable/i,
    code: 'DB_MIGRATION_REQUIRED',
    message:
      '当前数据库的不可变触发器阻止该操作。结算金额重算与结算修正需要先执行迁移 0001_settlement_recalculation.sql（迁移文件已提供，尚未执行）。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Style processes can only be changed while the style is in production/i,
    code: 'STYLE_PROCESS_LOCKED',
    message:
      '款式已完成或已结算，当前数据库触发器禁止修改工序及工价。需要执行迁移 0001_settlement_recalculation.sql 放开工价字段后重试。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Bundle production data is locked/i,
    code: 'BUNDLE_FIELDS_LOCKED',
    message: '款式已完成，捆号的生产数据（数量、码数）已锁定，仅允许修改备注。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Bundles can only be added while the style is in production/i,
    code: 'STYLE_NOT_PRODUCTION',
    message: '只有生产中的款式可以新增捆号。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Bundles can only be deleted while the style is in production/i,
    code: 'STYLE_NOT_PRODUCTION',
    message: '只有生产中的款式可以删除捆号。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /has_reported is irreversible/i,
    code: 'HAS_REPORTED_LOCKED',
    message: '历史报工标记不可重置。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /This record has report history and cannot be deleted/i,
    code: 'DELETE_FORBIDDEN',
    message: '该记录已经产生报工历史，永久禁止删除。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /A report included in a settlement cannot be deleted/i,
    code: 'REPORT_ALREADY_SETTLED',
    message: '该报工已进入结算，不允许删除。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Only a production style can be deleted/i,
    code: 'STYLE_NOT_PRODUCTION',
    message: '只有生产中的款式可以删除。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Invalid style status transition/i,
    code: 'INVALID_STATUS_TRANSITION',
    message: '款式状态只能按 生产中 → 已完成 → 已结算 → 已归档 向前推进。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /Reports can only be created for a production style/i,
    code: 'STYLE_NOT_PRODUCTION',
    message: '该款式已不在生产中，不能继续报工。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /A style process cannot be moved|A bundle cannot be moved/i,
    code: 'CROSS_SCOPE_MOVE_FORBIDDEN',
    message: '不允许把记录移动到其他公司或款式。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /duplicate key value violates unique constraint "uq_reports_active_bundle_process"/i,
    code: 'REPORT_ALREADY_EXISTS',
    message: '该捆号的该工序已经有人报工，同一捆号同一工序只能由一名员工报工。',
    status: HttpStatus.CONFLICT,
  },
  {
    pattern: /duplicate key value violates unique constraint/i,
    code: 'DUPLICATE_RECORD',
    message: '数据已存在，请勿重复提交。',
    status: HttpStatus.CONFLICT,
  },
];

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const mapped = this.toErrorBody(exception, request);

    if (mapped.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${exception instanceof Error ? exception.message : 'Unknown error'}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(mapped.statusCode).json(mapped);
  }

  private toErrorBody(exception: unknown, request: Request): ErrorBody {
    const base = {
      success: false as const,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();

      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>;
        const code =
          typeof record.code === 'string'
            ? record.code
            : status === HttpStatus.BAD_REQUEST
              ? 'VALIDATION_FAILED'
              : `HTTP_${status}`;

        const rawMessage = record.message;
        const message = Array.isArray(rawMessage)
          ? rawMessage.join('；')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message;

        return {
          ...base,
          statusCode: status,
          code,
          message,
          details: record.details,
        };
      }

      return {
        ...base,
        statusCode: status,
        code:
          status === HttpStatus.BAD_REQUEST
            ? 'VALIDATION_FAILED'
            : `HTTP_${status}`,
        message: typeof payload === 'string' ? payload : exception.message,
      };
    }

    if (exception instanceof Error) {
      const databaseMapping = DATABASE_ERROR_MAPPING.find((item) =>
        item.pattern.test(exception.message),
      );

      if (databaseMapping) {
        return {
          ...base,
          statusCode: databaseMapping.status,
          code: databaseMapping.code,
          message: databaseMapping.message,
        };
      }

      const prismaCode = (exception as { code?: unknown }).code;

      if (typeof prismaCode === 'string' && prismaCode.startsWith('P')) {
        const prismaMapped = this.mapPrismaError(prismaCode, exception.message);
        if (prismaMapped) return { ...base, ...prismaMapped };
      }
    }

    return {
      ...base,
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误，请稍后重试',
    };
  }

  private mapPrismaError(
    code: string,
    message: string,
  ): { statusCode: number; code: string; message: string } | null {
    const databaseMapping = DATABASE_ERROR_MAPPING.find((item) =>
      item.pattern.test(message),
    );
    if (databaseMapping) {
      return {
        statusCode: databaseMapping.status,
        code: databaseMapping.code,
        message: databaseMapping.message,
      };
    }

    switch (code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'DUPLICATE_RECORD',
          message: '数据已存在，请勿重复提交。',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'RELATION_CONFLICT',
          message: '该数据仍被其他记录引用，或关联记录不存在。',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'NOT_FOUND',
          message: '记录不存在或已被删除。',
        };
      case 'P2010':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          code: 'DATABASE_ERROR',
          message: '数据库操作失败，请检查提交的数据。',
        };
      default:
        return null;
    }
  }
}
