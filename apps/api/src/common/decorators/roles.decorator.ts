import { SetMetadata } from '@nestjs/common';

import { UserRole } from '../../auth/interfaces/auth-user.interface.js';

export const ROLES_KEY = 'roles';

/** 限定接口允许的身份类型，必须配合 JwtAuthGuard 使用 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
