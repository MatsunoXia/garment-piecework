import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * 统一成功响应包装。
 * 业务层只返回 data，由拦截器包装为 { success: true, data }。
 * 已显式返回 success 字段的响应（如文件下载、登录选择）保持原样。
 */
@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((payload: unknown) => {
        if (payload instanceof StreamableFile) {
          return payload;
        }

        if (
          payload !== null &&
          typeof payload === 'object' &&
          !Array.isArray(payload) &&
          !(payload instanceof Buffer) &&
          'success' in payload
        ) {
          return payload;
        }

        return {
          success: true,
          data: payload ?? null,
        };
      }),
    );
  }
}
