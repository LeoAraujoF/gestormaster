export interface SendMessageOptions {
  delay?: number;
  presence?: 'composing' | 'recording' | 'paused';
}

export interface WhatsAppReplyButton {
  id: string;
  displayText: string;
}

export interface WhatsAppButtonsMessage {
  type: 'buttons';
  title: string;
  description?: string;
  footer?: string;
  thumbnailUrl?: string;
  buttons: WhatsAppReplyButton[];
}

export interface WhatsAppListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsAppListMessage {
  type: 'list';
  title: string;
  description?: string;
  footer?: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: WhatsAppListRow[];
  }>;
}

export type WhatsAppInteractiveMessage = WhatsAppButtonsMessage | WhatsAppListMessage;

export interface IWhatsAppProvider {
  /**
   * Envia uma mensagem de texto simples
   */
  sendMessage(instanceName: string, phone: string, text: string, options?: SendMessageOptions): Promise<any>;

  /**
   * Envia botões de resposta rápida (máximo de 3 na Evolution/Baileys).
   */
  sendButtons(instanceName: string, phone: string, message: WhatsAppButtonsMessage, options?: SendMessageOptions): Promise<any>;

  /**
   * Envia uma lista interativa para menus com mais de 3 opções.
   */
  sendList(instanceName: string, phone: string, message: WhatsAppListMessage, options?: SendMessageOptions): Promise<any>;

  /**
   * Envia uma mídia (imagem, áudio, pdf)
   */
  sendMedia(instanceName: string, phone: string, mediaBase64OrUrl: string, mediaType: string, caption?: string, options?: SendMessageOptions): Promise<any>;

  /**
   * Gera o QR Code para conectar a instância
   */
  getQR(instanceName: string): Promise<{
    base64?: string
    code?: string
    qrcode?: string | { base64?: string }
    pairingCode?: string
  }>;

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
