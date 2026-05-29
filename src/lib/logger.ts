import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

// Storage para injetar o correlation_id em todos os logs da requisição atual
export const asyncLocalStorage = new AsyncLocalStorage<Map<string, string>>();

// Configuração base do Pino (Pino-pretty apenas em DEV)
const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: isDev ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  mixin() {
    const store = asyncLocalStorage.getStore();
    if (store && store.has('correlationId')) {
      return { 
        correlationId: store.get('correlationId'),
        tenantId: store.get('tenantId'), // Caso queira injetar qual cliente gerou o log
      };
    }
    return {};
  }
});

/**
 * Função utilitária para envelopar a execução de um Job ou Request
 * injetando o correlationId. Se não for passado, cria um novo (UUID).
 */
export function runWithCorrelationId<T>(correlationId: string | undefined, tenantId: string | undefined, callback: () => T) {
  const store = new Map<string, string>();
  store.set('correlationId', correlationId || uuidv4());
  if (tenantId) store.set('tenantId', tenantId);
  
  return asyncLocalStorage.run(store, callback);
}
