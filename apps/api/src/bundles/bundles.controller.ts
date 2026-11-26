import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import type { AuthUser } from '../auth/interfaces/auth-user.interface.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  BatchCreateBundlesDto,
  ConfirmImportBundlesDto,
  CreateBundleDto,
  ListBundlesQueryDto,
  UpdateBundleDto,
} from './dto/bundle.dto.js';
import { BundlesService } from './bundles.service.js';

@ApiTags('捆号')
@Controller()
@UseGuards(JwtAuthGuard)
@Roles('admin')
@ApiBearerAuth()
export class BundlesController {
  constructor(private readonly service: BundlesService) {}

  @Get('styles/:styleId/bundles')
  @ApiOperation({ summary: '款式捆号列表（分页）' })
  list(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Query() query: ListBundlesQueryDto,
  ) {
    return this.service.listBundles(user, styleId, query);
  }

  @Post('styles/:styleId/bundles')
  @ApiOperation({ summary: '新增捆号（自动分配最小可用编号）' })
  create(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Body() dto: CreateBundleDto,
  ) {
    return this.service.createBundle(user, styleId, dto);
  }

  @Post('styles/:styleId/bundles/batch')
  @ApiOperation({ summary: '批量新增捆号' })
  batch(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Body() dto: BatchCreateBundlesDto,
  ) {
    return this.service.batchCreateBundles(user, styleId, dto);
  }

  @Get('styles/:styleId/bundles/availability')
  @ApiOperation({ summary: '管理员代报：查询某工序下捆号是否已被报工' })
  availability(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Query('styleProcessId') styleProcessId: string,
  ) {
    return this.service.listBundleAvailability(user, styleId, styleProcessId);
  }

  @Get('styles/:styleId/bundles/template')
  @ApiOperation({ summary: '下载捆号导入模板' })
  template(@Param('styleId') styleId: string) {
    void styleId;
    return new StreamableFile(this.service.generateTemplate(), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="bundle-import-template.xlsx"',
    });
  }

  @Post('styles/:styleId/bundles/import/preview')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Excel 捆号导入预览（不写库）' })
  preview(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.previewImport(user, styleId, file);
  }

  @Post('styles/:styleId/bundles/import')
  @ApiOperation({ summary: '确认导入捆号（整批校验通过后写入）' })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param('styleId') styleId: string,
    @Body() dto: ConfirmImportBundlesDto,
  ) {
    return this.service.confirmImport(user, styleId, dto.rows);
  }

  @Patch('bundles/:id')
  @ApiOperation({ summary: '修改捆号（有报工历史后只能改备注）' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.service.updateBundle(user, id, dto);
  }

  @Delete('bundles/:id')
  @ApiOperation({ summary: '删除捆号（有报工历史后永久禁止）' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.deleteBundle(user, id);
  }
}
