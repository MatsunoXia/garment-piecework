import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CreateDisputeDto,
  ListDisputesQueryDto,
  ResolveDisputeDto,
} from './dto/dispute.dto.js';
import { DisputesService } from './disputes.service.js';

@ApiTags('报工争议')
@Controller('report-disputes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DisputesController {
  constructor(private readonly service: DisputesService) {}

  @Post()
  @Roles('employee')
  @ApiOperation({ summary: '员工发起报工归属争议' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateDisputeDto) {
    return this.service.createDispute(user, dto);
  }

  @Get('my')
  @Roles('employee')
  @ApiOperation({ summary: '我的争议（作为质疑人或原员工）' })
  my(@CurrentUser() user: AuthUser, @Query() query: ListDisputesQueryDto) {
    return this.service.listMyDisputes(user, query);
  }

  @Get('pending')
  @Roles('admin')
  @ApiOperation({ summary: '待处理争议列表' })
  pending(@CurrentUser() user: AuthUser, @Query() query: ListDisputesQueryDto) {
    return this.service.listPendingDisputes(user, query);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '争议查询（分页、状态筛选）' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListDisputesQueryDto) {
    return this.service.listDisputes(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '争议详情' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getDispute(user, id);
  }

  @Post(':id/resolve')
  @Roles('admin')
  @ApiOperation({ summary: '处理争议（三种结果之一）' })
  resolve(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.service.resolveDispute(user, id, dto);
  }
}
