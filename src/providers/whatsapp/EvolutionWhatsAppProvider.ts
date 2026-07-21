import {
  IWhatsAppProvider,
  SendMessageOptions,
  WhatsAppButtonsMessage,
  WhatsAppListMessage,
} from './IWhatsAppProvider';

type EvolutionQrResponse = {
  base64?: string
  code?: string
  qrcode?: string | { base64?: string }
}

type EvolutionCreateResponse = {
  qrcode?: { base64?: string }
  hash?: { qrcode?: string }
}

type EvolutionConnectionResponse = {
  instance?: { state?: string; status?: string }
}

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Normaliza a URL para não ter barra no final
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T = Record<string, unknown>>(endpoint: string, method: string = 'GET', body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API Error [${response.status}]: ${errorText}`);
    }

    return response.json() as Promise<T>;
  }

  async sendMessage(instanceName: string, phone: string, text: string, options?: SendMessageOptions) {
    return this.request(`/message/sendText/${instanceName}`, 'POST', {
      number: phone,
      options: {
        delay: options?.delay || 1200,
        presence: options?.presence || 'composing'
      },
      text: text,
      textMessage: {
        text: text
      }
    });
  }

  async sendButtons(instanceName: string, phone: string, message: WhatsAppButtonsMessage, options?: SendMessageOptions) {
    if (message.buttons.length === 0 || message.buttons.length > 3) {
      throw new Error('Mensagens interativas exigem de 1 a 3 botões de resposta.');
    }

    return this.request(`/message/sendButtons/${instanceName}`, 'POST', {
      number: phone,
      title: message.title,
      description: message.description,
      footer: message.footer,
      thumbnailUrl: message.thumbnailUrl,
      delay: options?.delay || 1200,
      buttons: message.buttons.map((button) => ({
        type: 'reply',
        id: button.id,
        displayText: button.displayText,
      })),
    });
  }

  async sendList(instanceName: string, phone: string, message: WhatsAppListMessage, options?: SendMessageOptions) {
    const rowCount = message.sections.reduce((total, section) => total + section.rows.length, 0);
    if (!message.sections.length || rowCount === 0) {
      throw new Error('A mensagem de lista precisa ter ao menos uma opção.');
    }
    if (rowCount > 10) {
      throw new Error('A mensagem de lista aceita no máximo 10 opções.');
    }

    return this.request(`/message/sendList/${instanceName}`, 'POST', {
      number: phone,
      title: message.title,
      description: message.description,
      footerText: message.footer || 'Responda pelo número se a lista não aparecer.',
      buttonText: message.buttonText,
      delay: options?.delay || 1200,
      sections: message.sections.map((section) => ({
        title: section.title,
        rows: section.rows.map((row) => ({
          title: row.title,
          description: row.description || '',
          rowId: row.id,
        })),
      })),
    });
  }

  async sendMedia(instanceName: string, phone: string, mediaBase64OrUrl: string, mediaType: string, caption?: string, options?: SendMessageOptions) {
    return this.request(`/message/sendMedia/${instanceName}`, 'POST', {
      number: phone,
      options: {
        delay: options?.delay || 1200,
        presence: options?.presence || 'composing'
      },
      mediatype: mediaType,
      media: mediaBase64OrUrl,
      caption: caption || undefined
    });
  }

  async getQR(instanceName: string) {
    // Evolution API: Retorna o QR em base64 se a instância estiver pendente
    return this.request<EvolutionQrResponse>(`/instance/connect/${instanceName}`, 'GET');
  }

  async checkConnection(instanceName: string) {
    const data = await this.request<EvolutionConnectionResponse>(`/instance/connectionState/${instanceName}`, 'GET');
    return {
      state: data.instance?.state || 'unknown',
      status: data.instance?.status || 'unknown'
    };
  }

  async createInstance(instanceName: string, webhookUrl?: string, webhookSecret?: string, webhookToken?: string) {
    const payload: Record<string, unknown> = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    };

    if (webhookUrl) {
      payload.webhook = {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "CALL", "PRESENCE_UPDATE"],
        ...((webhookSecret || webhookToken) ? {
          headers: {
            ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
            ...(webhookToken ? { "x-webhook-token": webhookToken } : {}),
          },
        } : {})
      };
    }

    return this.request<EvolutionCreateResponse>(`/instance/create`, 'POST', payload);
  }

  async setWebhook(instanceName: string, webhookUrl: string, webhookSecret?: string, webhookToken?: string) {
    const payload: Record<string, unknown> = {
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "CALL", "PRESENCE_UPDATE"],
        ...((webhookSecret || webhookToken) ? {
          headers: {
            ...(webhookSecret ? { "x-webhook-secret": webhookSecret } : {}),
            ...(webhookToken ? { "x-webhook-token": webhookToken } : {}),
          },
        } : {})
      }
    };
    return this.request(`/webhook/set/${instanceName}`, 'POST', payload);
  }

  async deleteInstance(instanceName: string) {
    return this.request(`/instance/delete/${instanceName}`, 'DELETE');
  }

  async restartInstance(instanceName: string) {
    return this.request(`/instance/restart/${instanceName}`, 'PUT');
  }

  async getInstanceStatus(instanceName: string) {
    return this.request(`/instance/fetchInstances?instanceName=${instanceName}`, 'GET');
  }

  async fetchAllInstances() {
    return this.request(`/instance/fetchInstances`, 'GET');
  }
}
