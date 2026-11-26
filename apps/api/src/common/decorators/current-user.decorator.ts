import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import type { AuthUser } from '../../auth/interfaces/auth-user.interface.js';

/** 从通过 JwtAuthGuard 的请求中取出当前登录身份 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user: AuthUser }>();
    return request.user;
  },
);
