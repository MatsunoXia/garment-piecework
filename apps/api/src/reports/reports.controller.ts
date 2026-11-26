import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  AdminProxyBatchDto,
  AdminProxyReportDto,
  BatchCreateReportsDto,
  BatchReviewDto,
  CreateReportDto,
  ListReportsQueryDto,
  MyReportsQueryDto,
  RejectReportDto,
} from './dto/report.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('报工')
@Controller('reports')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Post()
  @Roles('employee')
  @ApiOperation({ summary: '员工单条报工（数量自动取捆号数量）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReportDto) {
    return this.service.createReport(user, dto);
  }

  @Post('batch')
  @Roles('employee')
  @ApiOperation({ summary: '员工批量报工（逐条返回成功与失败原因）' })
  createBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: BatchCreateReportsDto,
  ) {
    return this.service.createBatch(user, dto);
  }

  @Post('proxy')
  @Roles('admin')
  @ApiOperation({ summary: '管理员代员工报工（立即通过）' })
  createProxy(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminProxyReportDto,
  ) {
    return this.service.createProxyReport(user, dto);
  }

  @Post('proxy/batch')
  @Roles('admin')
  @ApiOperation({ summary: '管理员批量代报' })
  createProxyBatch(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminProxyBatchDto,
  ) {
    return this.service.createProxyBatch(user, dto);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: '我的报工记录' })
  my(@CurrentUser() user: AuthUser, @Query() query: MyReportsQueryDto) {
    return this.service.listMyReports(user, query);
  }

  @Get('pending')
  @Roles('admin')
  @ApiOperation({ summary: '待审核报工列表' })
  pending(@CurrentUser() user: AuthUser, @Query() query: ListReportsQueryDto) {
    return this.service.listPendingReports(user, query);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '报工查询（分页、多条件筛选）' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListReportsQueryDto) {
    return this.service.listReports(user, query);
  }

  @Post('batch-review')
  @Roles('admin')
  @ApiOperation({ summary: '批量通过 / 批量驳回' })
  batchReview(@CurrentUser() user: AuthUser, @Body() dto: BatchReviewDto) {
    return this.service.batchReview(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: '报工详情（员工仅可查看自己的记录）' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getReport(user, id);
  }

  @Post(':id/approve')
  @Roles('admin')
  @ApiOperation({ summary: '审核通过' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.approveReport(user, id);
  }

  @Post(':id/reject')
  @Roles('admin')
  @ApiOperation({ summary: '驳回（必须填写原因）' })
  reject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RejectReportDto,
  ) {
    return this.service.rejectReport(user, id, dto.reason);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除报工（已结算报工不可删除）' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteReport(user, id);
  }
}
