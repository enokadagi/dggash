import { Module } from '@nestjs/common';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppSchedulerService } from './whatsapp-scheduler.service';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [WhatsAppController],
  providers: [
    WhatsAppService,
    WhatsAppCloudApiService,
    WhatsAppSchedulerService,
  ],
  exports: [
    WhatsAppService,
    WhatsAppCloudApiService,
    WhatsAppSchedulerService,
  ],
})
export class WhatsAppModule {}