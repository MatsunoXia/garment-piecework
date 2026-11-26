import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ListOperationLogsQueryDto } from './dto/operation-log.dto.js';
import { OperationLogsService } from './operation-logs.service.js';

@ApiTags('操作日志')
@Controller('operation-logs')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class OperationLogsController {
  constructor(private readonly service: OperationLogsService) {}

  @Get()
  @ApiOperation({ summary: '操作日志查询（追加式，只读）' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListOperationLogsQueryDto) {
    return this.service.list(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '操作日志详情' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.detail(user, id);
  }
}
