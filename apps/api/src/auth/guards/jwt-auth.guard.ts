import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { AuthUser } from '../interfaces/auth-user.interface.js';

type AuthRequest = Request & { user: AuthUser };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthRequest>();
    const authorization = request.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('请先登录');
    }

    const token = authorization.slice(7).trim();

    if (!token) {
      throw new UnauthorizedException('登录凭证无效');
    }

    try {
      request.user = await this.jwt.verifyAsync<AuthUser>(token);
      return true;
    } catch {
      throw new UnauthorizedException('登录凭证已过期或无效，请重新登录');
    }
  }
}
