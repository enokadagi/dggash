import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ExportService } from './export.service';
import { FinancialController } from './financial.controller';

@Module({
  controllers: [ReportsController, FinancialController],
  providers: [ReportsService, ExportService],
  exports: [ReportsService, ExportService],
})
export class ReportsModule {}
