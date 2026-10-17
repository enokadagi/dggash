import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MetricsService } from '../services/metrics.service';
import { Roles } from '../decorators/roles.decorator';

@ApiTags('metrics')
@ApiBearerAuth()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  // Internal operational telemetry (per-route timings, status/error counts).
  // Previously unguarded by role, so any authenticated STAFF could read it.
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Get API metrics' })
  getMetrics() {
    return this.metricsService.getMetrics();
  }
}
