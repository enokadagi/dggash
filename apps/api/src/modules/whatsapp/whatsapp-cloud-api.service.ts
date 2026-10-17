import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface WhatsAppApiResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface WhatsAppApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_data?: { messaging_product: string; details: string };
  };
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: number;
}

@Injectable()
export class WhatsAppCloudApiService {
  private readonly logger = new Logger(WhatsAppCloudApiService.name);
  private apiUrl: string;
  private phoneNumberId: string;
  private accessToken: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiVersion = this.config.get('WHATSAPP_API_VERSION', 'v18.0');
    this.apiUrl = this.config.get('WHATSAPP_API_URL', `https://graph.facebook.com/${apiVersion}`);
    this.phoneNumberId = this.config.get('WHATSAPP_PHONE_NUMBER_ID', '');
    this.accessToken = this.config.get('WHATSAPP_API_TOKEN') || this.config.get('WHATSAPP_ACCESS_TOKEN', '');
    void this.reloadConfig();
  }

  async reloadConfig(): Promise<void> {
    try {
      const settings = await this.prisma.companySetting.findMany({
        where: {
          key: {
            in: [
              'whatsapp.phoneNumberId',
              'whatsapp.phone_number_id',
              'whatsapp.accessToken',
              'whatsapp.access_token',
              'whatsapp.apiUrl',
            ],
          },
        },
      });
      for (const s of settings) {
        if ((s.key === 'whatsapp.phoneNumberId' || s.key === 'whatsapp.phone_number_id') && s.value) {
          this.phoneNumberId = s.value.trim();
        }
        if ((s.key === 'whatsapp.accessToken' || s.key === 'whatsapp.access_token') && s.value) {
          this.accessToken = s.value.trim();
        }
        if (s.key === 'whatsapp.apiUrl' && s.value) {
          this.apiUrl = s.value.trim();
        }
      }
    } catch {
      // Non-fatal, use env config
    }
  }

  async getActiveConfig(): Promise<{ phoneNumberId: string; accessToken: string; apiUrl: string }> {
    await this.reloadConfig();
    return {
      phoneNumberId: this.phoneNumberId || this.config.get('WHATSAPP_PHONE_NUMBER_ID', ''),
      accessToken:
        this.accessToken ||
        this.config.get('WHATSAPP_API_TOKEN') ||
        this.config.get('WHATSAPP_ACCESS_TOKEN', ''),
      apiUrl: this.apiUrl,
    };
  }

  isConfigured(): boolean {
    return !!(this.phoneNumberId && this.accessToken);
  }

  async testConnection(): Promise<{ success: boolean; message: string; details?: any }> {
    const conf = await this.getActiveConfig();
    if (!conf.phoneNumberId || !conf.accessToken) {
      return {
        success: false,
        message: 'Phone Number ID and Access Token are required to test WhatsApp connection.',
      };
    }

    try {
      const url = `${conf.apiUrl}/${conf.phoneNumberId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${conf.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      const body = (await response.json()) as any;
      if (!response.ok) {
        const errorMsg = body.error?.message || `HTTP ${response.status}`;
        return {
          success: false,
          message: `Meta API error: ${errorMsg}`,
          details: body.error,
        };
      }

      return {
        success: true,
        message: `Connected successfully to WhatsApp Cloud API. Verified Name: "${body.verified_name || 'AWIK NET'}" (${body.display_phone_number || conf.phoneNumberId})`,
        details: body,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Network error connecting to Meta API: ${err.message}`,
      };
    }
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private get messagesUrl(): string {
    return `${this.apiUrl}/${this.phoneNumberId}/messages`;
  }

  private async request<T>(
    url: string,
    options: RequestInit,
    retries = 0,
    maxRetries = 3,
  ): Promise<T> {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.min(1000 * Math.pow(2, retries), 30000);

        if (retries < maxRetries) {
          this.logger.warn(`Rate limited. Retrying in ${waitMs}ms (attempt ${retries + 1}/${maxRetries})`);
          await this.sleep(waitMs);
          return this.request<T>(url, options, retries + 1, maxRetries);
        }
      }

      const body = await response.json();

      if (!response.ok) {
        const apiError = body as WhatsAppApiError;
        const errorMsg = apiError.error?.message || `HTTP ${response.status}`;
        const errorCode = apiError.error?.code || response.status;

        if (response.status === 401) {
          this.logger.error(`WhatsApp API auth failed: ${errorMsg}. Check WHATSAPP_ACCESS_TOKEN.`);
        } else if (response.status === 400) {
          this.logger.error(`WhatsApp API bad request: ${errorMsg}`);
        } else if (response.status === 402) {
          this.logger.error(`WhatsApp API payment required: ${errorMsg}`);
        } else if (response.status >= 500) {
          if (retries < maxRetries) {
            this.logger.warn(`WhatsApp API server error (${response.status}). Retrying...`);
            await this.sleep(Math.min(1000 * Math.pow(2, retries), 15000));
            return this.request<T>(url, options, retries + 1, maxRetries);
          }
        }

        throw new Error(`WhatsApp API error ${errorCode}: ${errorMsg}`);
      }

      return body as T;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('WhatsApp API error')) {
        throw error;
      }
      if (retries < maxRetries) {
        this.logger.warn(`Network error: ${error.message}. Retrying...`);
        await this.sleep(Math.min(1000 * Math.pow(2, retries), 15000));
        return this.request<T>(url, options, retries + 1, maxRetries);
      }
      throw new Error(`WhatsApp API request failed: ${error.message}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) {
      return cleaned.substring(1);
    }
    return cleaned;
  }

  async sendTextMessage(to: string, text: string): Promise<SendResult> {
    const conf = await this.getActiveConfig();
    if (!conf.phoneNumberId || !conf.accessToken) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    const normalizedPhone = this.normalizePhone(to);
    const url = `${conf.apiUrl}/${conf.phoneNumberId}/messages`;
    const headers = {
      'Authorization': `Bearer ${conf.accessToken}`,
      'Content-Type': 'application/json',
    };

    this.logger.log(`Sending text message to ${normalizedPhone}`);

    try {
      const result = await this.request<WhatsAppApiResponse>(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'text',
          text: { preview_url: false, body: text },
        }),
      });

      const messageId = result.messages?.[0]?.id;
      this.logger.log(`Message sent successfully. ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error: any) {
      this.logger.error(`Failed to send text message to ${normalizedPhone}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendTemplateMessage(
    to: string,
    templateName: string,
    language: string,
    variables?: Record<string, string>,
  ): Promise<SendResult> {
    const conf = await this.getActiveConfig();
    if (!conf.phoneNumberId || !conf.accessToken) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    const normalizedPhone = this.normalizePhone(to);
    const url = `${conf.apiUrl}/${conf.phoneNumberId}/messages`;
    const headers = {
      'Authorization': `Bearer ${conf.accessToken}`,
      'Content-Type': 'application/json',
    };

    this.logger.log(`Sending template message "${templateName}" to ${normalizedPhone}`);

    const components: any[] = [];

    if (variables && Object.keys(variables).length > 0) {
      const paramKeys = Object.keys(variables);
      const bodyParams = paramKeys.map((key) => ({
        type: 'text',
        text: variables[key],
      }));

      components.push({
        type: 'body',
        parameters: bodyParams,
      });
    }

    try {
      const result = await this.request<WhatsAppApiResponse>(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            ...(components.length > 0 && { components }),
          },
        }),
      });

      const messageId = result.messages?.[0]?.id;
      this.logger.log(`Template message sent successfully. ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(`Failed to send template to ${normalizedPhone}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendMediaMessage(
    to: string,
    mediaType: 'image' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string,
  ): Promise<SendResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'WhatsApp API not configured' };
    }

    const normalizedPhone = this.normalizePhone(to);

    this.logger.log(`Sending ${mediaType} message to ${normalizedPhone}`);

    const mediaObj: Record<string, any> = { link: mediaUrl };
    if (caption && mediaType !== 'audio') {
      mediaObj.caption = caption;
    }

    try {
      const result = await this.request<WhatsAppApiResponse>(this.messagesUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: normalizedPhone,
          type: mediaType,
          [mediaType]: mediaObj,
        }),
      });

      const messageId = result.messages?.[0]?.id;
      this.logger.log(`${mediaType} message sent successfully. ID: ${messageId}`);
      return { success: true, messageId };
    } catch (error) {
      this.logger.error(`Failed to send ${mediaType} to ${normalizedPhone}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async getMediaUrl(mediaId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;

    try {
      const result = await this.request<{ url: string; mime_type: string; file_length: number }>(
        `${this.apiUrl}/${mediaId}`,
        { method: 'GET', headers: this.headers },
      );
      return result.url;
    } catch (error) {
      this.logger.error(`Failed to get media URL for ${mediaId}: ${error.message}`);
      return null;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    if (!this.isConfigured()) return;

    try {
      await this.request<any>(this.messagesUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        }),
      });
      this.logger.log(`Message ${messageId} marked as read`);
    } catch (error) {
      this.logger.error(`Failed to mark message as read: ${error.message}`);
    }
  }

  async getBusinessProfile(): Promise<any> {
    if (!this.isConfigured()) return null;

    try {
      return await this.request<any>(
        `${this.apiUrl}/${this.phoneNumberId}`,
        { method: 'GET', headers: this.headers },
      );
    } catch (error) {
      this.logger.error(`Failed to get business profile: ${error.message}`);
      return null;
    }
  }
}
