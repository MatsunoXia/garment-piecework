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
  CreateSettlementDto,
  ListSettlementsQueryDto,
  UpdateSettlementDto,
} from './dto/settlement.dto.js';
import { SettlementsService } from './settlements.service.js';

@ApiTags('工资结算')
@Controller('settlements')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class SettlementsController {
  constructor(private readonly service: SettlementsService) {}

  @Get('pending')
  @ApiOperation({ summary: '某款式待结算员工列表' })
  pending(
    @CurrentUser() user: AuthUser,
    @Query('styleId') styleId: string,
  ) {
    return this.service.listPendingSettlements(user, styleId);
  }

  @Post()
  @ApiOperation({ summary: '创建结算（员工 + 款式，线下发放后登记）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSettlementDto) {
    return this.service.createSettlement(user, dto);
  }

  @Get()
  @ApiOperation({ summary: '结算记录列表（分页、筛选）' })
  list(@CurrentUser() user: AuthUser, @Query() query: ListSettlementsQueryDto) {
    return this.service.listSettlements(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: '结算详情（工序明细、报工明细、修正记录）' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getSettlement(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修正结算记录（保留审计信息）' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSettlementDto,
  ) {
    return this.service.updateSettlement(user, id, dto);
  }
}
