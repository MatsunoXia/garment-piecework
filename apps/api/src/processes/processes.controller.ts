import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  ChangePriceDto,
  CreateProcessTemplateDto,
  CreateStyleProcessDto,
  UpdateProcessTemplateDto,
  UpdateStyleProcessDto,
} from './dto/process.dto.js';
import { ProcessesService } from './processes.service.js';

@ApiTags('工序与工价')
@Controller()
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class ProcessesController {
  constructor(private readonly service: ProcessesService) {}

  @Get('styles/:styleId/processes')
  @ApiOperation({ summary: '款式工序列表' })
  list(@CurrentUser() user: AuthUser, @Param('styleId') styleId: string) {
    return this.service.listStyleProcesses(user, styleId);
  }

  @Post('styles/:styleId/processes')
  @ApiOperation({ summary: '款式新增工序' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Body() dto: CreateStyleProcessDto,
  ) {
    return this.service.createStyleProcess(user, styleId, dto);
  }

  @Patch('processes/:id')
  @ApiOperation({ summary: '修改工序名称 / 分组 / 排序' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStyleProcessDto,
  ) {
    return this.service.updateStyleProcess(user, id, dto);
  }

  @Post('processes/:id/change-price')
  @ApiOperation({ summary: '修改工价并同步重算该款工资与结算金额' })
  changePrice(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ChangePriceDto,
  ) {
    return this.service.changePrice(user, id, dto);
  }

  @Delete('processes/:id')
  @ApiOperation({ summary: '删除工序（有报工历史后禁止删除）' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteStyleProcess(user, id);
  }

  @Get('process-templates')
  @ApiOperation({ summary: '工序模板列表（含明细）' })
  templates(@CurrentUser() user: AuthUser) {
    return this.service.listTemplates(user);
  }

  @Post('process-templates')
  @ApiOperation({ summary: '创建工序模板' })
  createTemplate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProcessTemplateDto,
  ) {
    return this.service.createTemplate(user, dto);
  }

  @Patch('process-templates/:id')
  @ApiOperation({ summary: '修改工序模板' })
  updateTemplate(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateProcessTemplateDto,
  ) {
    return this.service.updateTemplate(user, id, dto);
  }

  @Delete('process-templates/:id')
  @ApiOperation({ summary: '删除工序模板' })
  deleteTemplate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteTemplate(user, id);
  }
}
