import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { AccessModule } from './common/auth/access.module.js';
import { RolesGuard } from './common/guards/roles.guard.js';
import { OperationLogModule } from './common/logging/operation-log.module.js';
import { BundlesModule } from './bundles/bundles.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DisputesModule } from './disputes/disputes.module.js';
import { EmployeesModule } from './employees/employees.module.js';
import { HealthModule } from './health/health.module.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { OperationLogsModule } from './operation-logs/operation-logs.module.js';
import { OrganizationModule } from './organization/organization.module.js';
import { PayrollModule } from './payroll/payroll.module.js';
import { ProcessesModule } from './processes/processes.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SettlementsModule } from './settlements/settlements.module.js';
import { StylesModule } from './styles/styles.module.js';
import { WorkshopsModule } from './workshops/workshops.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', 'apps/api/.env'],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
        ],
      },
    }),
    PrismaModule,
    AccessModule,
    OperationLogModule,
    AuthModule,
    HealthModule,
    OrganizationModule,
    InvitationsModule,
    EmployeesModule,
    WorkshopsModule,
    StylesModule,
    ProcessesModule,
    BundlesModule,
    ReportsModule,
    DisputesModule,
    PayrollModule,
    SettlementsModule,
    OperationLogsModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
