export interface WhatsAppWebhookEntry {
  id: string;
  changes: Array<{
    value: {
      messaging_product: string;
      metadata: {
        display_phone_number: string;
        phone_number_id: string;
      };
      contacts?: Array<{
        profile: { name: string };
        wa_id: string;
      }>;
      messages?: Array<{
        from: string;
        id: string;
        timestamp: string;
        type: string;
        text?: { body: string };
        image?: { id: string; mime_type: string; caption?: string };
        document?: { id: string; mime_type: string; filename?: string; caption?: string };
        audio?: { id: string; mime_type: string };
        button?: { text: string; payload: string };
        interactive?: any;
        referral?: any;
        order?: any;
        system?: any;
      }>;
      statuses?: Array<{
        id: string;
        status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
        timestamp: string;
        recipient_id: string;
        errors?: Array<{
          code: number;
          title: string;
          message: string;
          error_data?: { details: string };
        }>;
      }>;
    };
    field: string;
  }>;
}

export interface WhatsAppWebhookBody {
  object: string;
  entry: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookQuery {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}
