import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('financial')
@ApiBearerAuth()
@Controller('financial')
export class FinancialController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  @Roles('ADMIN', 'STAFF')
  @ApiOperation({ summary: 'Financial overview (MRR, active, churn, growth)' })
  @ApiResponse({ status: 200, description: 'Financial overview generated' })
  async getOverview() {
    return this.reportsService.getFinancialOverview();
  }
}