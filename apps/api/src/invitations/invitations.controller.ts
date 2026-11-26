import {
  Body,
  Controller,
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
import { CreateCompanyInvitationDto } from './dto/create-company-invitation.dto.js';
import { UpdateCompanyInvitationDto } from './dto/update-company-invitation.dto.js';
import { InvitationsService } from './invitations.service.js';

@ApiTags('邀请')
@Controller('invitations/company')
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class InvitationsController {
  constructor(private readonly service: InvitationsService) {}

  @Get()
  @ApiOperation({ summary: '公司NO（员工加入码）列表' })
  list(@CurrentUser() user: AuthUser) {
    return this.service.listCompanyInvitations(user);
  }

  @Post()
  @ApiOperation({ summary: '获取或创建公司NO（每公司仅一个有效码）' })
  getOrCreate(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCompanyInvitationDto,
  ) {
    return this.service.getOrCreateCompanyInvitation(user, dto.expiresInDays);
  }

  @Patch(':id')
  @ApiOperation({ summary: '停用 / 启用公司NO' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCompanyInvitationDto,
  ) {
    return this.service.updateCompanyInvitation(user, id, dto.status);
  }
}
