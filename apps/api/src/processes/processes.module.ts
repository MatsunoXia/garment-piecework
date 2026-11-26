import { Module } from '@nestjs/common';

import { SettlementsModule } from '../settlements/settlements.module.js';
import { ProcessesController } from './processes.controller.js';
import { ProcessesService } from './processes.service.js';

@Module({
  imports: [SettlementsModule],
  controllers: [ProcessesController],
  providers: [ProcessesService],
})
export class ProcessesModule {}
