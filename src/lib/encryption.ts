import crypto from 'crypto';
import './env'; // Garante que o env foi carregado

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Utilitário de Criptografia para proteger API Keys no banco de dados.
 * Usa AES-256-GCM. A chave de criptografia deve ter 32 caracteres.
 */
export class SecretsManager {
  private static getKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key || key.length < 32) {
      throw new Error('ENCRYPTION_KEY inválida ou não configurada no .env.local (Deve ter pelo menos 32 caracteres)');
    }
    // Usa os primeiros 32 bytes da chave informada
    return Buffer.from(key.substring(0, 32), 'utf-8');
  }

  /**
   * Criptografa um texto puro.
   * Retorna no formato: enc:<hex_iv>:<hex_auth_tag>:<hex_encrypted_data>
   */
  static encrypt(text: string): string {
    if (!text) return text;
    
    // Se por acaso já estiver criptografado, não criptografa de novo
    if (text.startsWith('enc:')) return text;

    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const key = this.getKey();
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');

      return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err: any) {
      console.error('Erro ao criptografar secret:', err.message);
      throw new Error('Falha na criptografia de segurança.');
    }
  }

  /**
   * Descriptografa um texto.
   * Suporta "Falha Graciosa": se o texto não começar com "enc:", ele devolve o próprio texto puro.
   */
  static decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    // Falha Graciosa: Se for uma API Key velha, apenas devolve ela
    if (!encryptedText.startsWith('enc:')) {
      return encryptedText;
    }

    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 4) throw new Error('Formato inválido');

      const iv = Buffer.from(parts[1], 'hex');
      const authTag = Buffer.from(parts[2], 'hex');
      const encryptedData = parts[3];
      const key = this.getKey();

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (err: any) {
      console.error('Erro ao descriptografar secret:', err.message);
      // Aqui é melhor falhar duro do que vazar lixo, pois a chave pode estar errada
      throw new Error('Falha ao descriptografar a credencial. A ENCRYPTION_KEY foi alterada?');
    }
  }
}
