export interface SendMessageOptions {
  delay?: number;
  presence?: 'composing' | 'recording' | 'paused';
}

export interface IWhatsAppProvider {
  /**
   * Envia uma mensagem de texto simples
   */
  sendMessage(instanceName: string, phone: string, text: string, options?: SendMessageOptions): Promise<any>;

  /**
   * Envia uma mídia (imagem, áudio, pdf)
   */
  sendMedia(instanceName: string, phone: string, mediaBase64OrUrl: string, mediaType: string, caption?: string, options?: SendMessageOptions): Promise<any>;

  /**
   * Gera o QR Code para conectar a instância
   */
  getQR(instanceName: string): Promise<{ qrcode: string; pairingCode?: string }>;

  /**
   * Verifica o status da conexão
   */
  checkConnection(instanceName: string): Promise<{ state: string; status: string }>;

  /**
   * Cria uma nova instância na API
   */
  createInstance(instanceName: string, webhookUrl?: string): Promise<any>;

  /**
   * Deleta uma instância existente
   */
  deleteInstance(instanceName: string): Promise<any>;

  /**
   * Reinicia (Desconecta/Reconecta) uma instância
   */
  restartInstance(instanceName: string): Promise<any>;

  /**
   * Obtém as informações gerais/status da instância
   */
  getInstanceStatus(instanceName: string): Promise<any>;
}
