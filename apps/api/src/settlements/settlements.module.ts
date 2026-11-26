import { Module } from '@nestjs/common';

import { PayrollModule } from '../payroll/payroll.module.js';
import { StylesModule } from '../styles/styles.module.js';
import { SettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({
  imports: [PayrollModule, StylesModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
  exports: [SettlementsService],
})
export class SettlementsModule {}
