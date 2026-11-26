import {
  Body,
  Controller,
  Delete,
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
  CreateWorkshopDto,
  ListWorkshopsQueryDto,
  UpdateWorkshopDto,
} from './dto/workshop.dto.js';
import { WorkshopsService } from './workshops.service.js';

@ApiTags('车间')
@Controller('workshops')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class WorkshopsController {
  constructor(private readonly service: WorkshopsService) {}

  @Get()
  @ApiOperation({ summary: '车间列表' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListWorkshopsQueryDto,
  ) {
    return this.service.list(user, query.includeDisabled === 1);
  }

  @Post()
  @ApiOperation({ summary: '创建车间' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkshopDto) {
    return this.service.create(user, dto.name);
  }

  @Patch(':id')
  @ApiOperation({ summary: '修改车间名称 / 状态' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkshopDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除车间（需先解除款式引用）' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(user, id);
  }
}
