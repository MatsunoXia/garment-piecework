import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return {
      success: true,
      message: '服务运行正常',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('db')
  async checkDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        success: true,
        message: '数据库连接正常',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        success: false,
        message: '数据库连接失败',
        database: 'disconnected',
      });
    }
  }
}
