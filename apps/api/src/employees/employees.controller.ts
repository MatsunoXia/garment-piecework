import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CreateEmployeeDto,
  CreateRebindTokenDto,
  JoinEmployeeDto,
  ListEmployeesQueryDto,
  PreviewInviteDto,
  RebindWechatDto,
  SetEmployeeWorkshopsDto,
  UpdateEmployeeDto,
} from './dto/employee.dto.js';
import { EmployeesService } from './employees.service.js';

@ApiTags('员工')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly service: EmployeesService) {}

  @Post('join/preview')
  @Roles('pending')
  @ApiOperation({ summary: '校验公司NO并预览公司名称' })
  previewInvitation(@Body() dto: PreviewInviteDto) {
    return this.service.previewInvitation(dto.inviteCode);
  }

  @Post('join')
  @Roles('pending')
  @ApiOperation({ summary: '员工通过公司NO加入公司' })
  join(@CurrentUser() user: AuthUser, @Body() dto: JoinEmployeeDto) {
    return this.service.joinByInvitation(
      user,
      dto.inviteCode,
      dto.name,
      dto.workshopIds ?? [],
    );
  }

  @Post('rebind')
  @ApiOperation({ summary: '员工使用重新绑定口令绑定新微信' })
  rebind(@CurrentUser() user: AuthUser, @Body() dto: RebindWechatDto) {
    return this.service.rebindWechat(user, dto.token);
  }

  @Get('me')
  @Roles('employee')
  @ApiOperation({ summary: '员工查看自己的资料与所属车间' })
  myProfile(@CurrentUser() user: AuthUser) {
    return this.service.getMyProfile(user);
  }

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: '员工列表（分页、筛选）' })
  list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListEmployeesQueryDto,
  ) {
    return this.service.listEmployees(user, query);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: '管理员创建员工（不含微信绑定）' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateEmployeeDto) {
    return this.service.createEmployee(user, dto);
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: '员工详情' })
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getEmployee(user, id);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: '修改员工信息' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.service.updateEmployee(user, id, dto);
  }

  @Post(':id/disable')
  @Roles('admin')
  @ApiOperation({ summary: '停用员工' })
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setEmployeeStatus(user, id, 'disabled');
  }

  @Post(':id/enable')
  @Roles('admin')
  @ApiOperation({ summary: '启用员工' })
  enable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.setEmployeeStatus(user, id, 'active');
  }

  @Put(':id/workshops')
  @Roles('admin')
  @ApiOperation({ summary: '设置员工所属车间' })
  setWorkshops(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SetEmployeeWorkshopsDto,
  ) {
    return this.service.setEmployeeWorkshops(user, id, dto.workshopIds);
  }

  @Post(':id/rebind-token')
  @Roles('admin')
  @ApiOperation({ summary: '生成微信重新绑定口令' })
  createRebindToken(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateRebindTokenDto,
  ) {
    return this.service.createRebindToken(user, id, dto.expiresInMinutes ?? 30);
  }
}
