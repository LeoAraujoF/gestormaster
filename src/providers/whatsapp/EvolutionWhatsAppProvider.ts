import { IWhatsAppProvider, SendMessageOptions } from './IWhatsAppProvider';

export class EvolutionWhatsAppProvider implements IWhatsAppProvider {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Normaliza a URL para não ter barra no final
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    this.apiKey = apiKey;
  }

  private async request(endpoint: string, method: string = 'GET', body?: any) {
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

    return response.json();
  }

  async sendMessage(instanceName: string, phone: string, text: string, options?: SendMessageOptions) {
    return this.request(`/message/sendText/${instanceName}`, 'POST', {
      number: phone,
      options: {
        delay: options?.delay || 1200,
        presence: options?.presence || 'composing'
      },
      text
    });
  }

  async sendMedia(instanceName: string, phone: string, mediaBase64: string, mediaType: string, options?: SendMessageOptions) {
    return this.request(`/message/sendMedia/${instanceName}`, 'POST', {
      number: phone,
      options: {
        delay: options?.delay || 1200,
        presence: options?.presence || 'composing'
      },
      mediaMessage: {
        mediatype: mediaType,
        media: mediaBase64
      }
    });
  }

  async getQR(instanceName: string) {
    // Evolution API: Retorna o QR em base64 se a instância estiver pendente
    return this.request(`/instance/connect/${instanceName}`, 'GET');
  }

  async checkConnection(instanceName: string) {
    const data = await this.request(`/instance/connectionState/${instanceName}`, 'GET');
    return {
      state: data.instance?.state || 'unknown',
      status: data.instance?.status || 'unknown'
    };
  }

  async createInstance(instanceName: string, webhookUrl?: string) {
    const payload: any = {
      instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS"
    };
    
    if (webhookUrl) {
      payload.webhook = {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "CALL", "PRESENCE_UPDATE"]
      };
    }
    
    return this.request(`/instance/create`, 'POST', payload);
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
}
