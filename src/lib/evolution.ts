interface EvolutionConfig {
  baseUrl: string
  apiKey: string
}

export class EvolutionAPI {
  private baseUrl: string
  private apiKey: string

  constructor(config: EvolutionConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '')
    this.apiKey = config.apiKey
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${endpoint}`
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.apiKey,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Evolution API Error: ${response.status} - ${error}`)
    }

    return response.json()
  }

  async createInstance(instanceName: string) {
    return this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
        // Configurações Padrão Solicitadas
        groupsIgnore: false, // Permite gerenciar canais/grupos
        alwaysOnline: true,  // Atualizar status (sempre online)
        readStatus: true,    // Atualizar status (ler status)
        readMessages: true,
        syncFullHistory: false
      }),
    })
  }

  async connectInstance(instanceName: string) {
    return this.request(`/instance/connect/${instanceName}`, {
      method: 'GET',
    })
  }

  async getInstanceStatus(instanceName: string) {
    return this.request(`/instance/connectionState/${instanceName}`, {
      method: 'GET',
    })
  }

  async sendText(instanceName: string, phone: string, text: string) {
    return this.request(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: phone,
        text,
      }),
    })
  }

  async logout(instanceName: string) {
    return this.request(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    })
  }

  async deleteInstance(instanceName: string) {
    return this.request(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    })
  }

  async setSettings(instanceName: string, settings: any) {
    return this.request(`/settings/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(settings),
    })
  }
}

export function createEvolutionClient() {
  return new EvolutionAPI({
    baseUrl: process.env.EVOLUTION_API_URL || 'http://localhost:8080',
    apiKey: process.env.EVOLUTION_API_KEY || '',
  })
}
