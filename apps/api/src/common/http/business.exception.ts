import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常：携带稳定错误码，前端根据 code 决定提示与处理方式。
 * 已有错误码含义不得随意改变（见技术架构文档第十章）。
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static badRequest(code: string, message: string, details?: unknown) {
    return new BusinessException(code, message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthorized(code: string, message: string) {
    return new BusinessException(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(code: string, message: string) {
    return new BusinessException(code, message, HttpStatus.FORBIDDEN);
  }

  static notFound(code: string, message: string) {
    return new BusinessException(code, message, HttpStatus.NOT_FOUND);
  }

  static conflict(code: string, message: string, details?: unknown) {
    return new BusinessException(code, message, HttpStatus.CONFLICT, details);
  }
}
