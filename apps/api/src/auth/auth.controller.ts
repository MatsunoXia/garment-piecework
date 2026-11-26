import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { DevLoginDto } from './dto/dev-login.dto.js';
import { SelectIdentityDto } from './dto/select-identity.dto.js';
import { SetWebPasswordDto } from './dto/set-web-password.dto.js';
import { WebLoginDto } from './dto/web-login.dto.js';
import { WechatLoginDto } from './dto/wechat-login.dto.js';
import type { AuthUser } from './interfaces/auth-user.interface.js';
import { AuthService } from './auth.service.js';

@ApiTags('身份认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('wechat/login')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '微信小程序登录（code 换取 OpenID）' })
  wechatLogin(@Body() dto: WechatLoginDto) {
    return this.authService.wechatLogin(dto.code);
  }

  @Get('wechat/status')
  @Public()
  @ApiOperation({ summary: '微信登录配置状态（供小程序判断是否可用）' })
  wechatStatus() {
    return { configured: this.authService.wechatLoginConfigured() };
  }

  @Post('dev/login')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '本地开发登录（需 ENABLE_DEV_LOGIN=true）' })
  devLogin(@Body() dto: DevLoginDto) {
    return this.authService.devLogin(dto.openid);
  }

  @Post('web/login')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: 'Web 管理后台登录（公司编号 + 管理密码）' })
  webLogin(@Body() dto: WebLoginDto) {
    return this.authService.webLogin(dto.company, dto.password, dto.adminName);
  }

  @Post('select-identity')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '在多个可用身份中选择登录身份' })
  selectIdentity(@Body() dto: SelectIdentityDto) {
    return this.authService.selectIdentity(
      dto.selectionToken,
      dto.role,
      dto.id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前登录身份' })
  me(@CurrentUser() user: AuthUser) {
    return this.authService.getCurrentUser(user);
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '刷新登录凭证' })
  refresh(@CurrentUser() user: AuthUser) {
    return this.authService.refresh(user);
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: '退出登录（无状态 JWT，客户端清除凭证即可）' })
  logout() {
    return { message: '已退出登录' };
  }

  @Post('web/password')
  @HttpCode(200)
  @Roles('admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置 / 重置 Web 管理密码（仅创始管理员）' })
  setWebPassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: SetWebPasswordDto,
  ) {
    return this.authService.setWebPassword(user, dto.password);
  }
}
