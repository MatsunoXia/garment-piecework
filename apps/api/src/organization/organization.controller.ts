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

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { AcceptAdminInvitationDto } from './dto/accept-admin-invitation.dto.js';
import { CreateAdminInvitationDto } from './dto/create-admin-invitation.dto.js';
import { CreateCompanyDto } from './dto/create-company.dto.js';
import { UpdateAdminInvitationDto } from './dto/update-admin-invitation.dto.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { OrganizationService } from './organization.service.js';

@ApiTags('公司与管理员')
@Controller()
export class OrganizationController {
  constructor(private readonly service: OrganizationService) {}

  @Post('companies')
  @UseGuards(JwtAuthGuard)
  @Roles('pending')
  @ApiBearerAuth()
  @ApiOperation({ summary: '未加入公司的微信创建公司并成为创始管理员' })
  createCompany(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) {
    return this.service.createCompany(
      user,
      dto.companyName,
      dto.adminName,
      dto.webPassword,
    );
  }

  @Get('companies/current')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前公司信息' })
  getCurrentCompany(@CurrentUser() user: AuthUser) {
    return this.service.getCurrentCompany(user);
  }

  @Patch('companies/current')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '修改公司信息' })
  updateCurrentCompany(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.service.updateCurrentCompany(user, dto.name);
  }

  @Post('companies/current/disable')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '停用公司（仅创始管理员）' })
  disableCurrentCompany(@CurrentUser() user: AuthUser) {
    return this.service.disableCurrentCompany(user);
  }

  @Post('admin-invitations')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建管理员邀请（同一邀请可被多人使用）' })
  createInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAdminInvitationDto,
  ) {
    return this.service.createAdminInvitation(user, dto.expiresInDays);
  }

  @Get('admin-invitations')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员邀请列表' })
  listInvitations(@CurrentUser() user: AuthUser) {
    return this.service.listAdminInvitations(user);
  }

  @Patch('admin-invitations/:id')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '停用 / 启用管理员邀请' })
  updateInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAdminInvitationDto,
  ) {
    return this.service.updateAdminInvitation(user, id, dto.status);
  }

  @Post('admin-invitations/accept')
  @UseGuards(JwtAuthGuard)
  @Roles('pending')
  @ApiBearerAuth()
  @ApiOperation({ summary: '通过邀请加入公司成为管理员' })
  acceptInvitation(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptAdminInvitationDto,
  ) {
    return this.service.acceptAdminInvitation(user, dto.token, dto.name);
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '管理员列表' })
  listAdmins(@CurrentUser() user: AuthUser) {
    return this.service.listAdmins(user);
  }

  @Post('admins/:id/deactivate')
  @UseGuards(JwtAuthGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '停用管理员' })
  deactivateAdmin(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deactivateAdmin(user, id);
  }
}
