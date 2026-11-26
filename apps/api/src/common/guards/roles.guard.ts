import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';
import { BusinessException } from '../http/business.exception.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (!user) {
      throw BusinessException.unauthorized('UNAUTHORIZED', '请先登录');
    }

    if (!required.includes(user.role)) {
      throw BusinessException.forbidden(
        'FORBIDDEN',
        user.role === 'pending'
          ? '当前微信尚未加入公司，请先加入或创建公司'
          : '当前身份无权访问该功能',
      );
    }

    return true;
  }
}
