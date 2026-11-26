import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
  CreateStyleDto,
  ListStylesQueryDto,
  UpdateStyleDto,
} from './dto/style.dto.js';
import { StylesService } from './styles.service.js';

@ApiTags('款式')
@Controller('styles')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StylesController {
  constructor(private readonly service: StylesService) {}

  @Get('reportable')
  @Roles('employee')
  @ApiOperation({ summary: '员工可报工的款式列表（按所属车间过滤）' })
  reportable(@CurrentUser() user: AuthUser) {
    return this.service.listReportableStyles(user);
  }

  @Get(':id/report-options')
  @Roles('employee')
  @ApiOperation({ summary: '员工报工选项：工序与捆号可用状态' })
  reportOptions(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('styleProcessId') styleProcessId?: string,
  ) {
    return this.service.getReportOptions(user, id, styleProcessId);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '创建款式（可套用工序模板）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStyleDto) {
    return this.service.createStyle(user, dto);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '款式列表（分页、状态、关键字筛选）' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListStylesQueryDto) {
    return this.service.listStyles(user, query);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: '款式详情（含工序、车间、统计）' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getStyleDetail(user, id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: '修改款式基本信息与生产范围' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStyleDto,
  ) {
    return this.service.updateStyle(user, id, dto);
  }

  @Post(':id/complete')
  @Roles('admin')
  @ApiOperation({ summary: '标记款式完成（需无待审核报工与待处理争议）' })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.completeStyle(user, id);
  }

  @Post(':id/archive')
  @Roles('admin')
  @ApiOperation({ summary: '归档款式（需先完成全部结算）' })
  archive(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveStyle(user, id);
  }
}
