import {
  Controller, Get, Post, Body, Param, Query,
  HttpCode, HttpStatus, Headers, Res, Logger, UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { SendMessageDto } from './dto/send-message.dto';
import { BulkSendMessageDto } from './dto/bulk-send-message.dto';
import { QueryWhatsAppDto } from './dto/query-whatsapp.dto';
import { SendTemplateDto } from './dto/send-template.dto';
import { SaveWhatsAppTemplateDto } from './dto/save-whatsapp-template.dto';
import { WhatsAppWebhookBody } from './dto/webhook.dto';
import { ConfigService } from '@nestjs/config';
import { Roles } from '../../common/decorators/roles.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Roles('ADMIN', 'STAFF')
@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Check WhatsApp API configuration status' })
  @ApiResponse({ status: 200, description: 'Configuration status returned' })
  getStatus() {
    return {
      configured: this.whatsappService.isConfigured(),
    };
  }

  @Post('send')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send WhatsApp text message' })
  @ApiResponse({ status: 201, description: 'Message sent or queued' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.whatsappService.sendMessage(dto);
  }

  @Post('send-template')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a template message to a customer' })
  @ApiResponse({ status: 201, description: 'Template message sent' })
  @ApiResponse({ status: 404, description: 'Customer or template not found' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async sendTemplate(@Body() dto: SendTemplateDto) {
    return this.whatsappService.sendTemplateMessage(dto);
  }

  @Post('bulk-send')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Bulk send WhatsApp messages (template or plain body)' })
  @ApiResponse({ status: 201, description: 'Messages queued/sent' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async bulkSend(@Body() dto: BulkSendMessageDto) {
    return this.whatsappService.bulkSend(dto);
  }

  @Get('templates')
  @ApiOperation({ summary: 'Get WhatsApp message templates (from company settings)' })
  @ApiResponse({ status: 200, description: 'Templates listed' })
  async getTemplates(@Query() query: QueryWhatsAppDto) {
    return this.whatsappService.getTemplates(query);
  }

  @Post('templates')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create or update a WhatsApp message template (company setting)' })
  @ApiResponse({ status: 201, description: 'Template saved' })
  @ApiResponse({ status: 400, description: 'Invalid template data' })
  async saveTemplate(@Body() dto: SaveWhatsAppTemplateDto) {
    return this.whatsappService.saveTemplate(dto);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Get WhatsApp message logs' })
  @ApiResponse({ status: 200, description: 'Messages listed' })
  async getMessages(@Query() query: QueryWhatsAppDto) {
    return this.whatsappService.getMessages(query);
  }

  @Get('messages/:id/status')
  @ApiOperation({ summary: 'Check message delivery status' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Delivery status' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async getDeliveryStatus(@Param('id') id: string) {
    return this.whatsappService.getDeliveryStatus(id);
  }

  @Post('retry/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed WhatsApp message' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Retry result' })
  @ApiResponse({ status: 400, description: 'Message not retryable' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  async retryMessage(@Param('id') id: string) {
    return this.whatsappService.retryMessage(id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get WhatsApp delivery statistics' })
  @ApiResponse({ status: 200, description: 'Stats returned' })
  async getStats() {
    return this.whatsappService.getStats();
  }

  @Get('reminders')
  @ApiOperation({ summary: 'List scheduled expiry reminders' })
  @ApiResponse({ status: 200, description: 'Reminders listed' })
  async getReminders(@Query() query: QueryWhatsAppDto) {
    return this.whatsappService.getReminders(query);
  }

  @Get('reminders/due')
  @ApiOperation({ summary: 'List subscriptions due for a reminder today' })
  @ApiResponse({ status: 200, description: 'Due reminders listed' })
  async getDueReminders() {
    const due = await this.whatsappService.getDueReminders();
    return {
      count: due.length,
      reminders: due.map(({ subscription, type }) => ({
        subscriptionId: subscription.id,
        customerId: subscription.customerId,
        customerName: `${subscription.customer.firstName} ${subscription.customer.lastName}`.trim(),
        phone: subscription.customer.whatsappNumber || subscription.customer.phone,
        type,
        expiryDate: subscription.expiryDate,
        planName: subscription.plan?.name || null,
      })),
    };
  }

  @Post('reminders/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger reminders for all subscriptions due today' })
  @ApiResponse({ status: 200, description: 'Reminders processed' })
  async triggerReminders() {
    const due = await this.whatsappService.getDueReminders();
    const results = [];
    for (const { subscription, type } of due) {
      try {
        const reminder = await this.whatsappService.sendReminder(
          subscription.id,
          type,
        );
        results.push({ subscriptionId: subscription.id, type, status: reminder.status });
      } catch (error: any) {
        results.push({ subscriptionId: subscription.id, type, status: 'error', error: error.message });
      }
    }
    return { processed: results.length, results };
  }

  @Get('webhook')
  @Public()
  @ApiOperation({ summary: 'WhatsApp webhook verification' })
  @ApiQuery({ name: 'hub.mode', required: true })
  @ApiQuery({ name: 'hub.verify_token', required: true })
  @ApiQuery({ name: 'hub.challenge', required: true })
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const verifyToken = this.config.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN', 'AWIK NET-webhook-verify');

    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).send('Forbidden');
    }
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'WhatsApp webhook for status updates and incoming messages' })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async handleWebhook(@Body() body: WhatsAppWebhookBody, @Headers('x-hub-signature-256') signature?: string) {
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!appSecret || !signature?.startsWith('sha256=')) {
      throw new UnauthorizedException('Webhook signature verification is not configured');
    }
    const expected = crypto.createHmac('sha256', appSecret).update(JSON.stringify(body)).digest('hex');
    const received = signature.slice('sha256='.length);
    if (received.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid WhatsApp webhook signature');
    }

    if (body.object !== 'whatsapp_business_account') {
      return { status: 'ignored' };
    }

    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== 'messages') continue;

        const value = change.value;

        if (value.statuses) {
          for (const status of value.statuses) {
            await this.whatsappService.handleWebhookStatusUpdate(
              status.id,
              status.status,
              status.timestamp,
              status.errors?.[0]?.message,
            );
          }
        }

        if (value.messages) {
          for (const message of value.messages) {
            this.logger.log(
              `Incoming WhatsApp message from ${message.from}: ${message.type}`,
            );
          }
        }
      }
    }

    return { status: 'ok' };
  }
}