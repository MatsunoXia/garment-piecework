import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('工作台')
@Controller('dashboard')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('admin')
  @Roles('admin')
  @ApiOperation({ summary: '管理员工作台汇总' })
  admin(@CurrentUser() user: AuthUser) {
    return this.service.adminSummary(user);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: '员工首页汇总' })
  my(@CurrentUser() user: AuthUser) {
    return this.service.employeeSummary(user);
  }
}
