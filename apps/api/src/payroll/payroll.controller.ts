import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AccessService } from '../common/auth/access.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  EmployeePayrollQueryDto,
  StyleEmployeesQueryDto,
  StylePayrollQueryDto,
} from './dto/payroll.dto.js';
import { PayrollService } from './payroll.service.js';

@ApiTags('工资统计')
@Controller('payroll')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PayrollController {
  constructor(
    private readonly service: PayrollService,
    private readonly access: AccessService,
  ) {}

  @Get('styles/:styleId/employees')
  @Roles('admin')
  @ApiOperation({ summary: '款式下员工工资汇总（按当前工价计算）' })
  async styleEmployees(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Query() query: StyleEmployeesQueryDto,
  ) {
    const admin = await this.access.requireAdmin(user);
    await this.service.requireAdminStyle(admin.companyId, styleId);
    return this.service.getStyleEmployeeSummaries(
      admin.companyId,
      styleId,
      query.keyword,
    );
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: '员工查看自己的工资列表' })
  async my(
    @CurrentUser() user: AuthUser,
    @Query() query: StylePayrollQueryDto,
  ) {
    const employee = await this.access.requireEmployee(user);
    return this.service.getMyStyleSummaries(employee, query);
  }

  @Get('my/styles/:styleId')
  @Roles('employee')
  @ApiOperation({ summary: '员工查看自己某款工资明细' })
  async myDetail(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
  ) {
    const employee = await this.access.requireEmployee(user);
    return this.service.getMyStyleDetail(employee, styleId);
  }

  @Get('employees/:employeeId')
  @Roles('admin')
  @ApiOperation({ summary: '员工工资列表（按款式汇总，分页）' })
  async employeeStyles(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Query() query: EmployeePayrollQueryDto,
  ) {
    const admin = await this.access.requireAdmin(user);
    await this.access.getEmployeeOrThrow(admin.companyId, employeeId);
    return this.service.getEmployeeStyleSummaries(
      admin.companyId,
      employeeId,
      {
        styleId: query.styleId,
        settled: query.settled,
        page: query.page,
        pageSize: query.pageSize,
      },
    );
  }

  @Get('employees/:employeeId/styles/:styleId')
  @Roles('admin')
  @ApiOperation({ summary: '员工某款工资详情（工序、报工、结算）' })
  async employeeStyleDetail(
    @CurrentUser() user: AuthUser,
    @Param('employeeId') employeeId: string,
    @Param('styleId') styleId: string,
  ) {
    const admin = await this.access.requireAdmin(user);
    await this.access.getEmployeeOrThrow(admin.companyId, employeeId);
    return this.service.getEmployeeStyleDetail(
      admin.companyId,
      employeeId,
      styleId,
    );
  }
}
