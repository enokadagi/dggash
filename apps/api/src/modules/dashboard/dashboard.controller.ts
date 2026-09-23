import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('dashboard')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'Get dashboard KPIs' })
  @ApiResponse({ status: 200, description: 'KPIs retrieved' })
  async getKPIs() {
    return this.dashboardService.getKPIs();
  }

  @Get('revenue-chart')
  @ApiOperation({ summary: 'Get revenue chart data' })
  @ApiQuery({ name: 'period', enum: ['daily', 'weekly', 'monthly'], required: false })
  @ApiResponse({ status: 200, description: 'Revenue chart data retrieved' })
  async getRevenueChart(@Query('period') period?: string) {
    return this.dashboardService.getRevenueChart(period);
  }

  @Get('recent-activity')
  @ApiOperation({ summary: 'Get recent activity' })
  @ApiResponse({ status: 200, description: 'Recent activity retrieved' })
  async getRecentActivity() {
    return this.dashboardService.getRecentActivity();
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get alerts' })
  @ApiResponse({ status: 200, description: 'Alerts retrieved' })
  async getAlerts() {
    return this.dashboardService.getAlerts();
  }
}
