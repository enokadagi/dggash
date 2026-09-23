import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WhatsAppCloudApiService } from './whatsapp-cloud-api.service';
import { WhatsAppService } from './whatsapp.service';

@Injectable()
export class WhatsAppSchedulerService {
  private readonly logger = new Logger(WhatsAppSchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private cloudApi: WhatsAppCloudApiService,
    private whatsappService: WhatsAppService,
  ) {}

  @Cron('*/5 * * * *')
  async processPendingMessages() {
    if (!this.cloudApi.isConfigured()) return;

    try {
      const pendingMessages = await this.prisma.whatsAppMessage.findMany({
        where: {
          status: 'pending',
          retryCount: { lt: 3 },
          OR: [
            { scheduledFor: null },
            { scheduledFor: { lte: new Date() } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });

      if (pendingMessages.length === 0) return;

      this.logger.log(`Processing ${pendingMessages.length} pending WhatsApp messages`);

      for (const message of pendingMessages) {
        try {
          const result = await this.cloudApi.sendTextMessage(
            message.recipientPhone,
            message.messageBody,
          );

          if (result.success) {
            await this.prisma.whatsAppMessage.update({
              where: { id: message.id },
              data: {
                status: 'sent',
                externalMessageId: result.messageId,
                sentAt: new Date(),
                errorMessage: null,
              },
            });
            this.logger.log(`Message ${message.id} sent successfully`);
          } else {
            const newRetryCount = message.retryCount + 1;
            await this.prisma.whatsAppMessage.update({
              where: { id: message.id },
              data: {
                status: newRetryCount >= 3 ? 'failed' : 'pending',
                retryCount: newRetryCount,
                errorMessage: result.error,
              },
            });
            this.logger.warn(
              `Message ${message.id} failed (retry ${newRetryCount}/3): ${result.error}`,
            );
          }
        } catch (error: any) {
          this.logger.error(`Error processing message ${message.id}: ${error.message}`);
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in processPendingMessages: ${error.message}`);
    }
  }

  @Cron('0 * * * *')
  async generateAndSendReminders() {
    try {
      const due = await this.whatsappService.getSubscriptionsDueForReminder();
      if (due.length === 0) return;

      this.logger.log(`Found ${due.length} subscriptions due for reminders`);

      for (const { subscription, type } of due) {
        try {
          const reminder = await this.whatsappService.sendReminder(
            subscription.id,
            type,
          );
          this.logger.log(`Reminder ${type} for subscription ${subscription.id}: ${reminder.status}`);
        } catch (error: any) {
          this.logger.error(
            `Reminder ${type} for subscription ${subscription.id} failed: ${error.message}`,
          );
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in generateAndSendReminders: ${error.message}`);
    }
  }
}