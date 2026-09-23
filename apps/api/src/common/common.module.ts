import { Module, Global } from '@nestjs/common';
import { MetricsService } from './services/metrics.service';
import { MetricsController } from './controllers/metrics.controller';
import { CacheService } from './services/cache.service';
import { PrismaModule } from './prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MetricsService, CacheService],
  controllers: [MetricsController],
  exports: [MetricsService, CacheService],
})
export class CommonModule {}